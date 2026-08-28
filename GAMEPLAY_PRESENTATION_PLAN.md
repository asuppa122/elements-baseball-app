# Elements Baseball — Gameplay Presentation Plan

Companion to [GAMEPLAY_PRODUCT_VISION.md](GAMEPLAY_PRODUCT_VISION.md). That document covers gameplay
*design philosophy* (what Elements should be, informed by studying ERA Baseball and Showdown 2000).
This document is scoped specifically to *presentation* — what playing a game should actually look and
feel like — and supersedes that doc's earlier, more tentative presentation framing with a more
ambitious target: not "we digitized MLB Showdown," but "Elements is the place people want to play MLB
Showdown."

Status: **study and plan complete, Phase 0 in progress.** Written 2026-08-27.

## The core reframe

The current gameplay screen (`GameplayPlayableShellPage.tsx`, `gameplay-shell.css`) was built to expose
the engine during development — not as the intended finished product. It succeeded at that job. The
task now is building the presentation layer the proven engine deserves, without touching the engine
itself:

```
Elements engine determines reality
  ↓
game state/event produced
  ↓
presentation layer interprets that event
  ↓
animation / field movement / scoreboard / messaging tells the manager what happened
```

The animation never determines the baseball outcome. This separation is what protects this project's
231/231 deterministic Rulebook coverage and everything built on top of it this year — presentation
work must never become a reason to touch `engine.ts`/`coreGame.ts`/`decisionEngine.ts`'s actual
resolution logic.

## What was actually studied (not assumed)

- **Zero animation infrastructure exists today.** Grepped `gameplay-shell.css`, `gameplay-lab.css`,
  `gameplay-demos.css` for `@keyframes`/`transition`/`animation`: one stray hover transition, nothing
  else. This is a clean slate, not a retrofit.
- **The current visual identity is a real, deliberate style** — monospace font, black/CRT-green/gold
  palette (`#d5aa25`/`#f0c832` accents, `#7fb487`/`#82c18d` green text), diamond via rotated squares —
  not an accident, but explicitly a functional wireframe.
- **Decision-prompt copy is already better than it might look.** `decisionEngine.ts`'s
  `getDecisionView()` produces real baseball language today — e.g. title "Runner-on-2B RTH",
  description "Batter is out at 1B... Roll To Hold the runner from 2B: 1–10 advances to 3B; 11–20
  stays at 2B." The "developer language" problem is concentrated in the *surrounding shell* (the log
  renders raw `event_type.replaceAll('_',' ')`; turn labels are generic "HOME MANAGER TURN"), not the
  decision prompts themselves.
- **A purpose-built hook already exists, unused.** `DecisionView.confirmationSummary: (ids: string[])
  => string` is defined in the type and called nowhere with real logic — every decision type returns
  `() => ''`. This is exactly where play-by-play narration ("Gurley is OUT at home") belongs, and it's
  already wired into the type signature waiting to be filled in.
- **Event payloads are raw, not narratable.** `game_events` rows store things like `{roll,
  chartResult, playableShell: true}` — enough to know *what number came up*, not enough to
  reconstruct a sentence without also diffing base-state before/after. Real, scoped engineering work,
  not a copy change.
- **`MOBILE_PARITY_STANDARD.md`** already states "same content + same functionality + same visual
  capability + same design intent" — an existing, binding standard this plan inherits rather than
  reinvents.
- **The black/gold identity already exists everywhere else in the app** (Cards, Rules, Team
  Builder) — gameplay is the one surface that never adopted it, running its own CRT-green scheme
  instead.

## The 12 questions, answered

1. **What's functional scaffolding that should eventually disappear?** The monospace/CRT aesthetic
   itself; the raw `event_type.replaceAll('_',' ')` log line; generic turn labels; the flat button
   grid for every decision regardless of stakes; the bare `FINAL — Away 4 · Home 7` end screen.
2. **What must always remain visible?** Score, inning/half, outs, base state, current matchup, whose
   turn it is, the fatigue-adjusted rating whenever it differs from printed, and an accessible path
   back to the full technical event log for debugging.
3. **What should become the primary visual focus?** The batter/pitcher matchup and the live diamond —
   matching where the engine already concentrates state (`plateAppearance`, `bases`).
4. **How should the batter/pitcher confrontation be presented?** Real card imagery (already a
   first-class, R2-hosted asset used everywhere else in the app) instead of plain text rows; ratings
   that visibly change state when fatigue applies, building on this week's `X → Y` convention rather
   than redesigning it.
5. **How should pitch and swing rolls come alive?** Pure motion/sequencing on top of already-correct
   data — `resolvePitchRoll` already computes `pitchTotal`, `advantage`, and the chart result in one
   synchronous call. The desired reveal sequence (roll → advantage → swing → result) is a replay of
   data that already exists, not new engine work.
