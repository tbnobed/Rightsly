# Rightsly requirements remediation report

**Audit baseline:** 26 August 2026, build `index-CuLLk9RB.js`  
**Scope of this report:** the 74 line items in the attached requirements audit. It combines current source/build review with the isolated live API regression described below. It is **not** a browser acceptance test or a production deployment certification. No account names, report values, or other personal data are reproduced here.

## Executive summary

The four meeting blockers identified by the audit have been addressed in source:

1. **Revenue reporting is now report-first, scheduled from contract terms, and compatible with legacy rows.** Finance/Admin users can create, edit, delete, attach/download supporting files for, and review/approve revenue reports. The server persists received amounts and costs without deriving a royalty share. Rights Out reporting frequency, contract term, and payment terms transactionally generate idempotent expected-report periods with derived due dates. At startup, legacy-only amounts are idempotently backfilled into the current received-amount field; list, review, and export paths also use a safe fallback during migration without exposing the compatibility column.
2. **Season-level licensing is now modelled, selectable, and API-verified.** TV-series seasons persist, can be selected on a contract, are returned on contract reads, and are considered by the rights checker.
3. **Financial data is restricted in the API and UI.** Contract financial fields are redacted for non-Finance/Admin readers; contract write routes reject financial terms from roles that cannot view them; hidden Legal financial controls cannot erase existing values during an otherwise permitted update; and the Revenue Reports page and its endpoints require Finance/Admin. Dashboard revenue-report counts/events are also suppressed for Legal and Sales. The API authorization and redaction paths passed isolated live regression; the latest browser role journeys remain untested.
4. **Notifications now generate actionable, role-authorized alerts without waiting for a user to open the bell.** Scheduled revenue-report and approval-needed alerts are limited to Admin/Finance. Expiry alerts require an active, unarchived, not-already-expired contract; Sales therefore receives only valid active-contract expiry alerts. The API starts a sweep shortly after startup and repeats it every 15 minutes, updating overdue reports, purging stale unauthorized/invalid alerts, and generating current alerts for active users. “Signed by legal” remains unavailable because the product has no legal-signature state.

In addition, the remediation adds platform calendar mode/filtering, conflict alternatives, report platform/territory filters and sorting, audit-log CSV export, and the requested Rights In YouTube/social detail fields. Items explicitly declined by stakeholders remain out of scope; Kristina-owned compliance and approval/signing decisions remain open or conditional.

### Verification evidence and limitations

“Source-confirmed” means the behavior is represented by the changed client/server/database/API-spec source named below. “API-regression verified” means an isolated live API regression exercised and passed: authentication for Admin, Legal, Finance, and Sales; Legal nonfinancial contract creation; financial write/read restrictions and Finance contract-edit denial; season persistence plus Season 1, Season 2, and whole-title semantics; conflict alternatives; stale-season rejection; received-amount/cost report creation; reviewed/approved queue behavior; Legal revenue denial; platform/territory report filters; expiring-report financial redaction; and audit CSV HTTP 200. Rightsline import verification comprised 26 unit tests and two route integration tests. It passed required-only CSV acceptance, omission of every optional header, malformed optional-value validation, and mixed-row behavior: the valid row succeeded while the failed row’s newly created partner and contract both rolled back, because each row has its own transaction. Authorization was also verified before writes: Legal received 403 for a financial CSV with zero partner creation, while Admin imported the same file and persisted its royalty and payment fields. Direct-access live proof confirmed the shared Sales rule on direct reads and private documents: an expired contract returned 404 and its attachment returned 403. Historical-dashboard proof confirmed that `rightsInSpans` also applies current-date Sales visibility: the same historical-year request included an expired Rights In span for Admin but excluded it for Sales. Season-lifecycle proof confirmed defense in depth after the schema push: the database reported the contract-season foreign key as `RESTRICT`; a direct referenced-season delete failed with PostgreSQL `23503`; and the API mapped that constraint to 409. The API path performs its locked reference check and season mutation transactionally, so the rejected deletion left both seasons intact, the Season 1 scope still conflicting, and Season 2 available. Whole-title lifecycle proof now applies the same guarantees to `contract_content → content_items`: one historical orphan join was removed before the schema applied successfully; the database reports `RESTRICT`; direct deletion of a referenced title fails `23503`; and the transactionally locked API delete maps the conflict to 409 and preserves the title. Schedule/notification live proof additionally produced four quarterly rows, then changed the contract from Net 30 to Net 60: the received schedule row retained identical `periodStart`, `periodEnd`, `expectedDate`, `status`, and `amount`, while six future rows regenerated with Net 60 due dates. Restart proof confirmed Finance received the revenue alert, Legal and Sales each received zero revenue alerts, Sales received the active-contract expiry alert, and Sales received zero draft-contract expiry alerts. The unattended sweep also purges stale unauthorized nonfinancial-user revenue alerts and invalid Sales expiry alerts. Legacy-compatibility live proof inserted a legacy-only `321.45` amount and confirmed that it appeared as the received amount in both the list and JSON export, with no compatibility field exposed in either response. Temporary verification data was cleaned.

