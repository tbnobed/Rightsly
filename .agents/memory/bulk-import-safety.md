---
name: Bulk-import safety
description: Durable rules for staged Rightsly migrations, reruns, provenance, and content linking.
---

Bulk imports must validate before execution, persist source provenance, and use a stable source key so reruns skip records instead of duplicating them. Rows marked `review` or `skip` are retained in the migration file but never written.

**Why:** Legacy trackers mix contracts with operational notes, incomplete dates, unsupported territories, and repeated content references. Guessing these values can silently broaden rights, while non-idempotent reruns duplicate contracts.

**How to apply:** Treat only validated `import` rows as writable. Resolve content titles and seasons using normalized exact matches with ambiguity detection; preserve unmatched source scope in provenance/notes rather than creating or widening rights.