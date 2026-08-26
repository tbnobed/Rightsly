#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run preflight
pnpm --filter @workspace/db run push-force
pnpm --filter @workspace/db run preflight