This does **not** establish browser interaction, visual behavior, real upload-provider behavior, production deployment, or every role journey. This report deliberately makes no such claim. “Pre-existing” means the audit itself recorded the item as met, or source showed it before the remediation diff; it is not represented as a newly delivered fix.

### Schema-upgrade and deployment evidence

The database-dependent remediation has a verified upgrade path rather than relying on application startup to reconcile schema. **Replit Publish is the required production schema-reconciliation path**: its corrected post-merge sequence runs preflight → `push-force` → preflight before the application starts. That sequence completed successfully in 6.2 seconds, and the populated-database preflight reported zero orphan contract-content rows, zero orphan contract-season rows, and zero duplicate schedule, approval, or notification keys. This validates the reconciliation procedure; consistently with the limitation above, it does not claim that a production Publish has occurred.

A rolled-back database integration test passed persistence for social details, seasons, generated schedules, and both restrictive foreign keys without leaving test records. A live API smoke test against the reconciled schema then passed season, social, schedule, and notification paths. For non-Replit/self-hosted operation, the maintenance procedure is explicitly documented: stop the API, back up the database, run preflight, resolve every non-zero finding, apply `push-force`, rerun preflight, and only then restart the API. Evidence: `scripts/post-merge.sh`; `lib/db/src/preflight.ts`; `lib/db/package.json`; `docs/database-upgrade.md`; `replit.md`.

## Newly fixed confirmed internal gaps

