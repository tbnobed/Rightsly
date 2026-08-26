---
name: Root-mounted Express routers
description: Middleware ordering hazard when child routers are mounted at the API root
---
**Rule:** Mount signed or intentionally unauthenticated root-level routes before
any root-mounted child router that installs authentication with `router.use`.

**Why:** Express continues through a mounted child router's middleware even when
none of that child's endpoint paths match. A child router mounted at `/` can
therefore authenticate and reject requests intended for a later root-mounted
router; a signed upload PUT returned 401 until the storage router moved earlier.

**How to apply:** When adding a child router at `/`, inspect it for router-wide
middleware and verify the order of every other root mount. Prefer explicit mount
prefixes where practical, and smoke-test unauthenticated or signature-authenticated
routes through the bundled server rather than only testing route helpers.