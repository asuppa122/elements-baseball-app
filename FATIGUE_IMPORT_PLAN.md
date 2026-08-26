# Fatigue Import Plan — Workbook → `player_rest_state`

Status: **proposal only, nothing built yet.** Written 2026-08-26, capturing the plan
worked out in chat for importing real starting Ftg/Rm state from the league workbook
into `player_rest_state` at the moment a manager actually starts using the automated
system for real. The manual, one-time seed already done for Anthony's roster this week
(7 rows, `season_id '10.1'`) was a hand-run precursor to this — this doc is about
building the repeatable version for the real cutover and the eventual league-wide
rollout.

## Scope & lifecycle — this is transition-only tooling, not an ongoing sync

**This script is expected to be used only during the transition period**: once, at a
clean cutover, or a small handful of times if the rollout is staggered manager by
manager. It is not a permanent integration and should not be built as if it needs
ongoing scheduled syncing — it doesn't.

Once a manager is fully using the app, `player_rest_state` for them is updated
exclusively by the game-completion RPC (`save_gameplay_lab_state`, extended this week
to apply the three-step rest-tracking update atomically on every game that finishes).
From that point forward, **the spreadsheet becomes irrelevant for that manager** — there
is no reason to ever read their tab again, and the import script has no further job to
do for them. The workbook and the app's own tracking are two independent sources of
truth for exactly as long as it takes each manager to cut over, and never again after
that.

This shapes the rest of the plan in a few concrete ways:
- No scheduling infrastructure (cron, recurring job, etc.) is warranted — this is a
  manually-run, supervised script, run deliberately at specific cutover moments.
- The script doesn't need to defend against long-running, unattended, repeated
  execution — it needs to be safe to run a handful of times, by a person watching the
  output, not safe to run unattended forever.
- Once every manager has cut over, this script (and the Google auth plumbing it
  needs — see below) can be retired outright. It's fair to treat it as disposable
  infrastructure with a known end date, not something to build for long-term
  maintenance the way `import-cards.mjs`/`import-images.mjs` are.

## 1. Script pattern: standalone Node script, service-role key — no new RPC needed

The RPC-only write restriction on `player_rest_state` exists to stop a *player-facing
client* (using the anon/authenticated key) from writing arbitrary fatigue values through
the app. It has nothing to do with offline, human-run import tooling — Supabase's
service-role key bypasses RLS entirely by design, which is exactly why
`scripts/import-cards.mjs`/`import-images.mjs` already write straight into
`cards`/`card_images` despite those tables having no open write policies either. Same
trust boundary, same pattern. No new RPC or write path needed — a script using
`SUPABASE_SERVICE_ROLE_KEY` (already in `.env`, already restricted to import scripts per
the existing env-var convention) can `insert ... on conflict do update` directly.

