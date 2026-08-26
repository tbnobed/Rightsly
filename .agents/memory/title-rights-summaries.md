---
name: Title rights summaries
description: Boundary between title-level operational rights metadata and authoritative contract rights.
---

Title-level Broadcast, Digital, International, and YouTube durations—and International broadcast-air amount—are optional operational summaries. They must remain independent from contract terms, territories, platforms, rights direction, and Rights Check logic.

For duration units, selecting Blank reveals a custom-term input for values such as Weeks, Days, or Hours. A custom term is stored separately from the standard enum; only In Perpetuity disables and clears the number.

**Why:** A title may need a quick operational summary while multiple contracts remain the authoritative source for legal scope. Inferring or synchronizing the summary from contracts can collapse conflicting grants and make Rights Check results unreliable.

**How to apply:** New title workflows may display or edit these summary fields, but contract imports, contract updates, and rights availability calculations must not backfill or consume them unless a future product decision explicitly defines reconciliation rules.