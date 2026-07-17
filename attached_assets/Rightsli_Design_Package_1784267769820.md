# Rightsli — Design Package

A rights management system for TBN Licensing & Distribution. This guide defines the visual identity, voice, and UI rules so the app, its repo, and any future marketing all look and sound like one product.

---

## 1. The name

**Rightsli** — one word, capital R, lowercase rest. Never "RightsLi," "RIGHTSLI," or "Rights Li."

The name keeps "Rights" fully intact so it's self-documenting — anyone hearing it knows what the app manages — while the "-li" ending gives it a modern product feel and a quiet echo of *rightly*, from "rightly dividing the word of truth" (2 Timothy 2:15). That verse is the conceptual root: taking records and dividing them into their right place. It shows up in the product as the **dividing rule** — a thin vertical line — used in the logo and as a layout spine.

**Tagline:** *Rights management, rightly ordered.*
**Support line:** *Every contract in its right place.*

---

## 2. Identity concept

Rightsli should read as a **modern system of record** a licensing team and leadership trust — not a cream-and-serif template, not a flashy SaaS landing page. The Christian tone is carried quietly, through the name's meaning and the disciplined, "put in order" feel of the interface, rather than through overt religious imagery.

**Signature element:** the brass dividing rule. A 3px vertical line to the left of the wordmark, and a structural spine in layouts. Use it sparingly — it's the one memorable mark, so it stays clean.

---

## 3. Color palette

| Role | Name | Hex | Use |
|------|------|-----|-----|
| Base | Ink | `#14201C` | Top nav, logo lockup background, primary dark surfaces, headings on light |
| Primary accent | Covenant green | `#1D9E75` | Primary actions, active status, links, revenue-report markers |
| Secondary accent | Brass | `#C9A24B` | The dividing rule, contract-expiry markers, "expiring soon" emphasis |
| Light surface | Parchment | `#F4F1E9` | Text/logo on the ink background; optional warm page tint |
| Neutral | Slate | `#5F6B64` | Muted text, inactive nav, secondary labels |

Ink + Covenant green is the core pairing; brass is the single spark of warmth and should never outweigh the green. White and standard grays carry the working UI (tables, cards, forms) so the palette above stays meaningful rather than decorative.

**Status colors** (semantic, consistent everywhere):
- Active → green
- Expiring soon → amber/brass
- Expired → neutral gray
- In perpetuity → warm parchment/brass tint
- Terminated → red

---

## 4. Typography

- **Display / headings:** a clean, slightly condensed sans (e.g. *Inter Tight*, *Söhne*, or *General Sans*). Weight 500 for headings, tight letter-spacing. Used with restraint — headings, the wordmark, page titles.
- **Body / UI:** a highly legible neutral sans (e.g. *Inter*). Regular 400, 500 for emphasis. Only two weights in the whole app.
- **Data / labels:** a monospace (e.g. *JetBrains Mono* or *IBM Plex Mono*) for contract IDs, dates, payment terms, percentages, and countdowns (`60 DAYS`, `70/30 SHARE`, `NET 30`). The mono face is what makes a records system feel precise and scannable.

Rules: sentence case everywhere (never Title Case or ALL CAPS in UI copy — mono data labels are the one exception). No weights above 500. No mid-sentence bold.

---

## 5. Voice and copy

Plain, active, and calm — the tone of a well-run office, not a startup.

- Verb-first buttons: "Add contract," "Link content," "Approve royalty" — never "Submit" or "OK."
- An action keeps its name through the whole flow: the button that says "Publish" produces a toast that says "Published."
- Errors say what happened and what to do, with no apology and no first person: "That partner already has a contract for this title. Open it instead."
- Empty states invite action: "No contracts yet. Add your first to start tracking rights."
- Skip "successfully," "please," "simply," and exclamation marks on system copy.

---

## 6. Core UI patterns

**Top navigation** — ink bar, parchment wordmark with the brass rule, green avatar. Sections: Dashboard, Contracts, Catalog, Reports (plus Admin for that role).

**Dashboard** (the flagship screen) leads with:
- A **calendar** defaulting to the current month with paging to the next, marking **contract expirations** (brass) and **expected revenue reports** (green).
- A **Month / Quarter / Year** toggle, persisted per user, since different leads want different windows.
- An **"Expiring soon" rail** showing contracts inside the **60-day** window, with a mono day-countdown.
- Summary tiles: Active, Expiring < 60d, Reports due, Rights out.

**Contracts** — list filterable by direction (Rights In / Rights Out), status, and partner. A contract record shows its linked content, amendments as sub-records, and the royalty terms. Finance sees it read-only.

**Catalog** — films, TV series with seasons, TBN FAST, TBN Linear, WoF FAST. Open any title to see every contract tied to it (reverse lookup).

**Status pills** use the semantic colors above, small, sentence case, one word or two.

**Cards** — white surface, hairline border, 12px radius. **Controls** — 8px radius. Single-sided accent borders stay square (no rounded corners on a left border).

---

## 7. Accessibility floor

Responsive to mobile, visible keyboard focus rings, reduced-motion respected, and every color pairing legible in both light and dark contexts. Text never below 12px; data labels never below 11px mono.

---

## 8. Assets in this package

- **Brand identity sheet** — logo lockup, palette, type, and status vocabulary (rendered in chat).
- **Dashboard mockup** — the flagship screen with the calendar spine and expiring-soon rail (rendered in chat).
- This written guide.

To brand the build, hand this file to Replit (or a developer) alongside the build prompt and instruct that the app name is Rightsli, using the palette, type roles, and voice above.
