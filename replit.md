# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

## Deployment (Ubuntu server / self-hosted)

Authentik OIDC SSO and SendGrid email are configured entirely via environment
variables (no Replit-specific APIs), so the same build runs on the customer's
Ubuntu server.

### Required environment variables

App base URL (used to build SSO redirect URIs and email links):

- `APP_BASE_URL` — public base URL of the app, e.g. `https://rights.example.com`.
  In Replit dev it falls back to `https://$REPLIT_DEV_DOMAIN`, else
  `http://localhost:5000`.

Authentik OIDC SSO (all three required to enable SSO; SSO is disabled if any are
missing):

- `AUTHENTIK_ISSUER_URL` — OIDC issuer, e.g.
  `https://auth.example.com/application/o/tbn-rights/`
- `AUTHENTIK_CLIENT_ID`
- `AUTHENTIK_CLIENT_SECRET`

SendGrid email (both required to enable email; emails are a no-op if missing):

- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL` — verified sender address.

### Authentik application configuration

Register this redirect URI in the Authentik provider:

- `${APP_BASE_URL}/api/auth/sso/callback`
  (e.g. `https://rights.example.com/api/auth/sso/callback`)

Scopes requested: `openid profile email`. New SSO users are auto-provisioned
with the `sales` role and cannot use password login.

### Notes

- The Express API sets `trust proxy` and issues SSO cookies as `secure` when
  `APP_BASE_URL` is `https://`. Run behind HTTPS in production (nginx/Caddy).
- Existing secrets `JWT_SECRET` / `DATABASE_URL` still apply.