| Gap from the 26 Aug audit | User-visible behavior now represented | Source/build evidence |
|---|---|---|
| Revenue reports could not be entered; calculator contradicted the requirement | Finance/Admin see **Revenue Reports**, select a contract, create/edit/delete a period with received amount, cost, expected/received dates and status; they can attach/download a report file and mark it reviewed/approved. Financial edits reset review to pending. Received/cost creation and reviewed/approved queue behavior passed isolated API regression. | `artifacts/tbn-rights/src/pages/royalties.tsx`; `artifacts/api-server/src/routes/revenue.ts`; `routes/royalties.ts`; `lib/db/src/schema/revenue.ts`; API-regression verification. |
| Legacy revenue amounts could disappear after the report-first migration | API startup copies a legacy amount only when `amountReceived` is null, so reruns are idempotent and never overwrite migrated values. Until every row is backfilled, list serialization, the review queue, and report exports fall back to the legacy value, return it only as `amountReceived`, and omit the compatibility field. | `src/index.ts:27-29`; `lib/legacyRevenue.ts`; `lib/legacyRevenueCore.ts`; `routes/revenue.ts`; `routes/royalties.ts`; `routes/reports.ts`. Live proof: legacy-only `321.45` appeared in list and JSON export without the compatibility field. |
| Reporting frequency was captured but did not create expected reports | Contract create/update now synchronizes the Rights Out schedule in the same database transaction. Monthly, quarterly, or annual periods are bounded by the contract term; each row stores period start/end and a due date derived from Net 30/60/90 (defaulting to 30). A unique schedule key and upsert make retries idempotent. | `routes/contracts.ts`; `lib/revenueSchedule.ts`; `lib/revenueScheduleCore.ts`; `lib/db/src/schema/revenue.ts`. Live proof: four quarterly rows, then six regenerated rows with Net 60 due dates. |
| Contract-term changes could destroy completed reporting history | Synchronization deletes only obsolete, schedule-generated rows still in `expected` state. Received/overdue or otherwise completed rows are preserved, while missing future periods are inserted or refreshed. | `lib/revenueSchedule.ts:6-29`; unique schedule key in `lib/db/src/schema/revenue.ts`. In the live Net 30→Net 60 proof, the received row kept identical `periodStart`, `periodEnd`, `expectedDate`, `status`, and `amount`; six future rows regenerated. |
| Revenue-report dependent dashboard/report features were empty | Revenue report records feed royalty-statement exports. Calendar event types include expected and overdue reports for authorized financial roles; the dashboard suppresses revenue-report counts/events for Legal and Sales. | `routes/dashboard.ts`, `routes/reports.ts`, `src/components/dashboard-calendar.tsx`, `src/pages/dashboard.tsx`, generated API changes and `openapi.yaml`. |
| Royalty review/approval was absent | Each new report receives a pending approval; Finance/Admin can mark reviewed or approved, and pending reports generate an approval-needed alert. | `routes/revenue.ts:103-108,156-158`; `routes/royalties.ts`; `routes/notifications.ts:133-176`. |
| Season 1 could not be licensed separately | Seasons persist through the content API and can be selected in the contract wizard/rights checker. Referenced-season deletion is protected by a restrictive foreign key plus a transactionally locked API reference check/mutation; PostgreSQL `23503` is mapped to 409. | `lib/db/src/schema/contracts.ts`; `routes/content.ts`; `routes/contracts.ts`; `routes/rights-check.ts`. Schema push applied; live direct delete failed `23503`, API delete returned 409, and the FK reported `RESTRICT`. |
| Deleting a referenced title could orphan contract-content scope | Whole-title deletion is protected by a restrictive `contract_content → content_items` foreign key and a transactionally locked API reference check/delete; PostgreSQL `23503` is mapped to 409. | `lib/db/src/schema/contracts.ts`; `routes/content.ts`. One historical orphan join was removed before successful schema apply; live direct delete failed `23503`, API returned 409, title remained, and FK reported `RESTRICT`. |
| Rights checker supplied no alternatives | When an exclusive conflict exists, the result includes canonical available territories and distribution types for the same title/season/date and renders conservative suggestions. Alternatives passed isolated API regression. | `routes/rights-check.ts:170-202`; `src/pages/rights-check.tsx:229-246`; API-regression verification. |
| Calendar was one combined event calendar | The dashboard calendar has a “Rights In by platform” mode, separate YouTube/TBN+/L&D/Broadcast filter groups, platform color bars, and duration-aware contract spans. | `src/components/dashboard-calendar.tsx`. |
| Rights In YouTube and social details were incomplete | Rights In data now carries a YouTube channel and social platform/account details (Facebook, Instagram, TikTok, Other, plus All Socials). Persistence passed the rolled-back database integration test and reconciled-schema live API smoke. | `src/pages/contracts/new.tsx:35-73,289-301`; `routes/contracts.ts:249-258,421-437`; API schema changes. |
| Reports lacked platform/territory visibility/sorting | Contract report data includes platform and territories; the Reports Hub exposes platform/territory filters and sortable Platform/Territories columns; exports include those fields. Platform/territory report filters passed isolated API regression. | `src/pages/reports.tsx`; `routes/reports.ts:42-68,81-130`; API-regression verification. |
| Rightsline import rejected valid files when optional columns were omitted and could leave failed-row data behind | The importer accepts required-only files and every optional-header omission, validates malformed optional values, and uses per-row transactions. Financial imports are authorization-safe: Legal receives 403 before writes, while Admin can import and persist the same file’s royalty/payment fields. | `lib/contractImportCore.ts`; `lib/contractImport.ts`; `routes/import.ts`; `lib/contractImport.test.ts`; `integration/contractImport.test.ts`; 26 unit and two route integration tests, including zero Legal partner creation and valid-row/failed-row rollback checks. |
| Audit logs had no export | Admins have an Export CSV control that preserves selected filters; the server produces CSV with quoted cells and attachment headers. The endpoint returned HTTP 200 in isolated API regression. | `src/pages/audit-log.tsx:53-79,126-128`; `routes/audit-logs.ts:31-52`; `src/lib/csv.ts`; API-regression verification. |
| Financial visibility was not demonstrable and finance data was broadly exposed | Non-Finance/Admin contract reads receive `null` for royalty type/details/payment terms; unauthorized financial writes are rejected; omitted hidden Legal financial fields preserve stored values; revenue endpoints/page require Finance/Admin; Legal/Sales dashboards omit revenue counts/events. Isolated API regression passed Legal creation, financial write/read restrictions, Finance edit denial, Legal revenue denial, and expiring-report redaction. | `routes/contracts.ts`; `routes/dashboard.ts`; `routes/revenue.ts`; `src/pages/contracts/new.tsx`; `src/pages/royalties.tsx`; API-regression verification. |
| Sales contract visibility was inconsistently applied across derived and direct reads | Every contract-derived Sales read applies the same current-date active, unarchived, non-expired scope, including direct reads, private attachments, and historical dashboard `rightsInSpans`. | Shared Sales guard use across contract/content/dashboard/report/storage routes. Live proof: expired direct GET 404, attachment 403, and a historical expired Rights In span appeared for Admin but not Sales. |
| Bell was a shell with no generated alerts | Notification generation covers valid active-contract expiry, Admin/Finance scheduled-report expected, and Admin/Finance approval-needed alerts; each is de-duplicated and directly linked. Startup/15-minute sweeps update overdue state and purge stale unauthorized revenue alerts plus invalid Sales expiry alerts. | `routes/notifications.ts`; `src/index.ts`; existing `notifications-bell` UI. Restart proof: Finance revenue yes; Legal/Sales revenue zero; Sales active expiry yes; Sales draft expiry zero. |

