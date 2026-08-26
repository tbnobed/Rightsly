# Rightsly — QA Bug Report

**Tested:** Aug 25, 2026 · https://rightsly.obtv.io · Admin User (admin@tbn.org)
**Scope:** Full walkthrough — Dashboard, Contracts, Partners, Content Catalog, Rights Check, Royalties, Reports, Import, Audit Log, Users
**Method:** UI interaction + direct API verification. Every item below was reproduced at least twice.

Items are ordered by severity. Each has repro steps, observed vs. expected, and a suggested fix location.

---

## P0 — Critical (core function is wrong or unusable)

### R-01 · Rights Check returns a false "available" for Global territory queries
**Severity:** Critical — this is the product's primary function returning an unsafe answer.

**Repro**
1. Create a Rights Out contract: partner `Streamly Networks`, status `Active`, term `2026-01-01` → `2027-12-31`, territory `US`, distribution `SVOD`, exclusivity `Exclusive`, linked title `VeggieTales`.
2. Go to Rights Check. Select title `VeggieTales`, territory `Global`, distribution `SVOD`, date `2026-08-26`.
3. Click Verify Availability.

**Observed:** Green banner — "Rights Available / Clear title. No existing grants or conflicts found."
**Expected:** Rights Conflict. A Global request necessarily includes US, so it must collide with the US exclusive.

Selecting territory `United States` for the identical query *does* correctly return the conflict, which isolates the defect to territory matching.

**Root cause:** Territory comparison is exact string equality. There is no containment/hierarchy model, so `Global` never matches a grant tagged `US`.

**Fix**
- Introduce a territory hierarchy (e.g. `Global` ⊃ `Europe`/`Latin America`/… ⊃ country codes) and make the conflict test `requested ∩ granted ≠ ∅` under that hierarchy, in both directions:
  - request `Global` vs grant `US` → conflict
  - request `US` vs grant `Global` → conflict
- Same containment logic is needed for distribution types if any grouping exists (see R-13).
- **Location:** the handler behind `GET /api/rights-check`.

---

### R-02 · Territory matching is case-sensitive
**Severity:** Critical — silent false negative on the same endpoint as R-01.

**Repro** (same seed data as R-01)
```
GET /api/rights-check?territory=US&distributionType=SVOD&date=2026-08-26&contentItemId=<VeggieTales>
  → { "available": false, ... }   ✅ correct

GET /api/rights-check?territory=us&distributionType=SVOD&date=2026-08-26&contentItemId=<VeggieTales>
  → { "available": true }         ❌ wrong
```

**Expected:** Identical result regardless of case.

**Fix:** Normalize (uppercase/trim) both the request parameter and the stored `territories[]` values before comparison. Do the same for `distributionType`. Ideally normalize on write as well so stored data is canonical.

---

### R-03 · "Edit Contract" button does nothing
**Severity:** Critical — contracts are immutable once created, and there is no delete anywhere in the app.

**Repro**
1. Open any contract detail page (`/contracts/:id`).
2. Click **Edit Contract** (top right).

**Observed:** Nothing. No navigation, no modal, no network request. Confirmed by dispatching `.click()` programmatically — `document.querySelectorAll('[role=dialog]').length === 0`, URL unchanged, no XHR fired. The element is `<button type="submit">` with no handler and no `href`.
**Expected:** Opens the contract edit form prefilled with current values, or navigates to `/contracts/:id/edit`.

**Fix:** Wire the button. Either route to an edit view or reuse the New Contract form in edit mode (`PATCH /api/contracts/:id`). Note this button is `type="submit"` and not inside a form — should be `type="button"`. The same is true of the **Archive** button, though that one is wired correctly.

**Blocks:** R-04 (no way to correct a bad contract once saved).

---

### R-04 · End date before start date is accepted with no validation
**Severity:** Critical — creates permanently corrupt records (unfixable because of R-03).

**Repro A — UI**
1. New Contract → Rights Out.
2. Partner `Streamly Networks`, Status `Active`, Start Date `2026-01-01`, End Date `2025-12-31`.
3. Territory `US`, Distribution `SVOD`, link any title. Click Create Draft.

**Observed:** Saves successfully. Detail page renders **"Jan 1, 2026 → Dec 31, 2025"**. Status `Active`.

