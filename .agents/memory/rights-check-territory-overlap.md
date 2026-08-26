---
name: Rights Check territory overlap
description: Conservative overlap semantics for Global and normalized territory queries
---
Rights Check must interpret territory questions conservatively.

**Rule:** A Global request overlaps every territorial grant; a Global or empty
grant overlaps every request; specific territory matching is case-insensitive
and whitespace-normalized. Custom territory text participates after splitting
common separators. Distribution types are normalized the same way.

**Why:** Exact string matching returned a false all-clear for Global and
lowercase requests even when an active exclusive US grant existed.

**How to apply:** Any new Rights Check matching path must use the shared
normalization/overlap helper and preserve regression tests for Global and
case-insensitive requests.