## Findings already fixed before this remediation

These are retained so that a “met” result is not incorrectly attributed to the current changes:

- Multi-title contracts, linked-contract views from content, catalog content types, cleans/captions, and the scrollable contract-content selector were already recorded as met in the audit.
- Contract direction chooser; licensor/licensee inversion; standard Rights In platforms; exclusivity controls; marketing rights; financial-term fields; payment terms; reporting frequency; threshold; auto-renew/perpetuity; Rights Out free-text platform; document upload; notes; and department tags were already recorded as met.
- The audit already recorded HTTP/HTTPS website validation, contract archive behavior, automatic date-derived expiry, amendments, status filters, licensor list column, PDF/XLSX report exports, and removal of IP addresses from audit records as met.
- The 26 August audit already recorded the 60-day expiry window, month/quarter/year dashboard periods, active-only Sales restriction (reported), in-app bell/read/clear controls, and the base five content types as met.

The current diff strengthens some of these existing areas (for example, richer social metadata and financial redaction), but the original “met” status is not rewritten as a newly discovered defect.

Unrelated ZIP assets touched during the verification work were restored; they are not part of this remediation report or its evidence.

## Stakeholder-disposition items: ruled out, open, external, or conditional

| Requirement | Final disposition | Exact reason |
|---|---|---|
| DPO expansion | Later / not implemented | The form document itself marked it as a future item; no stakeholder instruction made it current scope. |
| Rights holds / pending negotiations | Ruled out | Obed specified that negotiations remain in email until finalised. |
| Role-specific dashboard views | Ruled out for now | Obed said to revisit only if the site expands beyond L&D. |
| Advance payments and recoupment | Ruled out | Obed assigned it to accounting. |
| Royalty statements out to rights holders | Ruled out | Obed said only the Cold Water Media account is involved and accounting handles it. |
| L&D aging-report connection | External/open scope | The audit identifies an external integration, not an internal UI-only gap; no integration contract or owner-approved scope is supplied. |
| Approval workflow / DocuSign | Conditional | Obed left it conditional on Kristina. The report-review approval now exists; legal-signature/DocuSign workflow does not. |
| Contract templates | Ruled out | Obed said templates come from Legal or the partner. |
| External partner access | Ruled out | Obed: not at this time. |
| Deadline reminders | Ruled out | Obed: not currently. |
| Audit-log export | Implemented, but governance ownership remains Kristina’s | The audit routed the policy decision to Kristina; the requested technical CSV export is now present. |
| Retention period and compliance regime | Open | Three Kristina questions in the source document remain unanswered and may add requirements. Generated-notification cleanup is a 90-day implementation behavior, not an approved general retention/compliance policy. |
| Legal-signed notification | Conditional/open | There is no signature state or legal-signing workflow from which a truthful signed alert can be generated. |
| Role acceptance evidence | Browser verification open | Isolated API regression authenticated Admin/Legal/Finance/Sales and exercised the stated Legal/Finance authorization boundaries. Current source consistently scopes all contract-derived Sales reads, but Sales browser visibility cases were not exercised. |

