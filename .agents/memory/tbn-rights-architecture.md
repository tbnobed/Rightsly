---
name: TBN Rights MVP architecture
description: Key decisions, constraints, and patterns for the TBN Rights Management app
---

## Stack
- Frontend: React + Vite — `artifacts/tbn-rights` at previewPath `/`
- Backend: Express 5 + TypeScript — `artifacts/api-server` (port 8080)
- DB: Drizzle ORM + PostgreSQL (`lib/db`)
- Codegen: OpenAPI spec → Orval → React Query hooks + Zod (`lib/api-spec`, `lib/api-client-react`, `lib/api-zod`)
- Auth: JWT (jsonwebtoken) + bcrypt — JWT stored in localStorage as `auth_token`

## Auth flow
- Frontend calls `setAuthTokenGetter(() => localStorage.getItem('auth_token'))` from `@workspace/api-client-react` in `AuthContext` — wires Bearer token to every API call automatically
- Login → `useLogin` mutation → store token → redirect to `/`
- Auth guard in `AuthProvider` redirects to `/login` if no token and not loading

## Vite proxy (critical for dev)
- `vite.config.ts` has `server.proxy = { '/api': { target: 'http://localhost:8080', changeOrigin: true } }`
- Without this, frontend fetch calls to `/api/*` would hit the wrong port

## OpenAPI codegen quirks
- Schema titles must be `Api` (Orval filename requirement)
- `LoginRequest`/`LoginResponse` renamed to `LoginInput`/`LoginData` — Orval generates both a Zod schema and TS type with same PascalCase name, causing TS2308 barrel collision
- `format: email` must NOT be used — Zod v4 has no `z.email()`
- Multipart bodies must use `$ref` not inline schema to avoid name collisions
- `lib/api-zod/tsconfig.json` needs `"lib": ["esnext", "dom"]` for File/Blob types

## Seed credentials (development only)
- admin@tbn.org / Admin1234!
- legal@tbn.org / Legal1234!
- finance@tbn.org / Finance1234!
- sales@tbn.org / Sales1234!

Run seed: `pnpm --filter @workspace/api-server run seed`

## Route structure (api-server)
- `/api/auth` — login/logout/me (public login, rest authenticated)
- `/api/users` — admin only
- `/api/partners` — all authenticated; write = admin/legal; delete = admin
- `/api/contracts` — read = all; write = admin/legal; delete = admin
- `/api/contracts/:id/amendments` — read = all; write = admin/legal
- `/api/contracts/:id/revenue-reports` — read = all; write = admin/finance
- `/api/revenue-reports` — admin/finance only
- `/api/royalties` — admin/finance only
- `/api/content` — read = all; write = admin/legal; delete = admin
- `/api/content/:id/contracts` — all authenticated
- `/api/rights-check` — all authenticated
- `/api/dashboard` — all authenticated
- `/api/audit-logs` — admin only
- `/api/import/template` + `/api/import/contracts` — admin/legal
- `/api/reports/contracts` + `/api/reports/expiring` + `/api/reports/royalties` — contracts/expiring = all; royalties = admin/finance

## DB schema files
All in `lib/db/src/schema/` — users, partners, content, contracts, revenue, audit
Exported from `lib/db/src/schema/index.ts`

**Why:** JWT chosen explicitly by user over session auth. Drizzle chosen over Prisma because monorepo template uses Drizzle.
