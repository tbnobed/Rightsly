---
name: Contact email identity
description: Concurrency and normalization rules for preventing duplicate directory contacts.
---

Treat a canonical email address as the contact directory's write-time identity. Every create path, email-changing update, and legacy import approval must use the same normalization, advisory lock key, and duplicate lookup before persisting.

**Why:** Source-specific idempotency prevents the same import row from being written twice, but it does not prevent a manual writer or another source row from concurrently creating the same person. Slight punctuation or case differences can also bypass locks unless normalization is shared.

**How to apply:** When adding any contact writer, normalize before validation and storage, acquire the canonical-email transaction lock, recheck duplicates under that lock, and keep import source keys as a separate rerun safeguard.