## Numbered disposition matrix (all 74 audit line items)

**Key:** **Implemented (new)** = changed source addresses a confirmed audit gap; **Met (pre-existing)** = already met at audit baseline; **Open verification** = source evidence exists or was reported, but role/browser acceptance has not occurred; **Ruled out/Later/External/Conditional** = stakeholder disposition, not a silent defect.

### Contract forms (1–18)

| # | Source requirement | Prior audit status | Final disposition | Concise evidence |
|---:|---|---|---|---|
| 1 | Add Contract Rights In/Rights Out chooser | Met | Met (pre-existing) | Wizard step 1 has both directions. |
| 2 | Licensor/licensee on both forms | Met | Met (pre-existing) | Partner selection populates inverted parties. |
| 3 | Rights In TBN Broadcast, TBN+, Yippee | Met | Met (pre-existing) | Existing platforms list. |
| 4 | YouTube plus channel text box | Partial | Implemented (new) | `new.tsx` and contract route persist `youtubeChannel`. |
| 5 | Facebook/Instagram/TikTok/Other plus account text box | Missing | Implemented (new; persistence verified) | Social platform/account persistence passed rolled-back DB integration and reconciled-schema API smoke. |
| 6 | Grant/exclusivity/window/same-duration | Met | Met (pre-existing) | Existing Rights In fields. |
| 7 | Marketing Rights text box | Met | Met (pre-existing) | Existing Rights In field. |
| 8 | Conditional royalty type details | Met | Met (pre-existing) | Existing contract financial-term controls. |
| 9 | Net 30/60/90 | Met | Met (pre-existing) | Existing payment-term enum/control. |
| 10 | Monthly/quarterly/annual reporting frequency | Met | Met (pre-existing, now fully consumed) | Transactional schedule persistence passed rolled-back DB integration and reconciled-schema API smoke; four quarterly and six regenerated Net 60 rows were proved live. |
| 11 | Minimum payment threshold | Met | Met (pre-existing) | Existing Rights Out field. |
| 12 | Auto Renew and Amendment checkboxes | Met | Met (pre-existing) | Existing end type/Rights Out controls. |
| 13 | Optional Rights Out platform text box | Met | Met (pre-existing) | Existing optional `platform`. |
| 14 | Website link | Met | Met (pre-existing) | HTTP/HTTPS server validation already present. |
| 15 | Contract document upload | Met | Met (pre-existing; access hardened) | Existing attachment flow/Documents tab; shared Sales visibility rule protects private documents, with expired-contract attachment access returning 403 live. |
| 16 | Notes | Met | Met (pre-existing) | Existing notes field. |
| 17 | Acquisition/Distribution department tags | Met | Met (pre-existing) | Existing field and list filter. |
| 18 | DPO expansion | Later | Later | Explicit future item in form document. |

