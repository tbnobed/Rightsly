---
name: api-server esbuild bundling quirks
description: Packages that break when bundled into artifacts/api-server dist
---
The api-server is bundled with esbuild (`node ./build.mjs`, external list in build.mjs).

**Rule:** pdfkit must stay in the `external` list — it reads `.afm` font metric files relative to its own `__dirname`, so bundling makes it look for `dist/data/Helvetica.afm` and crash. It also requires `@swc/helpers` as a real dependency of api-server (subpath require at runtime; already externalized via `@swc/*`).

**How to apply:** when adding a new runtime dep to api-server, if it loads sibling data files or native bits, add it to `external` in `artifacts/api-server/build.mjs` and verify with a curl hit after workflow restart — a passing `node ./build.mjs` does NOT catch these runtime failures.
