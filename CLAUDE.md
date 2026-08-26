# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This `Project/` folder is the actual git repository and npm workspace — run all commands from here, not from the parent `elements-baseball-app/` folder (which is just a container for `Builds/`, `Stable Backups/`, and reference data ZIPs).

## Project Philosophy (Elements Baseball)

These principles are durable — they apply to every session working in this repo, not just gameplay-engine work.

### Rulebook as source of truth

- The Elements League Rulebook (Google Doc) is canonical — not generic baseball rules, not generic MLB Showdown rules. In code, this means every non-trivial gameplay branch traces back to a specific Rulebook rule (see `src/gameplay/README.md`'s "source-of-truth principles" for the engine-level framing of the same idea); digital behavior may change *how* a rule is executed but never *what* the rule is.
- The website Rulebook must mirror the Google Doc's exact structure: Roman numerals, section titles, lettered subsections, nested numbering, order, rule text, examples, notes, tables, and images. Do not reorganize into "cleaner" categories.
- Rulebook card/example images (e.g. sections 3A–3D, see `src/assets/rulebook/`) belong with their respective sections.

### Four rule categories (visually distinguished in the digital Rulebook)

1. **Official Elements Rulebook Rule** — exactly what the Rulebook currently says.
2. **Approved Digital Gameplay Behavior** — something already decided to work differently because the app handles it digitally (e.g. lineups auto-reveal instead of being manually posted).
3. **Proposed Digital Gameplay Update** — a proposed change needed for online play that still needs league confirmation.
4. **Rule Clarification Needed** — the Rulebook doesn't define this clearly enough to safely program. Never silently invent an answer here — flag it instead.

### Redesign freedom vs. locked scope

- Default: free to restructure layouts, components, state architecture, and CSS as needed, AS LONG AS content, functionality, data behavior, and established requirements are preserved. "Preserve what the app needs to accomplish, not necessarily how it accomplishes it today."
- This freedom is overridden the moment the user says: keep everything else unchanged / do not redesign / only change this / this section is approved / this section is locked.
- If a structural improvement would change a league rule, feature requirement, or established data behavior — stop and discuss before changing it. Technical architecture opinions are fine to act on; rule opinions are not.

### Desktop + mobile parity (app-wide requirement)

- Mobile must mirror desktop in functionality, information, and design intent — not be desktop compressed until it fits.
- Responsive changes should reflow/restructure (e.g. stacking columns), never just shrink content to illegibility.
- Every meaningful UI change should be checked at: normal desktop, condensed desktop, tablet, ~390–430px mobile, and narrower widths where practical.
- (See "Mobile parity" under Architecture below for the project's specific binding standard doc.)

### Testing philosophy

- Correctness is proven by targeted deterministic scenarios that directly construct the game state needed (inning, outs, runners, rolls, etc.) — not by hoping random simulation stumbles into the right condition.
- For every conditional mechanic, prove both directions: the option appears when legal, AND does not appear when illegal (positive + negative eligibility tests).
- Every fixed bug becomes a permanent regression test — a bug is not "done" until it can never silently return.
- Coverage is measured per mechanic (e.g. "DBP 42/42 passing"), not by games-completed counts. Full-game CPU simulations (100/1,000/5,000+) are for finding unanticipated interactions or validating statistical frequency — not a certification ritual to run by default. Before running a large simulation, know what question it answers.
- Testing tiers, in order of what they prove: deterministic rule tests → interaction tests (multiple mechanics together) → manual/UX testing (feel, clarity, flow) → full-game simulation (unanticipated interactions) → statistical validation (frequency correctness at volume).
- (See "Testing model" under Architecture below for where these suites actually live in the codebase.)

### Season configuration

- Nothing is hard-coded to one MLB season. The engine reads an active season configuration (roster size, DH rules, point caps, era-specific rule activation like the 2023+ extra-innings runner rule).
- Current league season: 1925 rules blueprint (no DH, 18-player roster, 4,000-point cap).

### Working style with an AI coding partner

- Targeted correction request → change only the requested thing, preserve everything else.
- Explicit redesign authorization → full structural/design freedom.
- Ambiguous league rule → discuss it, never invent an answer.
- A better technical architecture that requires reworking existing code → say so and prefer the better architecture over stacking patches (this is a technical-only exception; it does not extend to rule behavior).
- Anything that can be automatically verified → write a test for it rather than asking for manual reproduction.
- Any UI change → consider desktop and mobile together, not desktop first then "make mobile work later."
- An approved mockup is the visual specification, not loose inspiration — if matching it requires restructuring existing CSS/layout, restructure it. Flag before implementation if something in a mockup genuinely can't or shouldn't be reproduced.
- Any script capable of writing to production — imports, syncs, migrations, backfills — must never be run live "just to check on something else." If a command might have real side effects (Supabase writes, R2 writes, anything beyond a read), that has to be the explicit, singular, confirmed purpose of running it — never a side effect of investigating an unrelated question (e.g. testing shell/argument-forwarding behavior). When in doubt whether a command is read-only, treat it as if it isn't.
- Production writes belong in a real, reviewed npm script (e.g. `scripts/import-published-status.mjs`), not an ad-hoc inline write command (`node -e "..."`, a one-off snippet). Found in practice, not just in theory: this environment's own permission classifier reliably let an established, already-reviewed npm script run (`npm run import:published-status -- --write`) while blocking equivalent inline write attempts used to debug it. Beyond the permission mechanics, a reviewed script is also just better practice for anything touching production — it's the thing that gets read, diffed, and committed, unlike a throwaway command typed once and gone.
- Any process that modifies production data — a committed script, a manual edit, direct SQL, dashboard changes, or work done in a different tool or session — must leave a durable trail in this repo (at minimum a commit or a CHANGELOG entry) describing what changed and why. A data-repair effort with no trail is exactly as unverifiable a week later as if it never happened.
- A "this is already fixed/done" claim — from a document, a CSV, a comment, or a prior session — is never sufficient on its own. Independently verify it against live state before trusting or repeating it, the same standard as verifying any code change.

## Commands

```bash
npm run dev             # start Vite dev server (usually http://localhost:5173)
npm run build            # tsc -b (project references) + vite build
npm run lint              # eslint .
npm run preview          # preview a production build
```

There is no unit test runner (no vitest/jest, no `npm test`). Gameplay-engine correctness is instead verified by deterministic, in-app scenario harnesses — see "Testing model" below.

Card-data import scripts (Node, read `.env` via `dotenv`):

```bash
node scripts/inspect-gviz.mjs      # npm run inspect:cards
node scripts/import-cards.mjs      # npm run import:cards
node scripts/import-images.mjs     # npm run import:images
node scripts/audit-card-source.mjs # npm run audit:cards
```

### Local workflow scripts (Mac `.command` double-clickables, repo root)

- `APPLY_UPDATE.command` — rsyncs a delivered project ZIP into `~/Desktop/elements-baseball-app`, preserving `.env`, `.git`, `node_modules`, `json.txt`; runs `npm install`.
- `RUN_LOCAL.command` — `npm run dev` against `~/Desktop/elements-baseball-app`.
- `PUSH_LIVE.command` — prompts to confirm desktop+mobile / app+`/demo` were tested, then `git add`, `git commit`, `git push origin main`. Vercel auto-deploys both the league app and `/demo` from one push (same Vercel project).
- `RESTORE_GIT.command` — if `.git` is ever missing, re-initializes it and re-clones tracking from `github.com/asuppa122/elements-baseball-app` (`git init` → add `origin` → `fetch origin main` → `reset --mixed origin/main`), then sets `main` to track `origin/main`. No-ops if `.git` already exists.

Local demo route: append `/demo` to the dev URL (e.g. `http://localhost:5173/demo`). Live: `https://elements-baseball.vercel.app` and `https://elements-baseball.vercel.app/demo`.

## Stack

React 19 + TypeScript + Vite, React Router v7, Supabase (auth, Postgres, storage) with Discord OAuth, deployed on Vercel. No component library/CSS framework — plain CSS files imported per feature (`App.css`, `roster.css`, `gameplay-shell.css`, `responsive-v1.2.23.css`, etc.), all imported centrally in `src/App.tsx`.

Env vars come from `Project/.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, ...); `src/lib/supabase.ts` throws at import time if either is missing.

## Architecture

### Production vs. Demo Mode — one codebase, no branching by build

There is no separate demo build. `AuthProvider` (`src/auth/AuthContext.tsx`) derives `isDemo` purely from `window.location.pathname` starting with `/demo`. When `isDemo` is true it injects a fixed fake session/profile and skips Supabase auth entirely. `src/App.tsx` duplicates every route once under `/` and once under `/demo/...`, pointing at the *same* page components. `src/lib/appPaths.ts#appPath(path, isDemo)` is how components build in-app links that stay under `/demo` when appropriate. When adding a page/feature, wire it into both route trees and use `appPath` for any internal navigation — do not create demo-only components.

### Card data pipeline

`src/services/cardDatabase.ts` batch-loads all rows from the Supabase `cards` and `card_images` tables (1000-row pages) and assembles `CardRecord`s (see `src/types/card.ts`). The Node scripts in `scripts/` (`import-cards.mjs`, `import-images.mjs`, `audit-card-source.mjs`, `inspect-gviz.mjs`) are the offline ingestion side — they pull from a Google Sheets/gviz export and Cloudflare R2 image storage into the same Supabase tables. `ACTIVE_SEASON_CONFIG` in `src/gameplay/seasonConfig.ts` gates which season's cards are eligible.

### Gameplay engine (`src/gameplay/`)

This is the largest and most architecturally significant part of the app — read `src/gameplay/README.md` for full framing before changing anything here. Key points:

- **Rulebook is the source of truth** — see Project Philosophy → "Rulebook as source of truth" above; `src/gameplay/README.md`'s source-of-truth principles are the engine-level statement of the same rule.
- **Pipeline:** Pitch Roll → Advantage → Swing Roll → Chart Result, implemented across `engine.ts` (pitch/advantage/state transitions, `resolvePitchRoll`, `resolveSwingRoll`, pause/resume, `stateVersion` checks) and `coreGame.ts` (chart resolution, `resolveSwingChart`, `resolveCoreResult`, plate-appearance completion). `decisionEngine.ts` layers manager decisions (steals, bunts, pinch hitters/runners, substitutions, double switches, extra-base/tag-up runner selection) on top using a shared **Select → Confirm → Locked** state machine (`getPrePitchActions` → `beginPrePitchDecision` → `getDecisionView`/`validateDecisionSelection` → `confirmManagerDecision` → `resolveDecisionRoll`).
- **`GameState` (`types.ts`) is fully serializable and is the single persisted unit.** It carries frozen roster snapshots (`rosterSnapshot.ts` validates a saved Team Builder lineup, then snapshots it — an in-progress game never reads a live/mutable roster), pregame state per side, bases/outs/score, lineup cursors, the current plate appearance, `pendingDecision`, and an authoritative `stateVersion`. `gameRepository.ts` persists/reloads this against Supabase; `assertExpectedStateVersion` (engine.ts) rejects stale/double writes, so pause/resume must always round-trip through the full state, not partial deltas.
- **Rule condition taxonomy** (used throughout as `RuleConditionType`): `RC1_VISIBLE_STATE`, `RC2_LOCKED_MANAGER_DECISION`, `RC3_MLB_TIMELINE`, `RC4_ACTIVE_SEASON_CONFIGURATION`, `RC5_CONDITIONAL_GAME_STATE`.
- **Dice:** all production rolls happen client-side via `dice.ts`; `QueuedTestDiceProvider`-style deterministic providers exist only for scenario harnesses/dev testing and must never be reachable from real user gameplay.
- **`/games/lab`** is a private, unlinked route gated by the `gameplay_feature_access` Supabase allowlist — it's the active gameplay-engine development surface (pregame setup, live game state, playable shell, verification), separate from the public `/play` and `/games` routes which still show "coming soon" in Demo Mode.

### Testing model (no test runner)

Correctness is proven by deterministic, hand-written scenario suites that run *inside the app* (and can be invoked from the private `/games/lab/verification` page), not by a `jest`/`vitest` command:

- `scenarioHarness.ts`, `groundBallScenarioHarness.ts`, `fatigueScenarioHarness.ts`, `gameBoundaryScenarioHarness.ts` — deterministic branch/regression matrices (`runNonGbScenarioMatrix` etc.) that construct an exact `GameState` fixture, drive it through the engine/decision APIs, and assert an exact Rulebook outcome.
- `testHarness.ts` — seeded, longer-running certification-style playthroughs with state invariants (no duplicate baserunners, no negative scores, batting-order integrity, etc.) checked after every transition.
- `rulebookCoverage.ts` aggregates the fixture-independent suites above into branch counts by mechanic; see `RULEBOOK_COVERAGE_ARCHITECTURE.md` for the evidence-layer model (deterministic branch tests → regression tests → interactive verification → rules demos → complete-game simulation → statistical validation) and the standing regression rule: any bug found via manual/complete-game play must get a reproducing scenario added with a stable ID *before* being called fixed, and that scenario stays permanently.

When you touch gameplay logic, extend the relevant scenario harness/matrix rather than adding an ad hoc script, and prefer reproducing a bug as a new deterministic scenario before fixing it.

### Mobile parity

`MOBILE_PARITY_STANDARD.md` is the binding acceptance standard for the principle in Project Philosophy → "Desktop + mobile parity" above.

### Versioning

`CHANGELOG.md` is updated per release and `package.json`'s `version` is kept in sync; entries describe the Rulebook/behavioral effect of each change, not just the diff.