### Content and catalog (19–26)

| # | Source requirement | Prior audit status | Final disposition | Concise evidence |
|---:|---|---|---|---|
| 19 | One contract holds multiple content items | Met | Met (pre-existing; lifecycle hardened) | `contract_content` model now has a verified restrictive title FK; direct referenced delete failed `23503` and API returned 409 with the title preserved. |
| 20 | Film, TV series, TBN FAST/Linear, WoF FAST | Met | Met (pre-existing) | Five catalog types. |
| 21 | View all contract content | Met | Met (pre-existing) | Contract Content tab. |
| 22 | Title shows every linked contract | Met | Met (pre-existing; integrity verified) | Linked-contract view/route; transactional locked deletion and `RESTRICT` FK prevent referenced titles from disappearing underneath joins. |
| 23 | Individually licensable TV seasons | Missing | Implemented (new; API/database verified) | Reconciled schema and rolled-back integration verified season persistence/restrictive FK; direct delete failed `23503`, API mapped it to 409, and the scope remained intact. |
| 24 | Cleans and captions checkboxes | Met | Met (pre-existing) | Existing Add Title controls. |
| 25 | Catalog scrolls while selecting contract content | Met | Met (pre-existing) | Audit recorded scroll-container fix. |
| 26 | Content types updated for Rights In | Met | Met (pre-existing) | Existing catalog types. |

### Rights availability (27–33)

| # | Source requirement | Prior audit status | Final disposition | Concise evidence |
|---:|---|---|---|---|
| 27 | Check rights by content, not partner | Met | Met (pre-existing) | Checker requires `contentItemId`. |
| 28 | Rename Platform to Distribution Type | Met | Met (pre-existing) | Current checker/form label. |
| 29 | SVOD/TVOD/AVOD/FAST/Linear | Met | Met (pre-existing) | Shared rights vocabulary supports these and more. |
| 30 | Multiple territories plus free-text other | Met | Met (pre-existing) | Canonical territories plus `otherTerritories`. |
| 31 | Only exclusive deals block | Met | Met (pre-existing) | Conflict filter uses exclusive Rights Out. |
| 32 | Suggest alternate territory/platform | Missing | Implemented (new) | API calculates/rendered conservative canonical alternatives. |
| 33 | Rights holds/pending negotiations | Not needed | Ruled out | Obed keeps negotiations in email. |

### Dashboard and calendar (34–39)

| # | Source requirement | Prior audit status | Final disposition | Concise evidence |
|---:|---|---|---|---|
| 34 | Expiration calendar, month and next-month navigation | Met | Met (pre-existing) | Existing calendar navigation. |
| 35 | Revenue-report expected dates on calendar | Partial | Implemented (new; schedule API-verified) | Durable generated rows carry period start/end and derived due dates for authorized-role dashboard events; Legal/Sales responses suppress revenue data. Browser rendering remains unverified. |
| 36 | 60-day expiring-soon window | Met | Met (pre-existing) | Existing “Within 60 days.” |
| 37 | Month/quarter/year views | Met | Met (pre-existing) | Existing dashboard periods. |
| 38 | Separate/colour-coded platform calendars | Missing | Implemented (new; role filtering API-verified) | Rights-In platform mode/filter/color spans; historical-year proof showed expired Rights In for Admin while current-date Sales visibility excluded it. |
| 39 | Role-specific dashboard views | Not needed | Ruled out for now | Revisit only beyond L&D. |

