# Card Published-Status Import Plan — Workbook `Published` Column → App Visibility

Status: **proposal only, nothing built yet.** Written 2026-08-26, capturing the
investigation and recommendation worked out in chat for reading each manager's
`Published` (YES/NO) column and gating card visibility in the app on it, after James
hit Google Sheets' per-workbook cell limit trying to create a consolidated `APP_EXPORT`
tab. Unlike [FATIGUE_IMPORT_PLAN.md](FATIGUE_IMPORT_PLAN.md), this is not a
transition-period tool — it's meant to run every time the import pipeline runs, for as
long as `Published` stays the mechanism for releasing new cards.

## The problem

James added a `Published` column to every manager's tab in the league workbook: `YES`
means the card's stats are released and it should become visible in the app; a blank
row means the card exists in the workbook (and can already be phantom-loaded into
Supabase, hidden) but isn't ready to show yet. He tried to compile all managers'
`Published` values into one new `APP_EXPORT` tab so the app could read a single
consolidated source — and hit the workbook's total-cell limit; there wasn't room left
to create the tab at all.

## What the investigation confirmed

- **The `Published` column and the card rows it applies to live in the same workbook
  the import pipeline can already reach** (`SPREADSHEET_ID
  1u23DbvIv0w17rMVBfZb9jq6TGvE3bWDsaMRMUzICvgM`, the same file `card-source.mjs`
  already reads `CARDS`/`gid=0` from, and the same file used for this week's fatigue
  work). It is **not** a separate workbook James privately administers — that
  clarification removes what looked like a real access blocker.
- **The import pipeline reads exactly one tab today** (`CARDS`, unauthenticated CSV
  export). There is no existing precedent in this codebase for reading N per-manager
  tabs — the "manager image folders are already handled individually" comparison
  doesn't actually hold: [import-images.mjs](scripts/import-images.mjs:715) reads a
  **local filesystem folder** (`ELEMENTS_CARD_IMPORT_FOLDER`), not per-manager Sheets
  tabs. The real precedent for a per-manager-tab read is this week's fatigue-import
  work, not the image pipeline.
- **There is no visibility/publish gating anywhere in the schema or app today.**
  [cardDatabase.ts](src/services/cardDatabase.ts:17) returns every row with
  `hitter_points >= 0`, full stop. Making "phantom-loaded until Published" real needs
  an actual schema addition (an `is_published`-type column + a query filter in
  `loadAllCardRows`) **regardless of which import option is chosen** — that part isn't
  optional and isn't specific to this doc's recommendation.
- **A card_key-style identifier still needs confirming per manager-tab row** — matching
  logic (below) is the mitigation, not a substitute for eventually knowing whether tabs
  carry a stable key or need name/year/team resolution the way this week's fatigue read
  did.

## Options considered

1. **Read `Published` straight from each manager's tab via CSV, no consolidated tab.**
   Fixes the actual blocker — reading never creates a tab, so it costs zero additional
   cells. Needs Google auth (per below) since manager tabs redirect unauthenticated CSV
   requests. Effort **S-M**, risk **Low**.
2. **Google Sheets API targeted read (`card_key` + `Published` columns only) — compute
   on read, nothing materialized.** Same "no new tab, no cell growth" fix as #1, but
   requests only the 2 needed columns per tab instead of downloading and discarding a
   whole tab as CSV, and returns raw cell values rather than CSV-export text (sidesteps
   merged-cell/hidden-row export quirks). Same auth requirement as #1, no extra cost.
   Effort **S-M**, risk **Low**, functionally cleaner than #1.
3. **A separate small Sheet/Apps Script outside the constrained workbook.** Dodges the
   cell limit permanently but adds real maintainability risk — Apps Script logic living
   outside this repo, no commit history, silent-failure risk, conflicting with this
   repo's own rule that anything touching production data needs a durable in-repo
   trail. Effort **M**, risk **Med** (ownership/bus-factor, not technical).