6. **How should the field communicate runner movement and defensive outcomes?** Base-state diffing
   (`state.bases` before/after) animated as movement. The "two disconnected checks" problem for DBP is
   actually two sequential *real* engine events already (`GB_STANDARD_FIRST_CHECK` →
   `GB_STANDARD_SECOND_CHECK`) — they just aren't presented as connected yet.
7. **How should manager decisions interrupt/focus the experience?** The Select→Confirm→Locked state
   machine already exists for exactly this. What's missing is visual interruption (a focused
   treatment), not a new state model.
8. **How should routine plays differ from major moments?** `gameBoundaryEngine.ts` and season config
   already carry the raw signal (inning, score margin, outs, RISP) — "moment intensity" is a derived,
   read-only presentation concern, not new rule logic.
9. **How should play-by-play work?** The one area needing real new plumbing: either capture richer
   descriptive data into `game_events` payloads at write time (recommended — additive, doesn't touch
   resolution logic), or reconstruct sentences from consecutive state diffs (harder, more fragile).
10. **Desktop and mobile?** Not a new problem — apply the existing `MOBILE_PARITY_STANDARD.md` bar,
    don't reinvent it.
11. **What animation/motion system should be built?** Given zero existing infrastructure, a real,
    shared, deliberately-scoped module (timing tokens, a reveal-sequence primitive, a moment-intensity
    tier) built once and reused — not ad hoc animations per screen.
12. **What should the visual identity actually be?** Bringing gameplay into the black/gold identity
    that already exists everywhere else in the app, with sports-broadcast polish — not inventing a new
    identity from scratch.

## Phased plan — safe-now vs. blocked-on-multiplayer-infra

The dividing line is the one from the rule-engine trust audit: **turn authorization and realtime sync
don't exist yet** (confirmed that week: `gameplay_feature_access` allowlist, home-only RLS on
`games`/`game_events` before the Phase 1A fix). Anything that only concerns how *one* client presents
an already-resolved engine event is safe today. Anything depending on a second real person's *live*
state cannot be honestly verified until turn authorization and sync both exist — building it now risks
tuning presentation logic against a fake/simulated opponent that real sync will invalidate.

| Phase | Scope | Status |
|---|---|---|
| **0 — Visual language foundation** | Design tokens (color/type/motion timing), the shared animation module, moving gameplay into the existing black/gold identity | **Safe now** — zero multiplayer dependency, pure design-system work |
| **1 — Matchup and roll presentation** | Card-based batter/pitcher confrontation, pitch→advantage→swing→result reveal sequence, fatigue visual weight | **Safe now** — replays data from one already-completed `resolvePitchRoll`/`resolveSwingRoll` call on one client |
| **2 — Field/outcome storytelling + play-by-play plumbing** | Runner-movement animation from base-state diffs, DBP throw-sequence chaining, outcome announcements, richer `game_events` payload capture | **Safe now** — derived from state this client already has after a resolved play; payload capture is additive, not a resolution-logic change |
| **3 — Moment intensity** | Late-inning/walk-off/shutout/milestone visual escalation | **Safe now** — a read-only classifier over existing state, no new interaction model |
| **4 — Manager-decision focus treatment** | Visually spotlighting `SEND RUNNER?`/`STEAL?`/etc. | **Safe to build the single-client shell now.** The specific `YOUR DECISION`/`OPPONENT DECIDING`/`DECISION LOCKED`/`RESULT` states are **not verifiable yet** — they're definitionally about the other real client's live state, which doesn't exist as an enforced concept without turn authorization, and can't be observed live without realtime sync. Build the visual chrome now; expect rework once wired to real cross-client state. |
| **5 — Multiplayer tension states** | `YOUR DECISION`/`OPPONENT DECIDING` driven by real cross-client state | **Blocked** until turn authorization and realtime sync both exist |

**Sequencing recommendation:** Phases 0–3 start immediately and deliver real, visible improvement
without touching anything fragile. Phase 4's visual shell can be built alongside them. Phase 5 waits —
not because the ambition is wrong, but because building it against today's single-client reality would
mean redoing it once real sync lands, which is exactly what this plan's own "protect the engine"
principle (and the parallel discipline around presentation-layer investment) argues against paying for
twice.

## Data that does not exist yet — do not trust the mockup's numbers

Recorded 2026-08-28, from designing the gameplay screen against the real engine. The screen mockup
(`.design-mockup/`, published as an Artifact) shows per-player stat lines in the lineup rail —
`2-3`, `1-2`, `0-2` — and a `RESULT` panel citing RBI and runs scored. **Every one of those numbers is
invented for the mockup. Nothing in the engine produces them today.** A future session picking up this
work must not assume the screen is backed by real data just because it looks finished.

What is actually tracked, verified against `src/gameplay/types.ts`:

