---
name: Notifications generation design
description: Why notifications use soft-dismiss + dedupe keys, and the invariants to preserve.
---

Notifications are generated on-demand during `GET /notifications` (contract expiring ≤60 days, expected revenue reports per period), deduped by `dedupeKey`.

Invariants:
- "Clear all" must SOFT-dismiss (`dismissed=true`), never delete — deleting rows removes the dedupe keys and the same alerts regenerate on the next fetch (was a real bug).
- DB-level uniqueness on `(user_id, dedupe_key)` + `onConflictDoNothing` guards concurrent GETs; app-level key checks alone are racy.
- Retention: dismissed generated rows older than 90 days are hard-deleted at generation time to bound growth; keep some retention if changing this, or old dedupe keys regrow forever.

**How to apply:** any new notification type must set a stable dedupeKey encoding entity + period, and must respect the soft-dismiss/clear semantics.
