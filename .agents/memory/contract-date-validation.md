---
name: Contract date validation
description: Shared date-range invariant across contract forms, API writes, and CSV imports
---
Contract term dates must be validated at every write boundary.

**Rule:** For date-bounded contracts, end date is required and must be on or
after start date. Dates must be real `YYYY-MM-DD` calendar values. Partial
updates validate the merged existing and incoming values, not only fields in
the request.

**Why:** UI creation and CSV import both accepted an end date before the start
date, producing active but logically impossible contracts.

**How to apply:** Keep the shared server validator on create, update, and CSV
import paths. Client validation improves feedback but never replaces the
server invariant.