### Royalties and revenue (40–49)

| # | Source requirement | Prior audit status | Final disposition | Concise evidence |
|---:|---|---|---|---|
| 40 | Upload revenue reports as attachments | Missing | Implemented (new) | Report CRUD plus attachment upload/download UI; generated expected rows become the durable periods against which reports are completed. |
| 41 | Do not calculate received royalty cut | Missing | Implemented (new; legacy compatibility verified) | Report-first routes store submitted amounts and derive no split/owed amount; legacy-only `321.45` surfaced as `amountReceived` without exposing the compatibility field. |
| 42 | Royalty tab calculates costs | Missing | Implemented (new; API-regression verified) | Revenue reports capture cost alongside effective received amount; received/cost creation and legacy amount fallback passed. No unrequested royalty-share derivation is performed. |
| 43 | Revenue-share splits and flat fees | Met | Met (pre-existing) | Per-contract financial terms. |
| 44 | Structures vary by contract/partner | Met | Met (pre-existing) | Terms live on contracts. |
| 45 | Restrict royalty information by department | Missing | Implemented (new; API-regression verified) | Financial redaction/write guards passed; Legal/Sales dashboard revenue data and revenue/approval alerts are suppressed. Restart proof gave Finance the revenue alert and Legal/Sales zero. |
| 46 | Review/approve royalty payments | Missing | Implemented (new) | Pending/reviewed/approved workflow safely reads current or legacy received amounts; live regeneration preserved the completed row while regenerating future rows. |
| 47 | Advances and recoupment | Not needed | Ruled out | Accounting-managed. |
| 48 | Statements to rights holders | Not needed | Ruled out | Accounting-managed single-account process. |
| 49 | Connect L&D aging report | Missing | External/open scope | Needs external integration decision. |

### Reports, exports, and lifecycle (50–61)

| # | Source requirement | Prior audit status | Final disposition | Concise evidence |
|---:|---|---|---|---|
| 50 | Contract summaries, royalty statements, expiring reports | Partial | Implemented (new; legacy export verified) | Royalty statements query entered/scheduled rows and coalesce migrated/legacy received amounts; JSON export showed legacy-only `321.45` as `amountReceived` without exposing the compatibility field. |
| 51 | Excel and PDF export | Met | Met (pre-existing) | Existing report export formats. |
| 52 | Sort partner/content/status/royalty/end date | Met | Met (pre-existing) | Existing Reports Hub sorting. |
| 53 | Sort/filter by platform | Missing | Implemented (new; API-regression verified) | Platform/territory report filters passed; UI supplies columns/sort and exports include fields. |
| 54 | Active/perpetuity/expired/auto-renew filters | Met | Met (pre-existing) | Existing filter chips. |
| 55 | Licensor in contracts-list columns | Met | Met (pre-existing) | Existing list column. |
| 56 | Active/Expired/Perpetuity/Terminated statuses | Met | Met (pre-existing) | Existing statuses and derived expiry. |
| 57 | Amendments under existing contract | Met | Met (pre-existing) | Existing amendments tab/routes. |
| 58 | Rightsline bulk import | Partial | Implemented (new; unit/integration verified) | 26 unit and two route integration tests cover required-only/every optional omission, malformed optional values, and per-row rollback. Legal financial CSV: 403 before writes/zero partners; Admin same file: imported with royalty/payment fields persisted. |
| 59 | Archive old agreements | Met | Met (pre-existing) | Existing reversible archive and rights-check exclusion. |
| 60 | Approval workflow/DocuSign | Missing | Conditional | Report approval is implemented; Legal/DocuSign awaits Kristina decision. |
| 61 | Contract templates | Not needed | Ruled out | Legal/partner supplies templates. |