**Repro B — CSV import** (proves this is server-side, not just a UI gap)
```csv
direction,partner_name,licensor,licensee,status,start_date,end_type,end_date,territories,distribution_types
rights_out,Bad Dates Co,TBN,Bad Dates Co,active,2027-01-01,date,2026-01-01,US,SVOD
```
`POST /api/import/contracts` → `{ "imported": 2, "failed": 0, "errors": [] }`

**Expected:** Rejected in both paths with a clear message ("End date must be on or after start date").

**Fix:** Add the constraint at the schema/validation layer so it covers the create endpoint, the (future) update endpoint, and the CSV importer in one place. Consider a DB `CHECK (end_date IS NULL OR end_date >= start_date)` as a backstop.

---

## P1 — High

### R-05 · Contract status never reconciles with its term dates
**Severity:** High — dashboard and reports overstate live obligations.

**Repro:** With contracts whose `end_date` is in the past (`2025-12-31`, `2026-01-01`) and `status = active`, load the Dashboard.

**Observed:** "Active Contracts: 4" — includes both expired terms. Contracts list, Reports Hub, and the contract detail page all show the green **Active** badge for a term that ended months ago.
**Expected:** A contract past its end date reads as **Expired**.

**Fix:** Either (a) derive display status from dates at read time (`endType = 'date' && endDate < today → Expired`, regardless of stored status), or (b) run a scheduled job that transitions `active → expired`. Option (a) is more reliable. Apply consistently to the dashboard KPI query, the contracts list, Reports Hub, and the detail badge.

---

### R-06 · Archived contracts still block rights checks, with no indication
**Severity:** High — user-visible state and enforcement disagree.

**Repro**
1. Archive the exclusive contract from R-01 (contract detail → Archive).
2. Run Rights Check for `VeggieTales / United States / SVOD / 2026-08-26`.

**Observed:** Still `available: false`, and the contract appears in the results panel under **Active Grants** with no archived marker. Verified via API: `contract.archived === true` while the check still returns it as a conflict.
**Expected:** Decide and make it explicit. Either archived contracts stop enforcing, or they keep enforcing and the Rights Check result labels them `ARCHIVED` so the user understands why a hidden contract is blocking.

**Fix:** Add an explicit decision to the rights-check query (`WHERE archived = false`, or select `archived` and surface it in the `conflicts[]`/`grants[]` payload and render a badge).

---

### R-07 · Royalty Statements period selector is hardcoded to 2023
**Severity:** High — feature is unusable at the current date.

**Repro:** Reports → Royalty Statements → open the **Period** dropdown.

**Observed:** Only options are `All Time`, `Q3 2023`, `Q2 2023`, `Q1 2023`. Default is `Q1 2023`. Today is Aug 2026 — there is no way to select a current period.
**Expected:** Periods generated relative to the current date (e.g. trailing 8 quarters), defaulting to the most recently completed quarter.

**Fix:** Replace the hardcoded array with a generated list. Grep for the literal `"Q1 2023"` in the Reports component.

---

### R-08 · Invalid date strings return "available" instead of a validation error
**Severity:** High — malformed input produces a false all-clear rather than an error.

**Repro**
```
GET /api/rights-check?...&date=not-a-date   → 200 { "available": true }
GET /api/rights-check?...&date=2026-13-45   → 200 { "available": true }
GET /api/rights-check?...&date=             → 400 "contentItemId, territory, distributionType, date are all required"
```

**Expected:** `400` with "date must be a valid ISO date (YYYY-MM-DD)".

**Fix:** Validate the parsed date (`isNaN(Date.parse(...))` or a zod/date schema) before the overlap query. The presence check already exists — extend it to a format check.

*(Note: date-boundary math itself is correct and inclusive — verified 2025-12-31 / 2026-01-01 / 2027-12-31 / 2028-01-01 against a 2026-01-01→2027-12-31 term.)*

---

## P2 — Medium

### R-09 · "Today" is off by one on Rights Check vs. the rest of the app
**Repro:** With browser local time `Tue Aug 25 2026 19:02 PDT` (= `2026-08-26T02:02Z`):
- Dashboard calendar highlights **Aug 25** ✅
- Audit Log timestamps read **2026-08-25 19:17** ✅
- Rights Check "Effective Date" defaults to **08/26/2026** ❌

