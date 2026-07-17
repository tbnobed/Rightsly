---
name: SSO + email design
description: Authentik OIDC SSO and SendGrid email — env-var contract and security decisions
---

# Authentik SSO + SendGrid email

All config is env-var driven (customer deploys on their own Ubuntu server; no Replit-specific APIs).

- SSO enabled iff AUTHENTIK_ISSUER_URL + AUTHENTIK_CLIENT_ID + AUTHENTIK_CLIENT_SECRET all set; email iff SENDGRID_API_KEY + SENDGRID_FROM_EMAIL. Frontend hides SSO button when `GET /api/auth/sso/config` says disabled.
- **JWT never in a URL.** Callback redirects with a one-time 60s code (`/login?sso_code=...`); frontend strips it from history then redeems via `POST /api/auth/sso/exchange`. **Why:** query-string tokens leak via logs/referrer/history (code-review finding). Codes live in an in-memory Map — fine for the single-process Express server; would need a shared store if ever multi-process.
- **Auto-provisioning fails closed.** Unknown SSO users are created (role `sales`) only when `SSO_AUTO_PROVISION=true`, optionally domain-restricted via `SSO_ALLOWED_DOMAINS`. Otherwise redirect `?sso_error=not_provisioned`. **Why:** trusting any IdP-authenticated email silently expands access if the IdP app assignment is misconfigured.
- SSO redirect surfaces send `Referrer-Policy: no-referrer` + `Cache-Control: no-store`.
- Redirect URI to register in Authentik: `${APP_BASE_URL}/api/auth/sso/callback`; scopes `openid profile email`.
- User declined to provide the Authentik/SendGrid values in-session (July 2026) — feature verified in disabled/fallback mode only; real IdP round-trip untested.
