# Rightsli — multi-stage Docker build
# Build context must be the repository root:
#   docker build -f deploy/Dockerfile --target api -t rightsli-api .
#   docker build -f deploy/Dockerfile --target web -t rightsli-web .

# ---------------------------------------------------------------------------
# Stage 1: install workspace dependencies
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS deps
RUN corepack enable
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts

# Skip the 1-day minimum-release-age gate for reproducible lockfile installs
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: build API server (esbuild bundle) and frontend (vite)
# ---------------------------------------------------------------------------
FROM deps AS build
ARG BASE_PATH=/
# PORT is only needed to satisfy the vite config's dev-server check at build time
ENV NODE_ENV=production BASE_PATH=${BASE_PATH} PORT=3000

RUN pnpm --filter @workspace/api-server run build \
 && pnpm --filter @workspace/tbn-rights run build

# Pruned production node_modules for the API (covers esbuild externals such
# as @google-cloud/storage that are not bundled into dist/index.mjs)
RUN pnpm --filter @workspace/api-server --prod deploy /out/api

# ---------------------------------------------------------------------------
# Target: api — Express API server
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /out/api/node_modules ./node_modules
COPY --from=build /out/api/package.json ./package.json
COPY --from=build /app/artifacts/api-server/dist ./dist

RUN useradd -m app && chown -R app /app
USER app

EXPOSE 8080
ENV PORT=8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]

# ---------------------------------------------------------------------------
# Target: db-tools — full workspace, used to push the Drizzle schema
#   docker compose --profile setup run --rm db-push
# ---------------------------------------------------------------------------
FROM deps AS db-tools
CMD ["pnpm", "--filter", "@workspace/db", "run", "push-force"]

# ---------------------------------------------------------------------------
# Target: web — nginx serving the built SPA and proxying /api
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/artifacts/tbn-rights/dist/public /usr/share/nginx/html
EXPOSE 80