**The real complication is authentication to the sheet, not the database.** Tested
directly this week: the CARDS tab (`gid=0`) that `card-source.mjs` reads works with a
bare, unauthenticated `fetch()` — that's why the existing scripts never needed any
Google auth. The same unauthenticated request against a per-manager tab (e.g. Anthony's,
`gid=267061372`) returned **HTTP 307 with an empty body** — a real redirect to a login
flow, not CSV data. Both tabs live in the same spreadsheet file, but the per-manager tabs
are evidently more restricted (likely via Sheets' "Protected sheets and ranges," which
can lock a tab down independent of the file's overall link-sharing).

So the script needs one piece of infrastructure this codebase's tooling doesn't have
today: **a Google service-account credential**, given view access to the workbook, used
to authenticate the CSV fetch (a short-lived OAuth bearer token, conceptually similar to
how the Supabase service-role key already works, just for Google instead). Given the
transition-only lifecycle above, this is worth treating as a small, one-time setup cost
(create the service account, share the sheet with its email address, store the
credential alongside the other secrets in `.env`) rather than something to build a more
elaborate, reusable Google-auth layer around.

## 2. Build it as one real, committed script — not scheduled, but not a throwaway either

Recommend a real script (`scripts/import-fatigue.mjs`, same family as the existing
import scripts) rather than a scratch snippet, even though its useful life is bounded:
- It will run more than once regardless of rollout shape — at minimum to re-sync
  Anthony's own numbers if the actual cutover slips past this week's manual seed, and
  for however many managers cut over in the eventual rollout.
- Any script that writes production data is expected to leave a durable, committed trail
  per this project's own standing rule — a one-off snippet run from a scratch file and
  discarded doesn't satisfy that, even if it's only ever run a handful of times.
- The parsing rules are already fully confirmed and stable; the only work beyond a
  single hardcoded run is parameterizing manager identity, which is needed regardless of
  how many times the script ultimately executes.

Once every manager has cut over and the script's job is permanently done, it can be
deleted outright (or left inert with a comment noting why) rather than kept "just in
case" — nothing about this recommendation implies it needs indefinite upkeep.

## 3. Risks specific to a bulk import that the per-game RPC never has to worry about

The RPC's safety comes from narrow scope and a trusted upstream: it only ever touches
the two managers in one already-validated game, using card_keys that were already
checked against `public.cards` when the roster snapshot was frozen at game creation.
None of that protection exists for free here:

- **No FK safety net.** `player_rest_state.card_key` has no foreign-key constraint
  against `public.cards`. A typo'd or stale card_key from the sheet wouldn't error, it
  would silently insert an orphan row that never matches a real card and is just quietly
  never read. The script must validate every card_key against `public.cards` before
  writing (the same check already done by hand for Anthony's 7 rows this week) — a real,
  built-in step, not an afterthought.
- **user_id resolution per manager.** The script needs to resolve each sheet tab name to
  a real `user_id` automatically (via `elements_managers`/`profiles`, matching
  `manager_name`) — with a defined behavior for a manager whose Discord isn't claimed yet
  (no `profiles` row): skip and report, never crash the whole run.
- **The "reconciliation to zero" problem — genuinely new, not something the one-off seed
  had to solve.** For Anthony, only the 7 non-zero rows were written into what was an
  empty table, so there was nothing to reconcile. A run against a manager who's already
  been seeded once (a re-sync before their actual cutover) is different: if a player who
  previously imported with real debt is fully rested by the time of a later run, the
  script must explicitly write that as 0, or the old non-zero row silently persists
  forever. Safest fix: on every run, upsert **every** real roster card_key's current
  value, zeros included, rather than only non-zero ones (a trivially small SQL statement
  either way — 18-25 rows per manager).
- **Cross-source disagreement, same as the Slim Branham case this week.** The script
  should detect when the active-roster section and the catalog sections disagree for the
  same card_key and skip + report that card_key for manual review, never silently pick
  one — same rule as this week, just automated instead of done by hand.
- **Partial-failure handling if a rollout run covers more than one manager at once.**
  Each manager's import should be its own transaction, so one manager's bad row doesn't
  roll back another's. Combined with idempotent upserts, "resumable" falls out for free —
  a partial or failed run can just be re-run; already-correct managers are a no-op,
  failed ones retry cleanly. No separate checkpoint/resume-state tracking needed, which
  fits the "run a handful of times, by hand" nature of this tool.
- **Sheet-staleness at the actual cutover moment.** Not a code problem — an operational
  one. Since the real season is ongoing and the sheet is hand-updated, each manager's
  import should run as close to *their* real cutover moment as practical, and "the moment
  the script ran for that manager" should be treated as the true baseline going forward —
  consistent with the spreadsheet becoming irrelevant for them immediately afterward.

## 4. Scaling to 12+ managers — no material redesign needed if built right from the start

Because the plan is to standardize every manager onto the one confirmed dual-sided
convention before a wider rollout, the parsing logic itself doesn't need to change
between "just Anthony" and "everyone" — same header, same rules, same catalog
cross-check, for every tab. The only thing that changes is how many times it's invoked,
and over what timeframe (per the lifecycle section above: a handful of cutover moments,
not a continuous process). As long as the script takes manager identity as a parameter
(tab name/gid → resolved `user_id`) from day one instead of hardcoding Anthony, going
from 1 manager to 12+ is "loop over a list of tabs, once, at each manager's cutover" —
no rewrite. Each tab's header row should still be validated against the expected layout
before parsing (mirroring `card-source.mjs`'s own `findHeaderRow` check) — cheap
insurance against a manager whose tab hasn't actually been converted to the standard
convention yet, so the script fails loudly and skips that one manager instead of
silently misreading a differently-shaped sheet.

## Effort / risk

| Piece | Effort | Risk | Notes |
|---|---|---|---|
| Google service-account auth for the sheet fetch | S-M | Low | New, but small and one-time; retired once the transition period ends |
| Card_key validation against `public.cards` | S | Low | Same query pattern already used to verify Anthony's 7 rows |
| Manager-name → `user_id` resolution | S | Low | Straightforward join against `elements_managers`/`profiles` |
| Cross-source (active-roster vs. catalog) discrepancy detection | S | Low | Same comparison logic already worked out this week, just automated |
| Full-reconciliation upsert (zeros included) | S | **Med** | The one genuinely new correctness requirement vs. this week's manual seed — matters for any re-run before a manager's real cutover |
| Per-manager transaction + idempotent re-run | S | Low | `on conflict do update`, already proven this week |
| Looping over 12+ tabs, staggered over the rollout | S | Low | No redesign needed — parameterized from the start |

Nothing here is large. The one genuinely new piece of infrastructure is the Google
auth, and per the lifecycle note above, it's worth building as something intentionally
temporary — set up once, used for the transition period, retired with the rest of this
tool once every manager is cut over.
