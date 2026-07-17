import crypto from "node:crypto";
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

// One-time login codes: the SSO callback never puts the JWT in a URL.
// Instead it issues a short-lived random code the frontend exchanges via POST.
const SSO_CODE_TTL_MS = 60_000;
const ssoLoginCodes = new Map<string, { token: string; expiresAt: number }>();

function issueSsoLoginCode(token: string): string {
  // Opportunistic cleanup of expired codes
  const now = Date.now();
  for (const [k, v] of ssoLoginCodes) {
    if (v.expiresAt <= now) ssoLoginCodes.delete(k);
  }
  const code = crypto.randomBytes(32).toString("base64url");
  ssoLoginCodes.set(code, { token, expiresAt: now + SSO_CODE_TTL_MS });
  return code;
}

function redeemSsoLoginCode(code: string): string | null {
  const entry = ssoLoginCodes.get(code);
  if (!entry) return null;
  ssoLoginCodes.delete(code);
  if (entry.expiresAt <= Date.now()) return null;
  return entry.token;
}

// Auto-provisioning policy (fail closed):
// - SSO_AUTO_PROVISION=true must be set for unknown users to be created.
// - SSO_ALLOWED_DOMAINS (comma-separated) optionally restricts which email
//   domains may auto-provision. Empty/unset with auto-provision on = any domain.
function autoProvisionAllowed(email: string): boolean {
  if ((process.env.SSO_AUTO_PROVISION || "").toLowerCase() !== "true") {
    return false;
  }
  const domains = (process.env.SSO_ALLOWED_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (domains.length === 0) return true;
  const domain = email.split("@")[1] || "";
  return domains.includes(domain);
}

// Defense-in-depth headers for auth redirect surfaces
function setNoStoreHeaders(res: {
  setHeader: (name: string, value: string) => void;
}) {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
}
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
  setNoStoreHeaders(res);
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
  setNoStoreHeaders(res);
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
      if (!autoProvisionAllowed(email)) {
        logger.warn(
          { email },
          "SSO login rejected: user not provisioned and auto-provisioning not allowed"
        );
        res.redirect(`${appBaseUrl()}/login?sso_error=not_provisioned`);
        return;
      }
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

    const code = issueSsoLoginCode(token);
    res.redirect(`${appBaseUrl()}/login?sso_code=${encodeURIComponent(code)}`);
  } catch (err) {
    logger.error({ err }, "SSO callback failed");
    res.redirect(`${appBaseUrl()}/login?sso_error=sso_failed`);
  }
});

// POST /api/auth/sso/exchange — redeem a one-time login code for a JWT.
router.post("/sso/exchange", (req, res) => {
  setNoStoreHeaders(res);
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  const token = code ? redeemSsoLoginCode(code) : null;
  if (!token) {
    res.status(400).json({ message: "Invalid or expired login code" });
    return;
  }
  res.json({ token });
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
