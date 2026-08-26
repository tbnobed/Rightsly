---
name: Rights Check territory overlap
description: Conservative overlap semantics and canonical end-to-end rights vocabulary
---
Rights Check must interpret territory questions conservatively.

**Rule:** A Global request overlaps every territorial grant; a Global or empty
grant overlaps every request; specific territory matching is case-insensitive
and whitespace-normalized. Custom territory text participates after splitting
common separators. Distribution types are normalized the same way. UI controls,
API writes, and API reads must use the same canonical values; legacy aliases
must be normalized before an edit form hydrates.

**Why:** Exact string matching returned a false all-clear for Global and
lowercase requests even when an active exclusive US grant existed. Alias values
that differed between UI and API storage also made saved rights look unchecked
on edit, risking accidental changes.

**How to apply:** Any new Rights Check matching path must use the shared
normalization/overlap helper and preserve regression tests for Global and
case-insensitive requests. When adding vocabulary entries, keep canonical values
identical end to end; labels may differ, stored values may not.