### Permissions, notifications, and audit (62–74)

| # | Source requirement | Prior audit status | Final disposition | Concise evidence |
|---:|---|---|---|---|
| 62 | Admin full access | Met | Met (pre-existing) | Admin permitted by guarded routes. |
| 63 | Legal drafts/reviews and checks availability | Unverified | Partially verified | Legal nonfinancial contract creation passed isolated API regression; source permits checker access and preserves existing financial values when hidden fields are omitted. Legal browser review/check journey remains untested. |
| 64 | Finance revenue/royalties, no contract edit | Unverified | Implemented (new; API-regression verified) | Finance/Admin revenue guards; Finance contract-edit denial passed. |
| 65 | Sales availability and active contracts only | Unverified | Implemented (direct/API proof; browser verification open) | Shared current-date rule covers direct/derived reads, private documents, alerts, and historical dashboard spans. Admin saw the expired historical Rights In span; Sales did not. |
| 66 | International users need both directions | Unverified | Open verification | Both directions are modelled; actual international-role mapping not demonstrated. |
| 67 | External partner access | Not needed | Ruled out | Not at this time. |
| 68 | Expiring/report expected/approval/legal-signed notifications | Missing | Partially implemented / conditional | Revenue/approval alerts are Admin/Finance-only; expiry alerts require active, unarchived, non-expired contracts. Restart proof: Finance revenue yes, Legal/Sales revenue zero, Sales active expiry yes, Sales draft expiry zero. Signed-by-legal remains conditional because no signature state exists. |
| 69 | In-app notifications and clear-all | Met | Met (pre-existing; authorized unattended generator added) | Bell/read/clear remain. Startup/15-minute sweeps generate/purge scoped alerts; notification behavior passed the reconciled-schema API smoke. |
| 70 | Bell links to item | Unverified | Implemented (new; browser click pending) | Generated links target contracts or filtered royalties page. |
| 71 | Deadline reminders | Not needed | Ruled out | Not currently requested. |
| 72 | Remove IP from audit trail | Met | Met (pre-existing) | Audit recorded IP removal. |
| 73 | Export audit logs | Missing | Implemented (new; API-regression verified) | Admin CSV endpoint returned HTTP 200; UI control is present. |
| 74 | Retention period/compliance regime | Open | Open | Kristina questions unanswered; 90-day generated-notification cleanup is not policy approval. |

## Remaining acceptance checks

1. Exercise browser role journeys for Legal, Finance, Sales, and international users, including Sales active/archived/expired navigation, document links, and historical calendar rendering; Legal edit preservation; dashboard revenue suppression; and rendered financial redaction. Direct/API, historical-dashboard, and notification authorization cases have passed; browser rendering remains unverified.
2. Exercise title/season creation, selection, and deletion-conflict messaging through the browser. API scope semantics have passed; applied title and season `RESTRICT` rules, direct `23503` results, API 409 mappings, locked transactional checks, and preservation after rejection are verified.
3. Complete generated expected/overdue revenue periods with a permitted test attachment in the browser; verify calendar rendering, exports, review reset, approval state, notification links, and storage download. API schedule generation/regeneration, completed-row preservation, received/cost creation, review/approval, and automatic post-restart Finance notification have already passed.
4. Obtain Kristina’s decisions on retention/compliance, legal-signature/DocuSign workflow, and the L&D aging-report integration before treating those items as complete.
5. Use Replit Publish for production so its required preflight → `push-force` → preflight reconciliation runs against the production database; the 6.2-second successful sequence, zero-finding populated preflight, rolled-back integration test, and reconciled-schema API smoke validate the path but do not certify a production deployment. Self-hosted operators must follow `docs/database-upgrade.md`.