**Cause:** Rights Check derives its default from `new Date().toISOString().split('T')[0]` (UTC), while everything else uses local date.
**Fix:** Use a local-date formatter for the default (e.g. `toLocaleDateString('en-CA')` or date-fns `format(new Date(),'yyyy-MM-dd')`). Audit the codebase for other `toISOString()` uses that feed a date-only field.

---

### R-10 · Reports Hub "Content" column always shows 0
**Repro:** Reports → Contract Results table. Contracts with one linked title show `0`.
**Cross-check:** The Contracts list shows `1` for the same contracts, and Content Catalog shows `2` active contracts for the linked title — so the underlying join is fine.
**Fix:** The reports query isn't selecting/counting `contentItems`. Reuse the aggregation the contracts-list endpoint already uses.

---

### R-11 · Contract rows aren't clickable except for the chevron
**Repro:** Contracts list → click a partner name, or anywhere in the row body.
**Observed:** Nothing happens. Only the small `›` at the far right navigates. The `<tr>` carries `hover:bg-slate-50/80 … group`, so it *looks* clickable.
**Fix:** Make the whole row a link/click target (or wrap the first cell in an `<a>`), keeping keyboard focus and middle-click-to-new-tab working.

---

### R-12 · Contract detail hides most of what the create form collects
**Observed:** These are captured on create and displayed nowhere on `/contracts/:id`:
`exclusivity`, `platform`, `autoRenew`, `hasAmendment`, `reportingFrequency`, `minPaymentThreshold`, `royaltyType`, `royaltyDetails`, `paymentTerms`, `websiteLink`, `departmentTags`.

`exclusivity` is the single most important one — it's what drives every conflict result, and there's no way to see it on the contract. The **Financials** tab is a placeholder that renders literal dev copy: *"Financial details tab selected. Use the Revenue Reports or Royalties section to manage money."*

**Fix:** Add an "Rights & Terms" block to Overview (exclusivity, platform, auto-renew, reporting frequency) and populate the Financials tab from `royaltyType` / `royaltyDetails` / `paymentTerms` / `minPaymentThreshold`.

---

### R-13 · Territory and distribution vocabularies differ between screens
This is the data-model cause behind R-01/R-02.

| | Contract form | Rights Check |
|---|---|---|
| Territories | Global, US, Canada, UK, + free-text "Other Territories" | Global, United States, Canada, United Kingdom, Europe, Latin America |
| Distribution | AVOD, SVOD, TVOD, FAST, Linear, VOD, Broadcast | SVOD, AVOD, FAST, TVOD, Linear Broadcast |

`Europe` and `Latin America` are selectable in Rights Check but cannot be attached to a contract except as free text. `VOD` and `Broadcast` exist only on contracts. `Linear` vs `Linear Broadcast` will never match.

**Fix:** Define one shared enum/constant module for territories and one for distribution types; import it in both the contract form and the Rights Check form. Migrate existing free-text `otherTerritories` values into the canonical set.

---

### R-14 · CSV import instructions contradict the actual template
**Observed:** The Instructions panel says:
- "Required fields: **Partner Name, Direction, End Date**"
- "Territories should be **comma-separated**"

The actual template from `GET /api/import/template` is:
```
direction,partner_name,licensor,licensee,status,start_date,end_type,end_date,territories,distribution_types,platform,royalty_type,royalty_details,payment_terms,notes,website_link
rights_out,Tubi TV,TBN,Tubi TV,active,2024-01-01,date,2026-12-31,US|Canada,FAST|AVOD,…
```
Headers are snake_case and territories are **pipe**-separated.

**Fix:** Rewrite the Instructions panel to match the template exactly (snake_case field names, pipe separator), or make the parser accept both header styles and both separators.

---

### R-15 · Import reports header errors as misleading per-row errors
**Repro:** Upload a CSV whose header row doesn't match the template:
```csv
Partner Name,Direction,End Date
Acme Media,rights_out,2027-06-30
BadRow,not_a_direction,31/12/2027
,,
```
**Observed:** `0 imported / 3 failed`, and every row — including row 2, which has a perfectly valid `rights_out`, and row 4, which is blank — reports `direction must be "rights_in" or "rights_out"`.
**Expected:** Detect the unrecognized header up front and fail with "Unrecognized columns. Expected: direction, partner_name, …". Skip trailing blank lines rather than counting them as failed rows.

