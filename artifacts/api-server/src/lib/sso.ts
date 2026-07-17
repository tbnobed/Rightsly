import * as client from "openid-client";

/**
 * Authentik OIDC SSO integration.
 *
 * All configuration is provided via environment variables so the app runs both
 * in Replit dev and on the customer's Ubuntu server (no Replit-specific APIs).
 *
 * Required env vars for SSO:
 *   - AUTHENTIK_ISSUER_URL   e.g. https://auth.example.com/application/o/tbn-rights/
 *   - AUTHENTIK_CLIENT_ID
 *   - AUTHENTIK_CLIENT_SECRET
 *
 * Optional:
 *   - APP_BASE_URL           public base URL of the app, e.g. https://rights.example.com
 *                            In dev, falls back to https://$REPLIT_DEV_DOMAIN if set,
 *                            otherwise http://localhost:5000.
 */

const AUTHENTIK_ISSUER_URL = process.env.AUTHENTIK_ISSUER_URL;
const AUTHENTIK_CLIENT_ID = process.env.AUTHENTIK_CLIENT_ID;
const AUTHENTIK_CLIENT_SECRET = process.env.AUTHENTIK_CLIENT_SECRET;

export function appBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/+$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:5000";
}

export function redirectUri(): string {
  return `${appBaseUrl()}/api/auth/sso/callback`;
}

export function ssoEnabled(): boolean {
  return Boolean(
    AUTHENTIK_ISSUER_URL && AUTHENTIK_CLIENT_ID && AUTHENTIK_CLIENT_SECRET,
  );
}

let configPromise: Promise<client.Configuration> | null = null;

export function getSsoConfig(): Promise<client.Configuration> {
  if (!ssoEnabled()) {
    return Promise.reject(new Error("SSO is not configured"));
  }
  if (!configPromise) {
    configPromise = client
      .discovery(
        new URL(AUTHENTIK_ISSUER_URL as string),
        AUTHENTIK_CLIENT_ID as string,
        AUTHENTIK_CLIENT_SECRET as string,
      )
      .catch((err) => {
        // Reset so a later request can retry discovery
        configPromise = null;
        throw err;
      });
  }
  return configPromise;
}

export { client };
