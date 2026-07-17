---
name: Orval list-hook call convention
description: How generated list hooks must be called in the tbn-rights frontend; a wrong single-arg pattern silently breaks server-side filtering.
---

Generated list hooks from `@workspace/api-client-react` have signature `useListX(params, options)`.

**Rule:** hoist filter params into a variable and pass them BOTH as the first argument and into the query key: `useListX(params, { query: { queryKey: getListXQueryKey(params) } })`.

**Why:** Pages once passed `{ query: { queryKey: getXQueryKey(params) } }` as the *first* argument — params were baked into the queryKey but never sent to the server, so all server-side filters silently no-oped (caught by e2e, matched the long-standing tsc "'query' does not exist in ListXParams" errors). Fixed app-wide July 2026; tsc is now at zero errors — keep it there.

**How to apply:** any new page using a generated list hook must follow the two-arg pattern; treat a new "'query' does not exist" tsc error as a real bug, not debt.
