import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, authenticateToken } from "../lib/auth";
import { logAudit } from "../lib/audit";
import {
  ssoEnabled,
  getSsoConfig,
  redirectUri,
  appBaseUrl,
  client,
} from "../lib/sso";
import { sendWelcomeEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();

const PKCE_COOKIE = "sso_pkce_verifier";
const STATE_COOKIE = "sso_state";
const SSO_COOKIE_MAX_AGE = 10 * 60 * 1000; // 10 minutes

function ssoCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: appBaseUrl().startsWith("https://"),
    maxAge: SSO_COOKIE_MAX_AGE,
    path: "/",
  };
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user || !user.isActive) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  // Update last login
  await db
    .update(usersTable)
    .set({ lastLogin: new Date() })
    .where(eq(usersTable.id, user.id));

  const token = signToken({ userId: user.id, role: user.role });

  await logAudit({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.isActive },
    action: "login",
    entityType: "user",
    entityId: user.id,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
    },
  });
});

// GET /api/auth/sso/config
router.get("/sso/config", (_req, res) => {
  res.json({ enabled: ssoEnabled() });
});

// GET /api/auth/sso/login
router.get("/sso/login", async (req, res) => {
  if (!ssoEnabled()) {
    res.status(404).json({ message: "SSO is not configured" });
    return;
  }

  try {
    const config = await getSsoConfig();

    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();

    res.cookie(PKCE_COOKIE, codeVerifier, ssoCookieOptions());
    res.cookie(STATE_COOKIE, state, ssoCookieOptions());

    const authorizationUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri(),
      scope: "openid profile email",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    });

    res.redirect(authorizationUrl.href);
  } catch (err) {
    logger.error({ err }, "SSO login initiation failed");
    res.redirect(`${appBaseUrl()}/login?sso_error=sso_failed`);
  }
});

// GET /api/auth/sso/callback
router.get("/sso/callback", async (req, res) => {
  if (!ssoEnabled()) {
    res.status(404).json({ message: "SSO is not configured" });
    return;
  }

  const pkceVerifier = req.cookies?.[PKCE_COOKIE];
  const expectedState = req.cookies?.[STATE_COOKIE];

  // Clear the short-lived cookies regardless of outcome
  res.clearCookie(PKCE_COOKIE, { path: "/" });
  res.clearCookie(STATE_COOKIE, { path: "/" });

  try {
    if (!pkceVerifier || !expectedState) {
      throw new Error("Missing PKCE verifier or state cookie");
    }

    const config = await getSsoConfig();

    // Express is behind a proxy; reconstruct the current URL from the public
    // base URL + originalUrl so the query params (code, state) are preserved.
    const currentUrl = new URL(`${appBaseUrl()}${req.originalUrl}`);

    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: pkceVerifier,
      expectedState,
    });

    const claims = tokens.claims();
    if (!claims) {
      throw new Error("No ID token claims returned");
    }

    const email =
      typeof claims.email === "string" ? claims.email.toLowerCase().trim() : "";
    if (!email) {
      throw new Error("No email claim returned from identity provider");
    }

    const claimName =
      (typeof claims.name === "string" && claims.name) ||
      (typeof claims.preferred_username === "string" &&
        claims.preferred_username) ||
      "";

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    let user = existing;

    if (user) {
      if (!user.isActive) {
        res.redirect(`${appBaseUrl()}/login?sso_error=account_disabled`);
        return;
      }

      await db
        .update(usersTable)
        .set({ lastLogin: new Date() })
        .where(eq(usersTable.id, user.id));
    } else {
      // Auto-provision a new user. They cannot password-login: their password
      // hash is a bcrypt of a random UUID.
      const randomPassword = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(randomPassword, 10);
      const name = claimName || email.split("@")[0] || email;

      const inserted = await db
        .insert(usersTable)
        .values({
          id: crypto.randomUUID(),
          email,
          name,
          role: "sales",
          passwordHash,
          isActive: true,
        })
        .returning();
      user = inserted[0];

      await logAudit({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isActive: user.isActive,
        },
        action: "create",
        entityType: "user",
        entityId: user.id,
      });

      // Fire-and-forget welcome email (no-op if SendGrid is not configured).
      void sendWelcomeEmail({ email: user.email, name: user.name });
    }

    const token = signToken({ userId: user.id, role: user.role });

    await logAudit({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
      },
      action: "login",
      entityType: "user",
      entityId: user.id,
    });

    res.redirect(`${appBaseUrl()}/login?sso_token=${encodeURIComponent(token)}`);
  } catch (err) {
    logger.error({ err }, "SSO callback failed");
    res.redirect(`${appBaseUrl()}/login?sso_error=sso_failed`);
  }
});

// POST /api/auth/logout
router.post("/logout", authenticateToken, async (req, res) => {
  await logAudit({
    user: req.user,
    action: "logout",
    entityType: "user",
    entityId: req.user?.id,
  });
  res.json({ message: "Logged out successfully" });
});

// GET /api/auth/me
router.get("/me", authenticateToken, async (req, res) => {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      lastLogin: usersTable.lastLogin,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json(user);
});

export default router;