4. **Auto-populate a separate export Sheet from the import script itself.** A hybrid of
   #1/#2 + #3 — same reads, plus a cached snapshot Sheet written by committed code
   instead of Apps Script or manual compilation. Only worth it if there's a concrete
   need to inspect import runs via a static Sheet; not recommended without one.

## Recommendation: Option 2, falling back to Option 1

Directly fixes James's blocker (no tab created, no cells ever consumed) and **reduces**
his day-to-day work rather than adding to it — he already maintains `Published`
per-tab; direct-read removes the "also hand-compile a summary tab" step entirely.
Zero workflow change for managers.

## Auth: no explicit share grant needed, confirmed directly

Checked the actual Share dialog on the live workbook (not assumed): **general access is
"Anyone on the internet with the link can edit"** — not domain-restricted, not
org-scoped. This is intentional (per the user): the file is link-open at the sharing
level so every manager can edit their own tab, and James uses Sheets' protected-ranges
feature underneath to lock down which specific areas are actually editable per person.
That protected-range system is also the real explanation for the earlier finding that an
unauthenticated `curl` against a manager tab's CSV export returns HTTP 307 — it requires
a signed-in identity, which a service account naturally is once it authenticates via the
Sheets API. Confirmed directly: a real signed-in Google account not on the workbook's
4-person named-collaborator list still opened every tab with no access-denied prompt,
purely via the link-level "Anyone with the link" setting. **No sharing step, and no need
to involve James, for the service account to read this workbook via the Sheets API.**

## card_key matching — confirmed from real data, and the defensive requirement this adds

Checked directly against the live `cards` table and the live workbook rather than
assumed:

- **Format/spacing already proven, not hypothetical.** Anthony's 7 real fatigue rows
  this week were built from exactly this pattern (`Player + Year + Team` from a manager
  tab → `"{Player} {Year} {Team}"`) and independently confirmed to match real
  `card_key` values before that seed was written.
- **No accented characters anywhere in the workbook** (confirmed directly by the user)
  — and `public.cards.card_key` independently confirmed via direct query to contain
  **zero** non-ASCII values anywhere (e.g. "Jose Altuve," not "José Altuve"). The two
  sides already agree on this axis with no normalization needed.
- **Apostrophes match at the source.** `CARDS` (`gid=0`) — the tab `card-source.mjs`
  reads unmodified into `card_key`/`player_name`, with no quote-normalizing step
  anywhere in that pipeline — uses straight ASCII apostrophes (confirmed directly:
  `Andy O'Connor`, `Bill O'Hara`, `Billy O'Brien`, char code 39), matching `card_key`
  exactly by construction.
- **One honest, named gap:** apostrophe handling specifically *within a manager roster
  tab* (as opposed to the `CARDS` tab) wasn't directly land-on-and-confirmed this pass —
  a couple of reachable tabs were too sparse to have an example. Expected to match,
  based on the `CARDS`-tab evidence and the workbook-wide plain-text confirmation above,
  but not independently proven the same way.

That residual gap is closed as a **defensive coding requirement**, not an open question
blocking the plan:

> **The script must normalize whitespace and case when matching a manager-tab `Player`
> value against `card_key`, and any row that fails to resolve to a real `card_key` must
> be logged loudly and reported — never silently skipped.**

This means: trim and collapse internal whitespace, compare case-insensitively, and on a
non-match, emit a clear per-row log line (player text, tab, expected vs. attempted key)
and include it in the run's summary output rather than dropping the row unnoticed. A
genuine edge case (an apostrophe variant, a typo, a name that needs the fatigue-import's
name/year/team resolution instead of a direct key) then surfaces immediately in the run
output instead of quietly leaving a card unpublished or wrongly matched.

## Still open

- App-side schema addition (`is_published`-type column + query filter in
  `cardDatabase.ts`) — needed regardless of which option is chosen, not yet designed.
  Still propose-only, per "don't build yet."
- Whether manager-tab rows carry a stable identifier the script can key off directly, or
  need the same name/year/team resolution the fatigue read used — not yet confirmed,
  and the matching-logic requirement above is the mitigation for that, not a
  replacement for eventually checking it.
