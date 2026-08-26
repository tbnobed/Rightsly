---
name: Rights Check scope semantics
description: Directional acquisition containment, conflict overlap, and canonical end-to-end rights vocabulary
---
Rights Check must interpret territory questions conservatively.

**Rule:** Exclusive Rights Out conflict checks use symmetric overlap: a Global
request overlaps every grant, and a Global or empty grant overlaps every
request. Rights In acquisition checks are directional: the incoming grant must
contain the complete requested territory and distribution scope. A country or
distribution subtype cannot cover a region, Global, or a parent distribution
request. Specific matching is normalized, and structured territory and
distribution fields must reject unknown values.

**Why:** Exact string matching returned false all-clears for conflicting Global
and lowercase requests. Reusing overlap for acquisition also creates false
approvals: a US-only inbound grant overlaps a Global request but does not cover
it. Alias drift can also make stored rights disappear from edit forms.

**How to apply:** Choose the matcher by direction: overlap for Rights Out
conflicts, containment for Rights In coverage. Preserve regression tests for
Global, regions, distribution parents, and case normalization. Keep canonical
stored values identical end to end; labels may differ, stored values may not.