**Fix:** Validate the header row before iterating. Filter empty lines out of the row count.

---

### R-16 · Form validation errors don't scroll into view
**Repro:** New Contract → scroll to the bottom → click **Create Draft** with Primary Partner empty.
**Observed:** The button appears to do nothing. The "Required" error is rendered ~1,200px above, off-screen.
**Fix:** On failed validation, `scrollIntoView({behavior:'smooth', block:'center'})` on the first invalid field and focus it. Optionally add an error-summary toast.

---

## P3 — Low / polish

| ID | Issue | Detail | Fix |
|---|---|---|---|
| R-17 | Button and toast say "Draft" regardless of status | Setting Status to `Active` still shows a **Create Draft** button and a *"Successfully created contract draft"* toast | Make the label reflect the selected status |
| R-18 | Website field accepts `javascript:` URLs | `javascript:alert(1)` saves and renders as a clickable link. React neutralizes it at render (`React has blocked a javascript: URL`), so it isn't exploitable today — but there's no validation, and it becomes a real vector anywhere the value is rendered outside React (PDF, email, export, another client) | Validate the URL server-side; allow only `http:`/`https:` |
| R-19 | Year field accepts any integer | `99999` saves and displays. Placeholder is also hardcoded `2024` | Range-limit (e.g. 1900–currentYear+5); make placeholder dynamic |
| R-20 | Export CSV enabled with zero rows | Royalties → Export CSV is clickable when the period table is empty | Disable when there are no rows |
| R-21 | Archive has no confirmation | Single click archives immediately | Add a confirm dialog (it is reversible, so this is low priority) |
| R-22 | Partner selection doesn't prefill parties | Choosing a partner on a Rights Out contract leaves Licensor and Licensee blank | Prefill Licensor = `TBN`, Licensee = selected partner (inverted for Rights In) |
| R-23 | Audit log records UPDATE with no detail | `UPDATE PARTNER` rows show `-` in Details, while CREATE rows carry a payload | Record a before/after diff — an "immutable record of system changes" without diffs can't answer "what changed" |
| R-24 | CSV import silently creates partners | Importing rows for unknown partners created `Acme Media` and `Bad Dates Co` with no notice | Report created-partner count in the import summary, or add a "create missing partners" opt-in |
| R-25 | React controlled/uncontrolled warning | Console: *"Select is changing from uncontrolled to controlled"* on the New Contract form | Initialize the select's value to `''` instead of `undefined` |
| R-26 | Mobile navigation may be unreachable | At narrow viewport widths the sidebar is hidden and I could not find a hamburger/menu toggle. **Not confirmed** — the side panel constrained my viewport, so please verify on a real device | Add a mobile nav toggle if absent |

---

## What's working well

Worth not regressing:

- **XSS is properly escaped.** `<img src=x onerror=alert(1)>` submitted as a partner name renders as literal text everywhere it appears.
- **Auth is enforced on every API route.** All `/api/*` endpoints return `401 {"message":"No token provided"}` without a bearer token.
- **Audit log is thorough** — captured every create/update/login during testing, including per-row provenance for CSV imports (`{"source":"csv_import","row":3}`).
- **Date-boundary math is correct and inclusive** on rights checks.
- **Search is case-insensitive and partial-match** across Content Catalog and Partners.
- **Import row-level error reporting** has the right shape (per-row messages) once the header issue in R-15 is fixed.
- **No console errors** across the entire session apart from R-25.

---

## Suggested fix order

1. **R-03** (Edit Contract) — unblocks fixing any bad data created by R-04.
2. **R-04** (date validation) — stops new corrupt records.
3. **R-13** (shared vocabularies) — the shared foundation for the next two.
4. **R-01 + R-02** (territory containment + case) — restores trust in the core feature.
5. **R-05, R-06, R-08** — remaining correctness issues in what the app reports.
6. Everything else.

---

## Test data left behind

Created during testing and not removable through the UI (there is no delete):

- Partners: `Streamly Networks`, `Acme Media`, `Bad Dates Co`
- Content: `Northern Lights` (year `99999`)
- Contracts: 4 — two `Streamly Networks` Rights Out (one with the inverted `2026-01-01 → 2025-12-31` term), one `Acme Media`, one `Bad Dates Co` (inverted term)

Worth clearing directly in the database before any demo.