| Wanted | Status | Where it would come from |
|---|---|---|
| Who batted / who pitched, per game | **Tracked** | `hitterPlateAppearanceCardKeys`, `pitcherAppearanceCardKeys` — written only in `finishPlateAppearance()` |
| Pitching line (IP, ER) | **Derivable today** | `defensiveOutsRecorded − pitcherEntryDefenseOuts`; `pitcherRunsAllowed` |
| Post-game rest consequences | **Persisted server-side; never yet exercised by a real game** | The authoritative write lives in SQL inside `save_gameplay_lab_state` (`20260826_gameplay_rest_tracking_on_completion.sql`, commit `42cc9d6`), not in TypeScript. `restTracking.ts` → `applyGameCompletionRest` is the reference implementation the SQL mirrors and what `postGameSummary.ts` projects with — it has no TS caller *by design*. See "Live-path gaps" below for what is genuinely open. |
| Runs per inning (line score) | **Tracked** (added 2026-08-28) | `runsByInning` on `GameState`, written as runs score via `inningScore.ts`. Optional — all 14 games persisted before it read as `recorded: false` and must render dashes, not a row of zeroes. |
| Batting lines (AB / H / result mix) | **Not tracked** | Reconstructable from `SWING_RESOLVED` events' `chartResult`; moderate work |
| RBI, runs scored per batter | **Not tracked, and not reconstructable as-is** | Needs base-state diffing — this is exactly the Phase 2 "richer `game_events` payload capture" item above |

Consequence for sequencing: a post-game box score should ship in two tiers. Tier one uses what exists
(final score, line score once tracked, pitching lines, rest consequences, appearances) and is not held
hostage to tier two (full batting box), which depends on the Phase 2 payload work. The rest-consequences
line is the genuinely Elements-specific part — no other product's box score tells a manager who is
unavailable for their next game.

## Live-path gaps — built and verified, but not yet proven by real play

Recorded 2026-08-28. These are the difference between "the engine can do this" and "this happens
when someone plays". None of them is a missing implementation; each is a way the implementation
could be wrong or drift without anyone noticing.

### 1. Rest persistence is verified but has never run on a real game

**Not** an unwired feature — this is the correction to an earlier reading of it. The write-back
exists, is applied to the live database, and was end-to-end verified (commit `42cc9d6`): the
deployed function body was confirmed by `pg_proc` query, and all five branches were exercised
against the live RPC on an isolated synthetic `season_id`.

What is open is that **no real completed game has ever gone through it**. All five completed lab
games were created 2026-08-23/24 and so predate both the PA markers (`d5d8777`, 2026-08-26 14:06)
and the RPC itself (`42cc9d6`, 2026-08-26 14:42). Every row now in `player_rest_state` shares a
single `updated_at` of 2026-08-26T21:26:10Z and carries values like 44 and 47 — a hand-seed, not
a computed result. So the path is verified in the lab and unexercised in the wild.

Closing this means playing one real game to completion and confirming the rows move. It is a
verification task, not a build task.

### 2. The three-step rest sequence is implemented twice, and nothing tests that the two agree

`restTracking.ts` (TypeScript, harness-covered) and the SQL body of `save_gameplay_lab_state` each
implement appearance-increment / flat-decrement / milestone-decrement independently. The SQL is
authoritative for what persists; the TypeScript is what `postGameSummary.ts` shows the manager
after the game. **Nothing compares them.** If either changes alone, the projection shown on screen
and the number actually written diverge silently — and the screen is the only place a manager would
notice. This is the real risk in this area, and it is larger than either item the divergence would
sit between.

### 3. The migration file's own header contradicts what happened

`20260826_gameplay_rest_tracking_on_completion.sql` opens with "NOT applied yet -- review before
running". It was reviewed, run and verified the same day; the header was never updated. Anyone
reading the file first would conclude the opposite of the truth. (Fixed 2026-08-28.)

### 4. The client-side rest projection cannot reach the season game count

`postGameSummary.ts` returns `MISSING_SEASON_GAME_COUNT` because the milestone step needs the
manager's completed-game count for the season, which lives in the `games` table rather than
`GameState`. The SQL already derives this correctly server-side (`count(*)` over that manager's
completed games, including the one just finished).

Small, and worth doing the right way round: the projection should read the authoritative post-write
`player_rest_state` values rather than recompute a parallel answer from a count it fetches itself.
Recomputing would add a third implementation of the same rule to the two in item 2.

### 5. One modeling choice was flagged for a second look and never revisited

The migration reads the Rulebook's default-attributes override ("in order to avoid accruing fatigue
effects") as exempting **only** the appearance increment — the flat per-game decrement and any
milestone bonus still apply, on the reasoning that those are rest-day grants rather than accrual and
the Rulebook offers no carve-out from a benefit. That was deliberately flagged as a judgment call
rather than treated as self-evident, and is now persisting real values. It deserves a rules
confirmation.
