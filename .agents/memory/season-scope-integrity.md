---
name: Content-scope integrity
description: Why contract-referenced titles and seasons must not disappear implicitly.
---

Never delete a title or season while a contract references it.

**Why:** Deleting a referenced title or orphaning its link erases whole-title rights checks. Cascading away the final season-scope row silently broadens a season-only agreement to every season.

**How to apply:** Keep title and season FKs restrictive, and serialize reference checks plus mutations with concurrent contract-scope writes. Any force-delete workflow must resolve affected contract links in the same transaction.