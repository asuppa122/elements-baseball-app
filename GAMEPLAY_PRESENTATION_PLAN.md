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

## Rest tracking in the live path — status, traced 2026-08-28

Real PvP games do not exist yet, so nothing having written to `player_rest_state` is the expected
state of the world, not evidence of a defect. The question worth answering is whether the wiring is
in place and will fire the moment a real game completes, or whether it is an orphan that would
silently never run. **It was traced end to end, and it is wired and ready.**

### The firing path (each link verified, not assumed)

| Link | Verified |
|---|---|
| A completing play saves like any other | `GameplayGameStatePage.tsx` calls `saveGameplayLabState` unconditionally with the resolved state; nothing skips the save when `status === 'complete'` (the two `=== 'complete'` reads in the pages are a render condition and a pause-button disable) |
| Every mutation routes through one RPC | `saveGameplayLabState` is `supabase.rpc('save_gameplay_lab_state', …)`. The only other `from('games')` writes are the `insert` in `createGameplayLabGame`; everything else is a select |
| The RPC detects the transition | `if p_next_state->>'status' = 'complete' and current_game.status <> 'complete'` — fires exactly once, and a retried or duplicate save of an already-complete game cannot re-fire it |
| It has the inputs it needs | Reads the roster snapshot, `hitterPlateAppearanceCardKeys` / `pitcherAppearanceCardKeys`, and `restMilestones` out of `p_next_state`; derives the season game count itself with `count(*)`; reads prior values straight from `player_rest_state` rather than trusting anything client-side |
| It was actually applied | Commit `42cc9d6`: deployed function body confirmed by `pg_proc` query, all five branches exercised against the live RPC on an isolated synthetic `season_id` |

**`applyGameCompletionRest` (TypeScript) will never be called in production, and that is correct.**
It is not the mechanism. The authoritative write is the SQL, deliberately server-side so a client
cannot submit its own fatigue numbers. The TypeScript is the reference implementation the SQL
mirrors and the one `postGameSummary.ts` projects with. Its lack of a production caller is the
design, not an orphan — an earlier reading of this file got that backwards.

**Unblocks final post-game verification:** playing one game through `/games/lab` to completion is
the single action that both proves this path for real and gives `PostGameBoard` real content to
render against — today it shows "not recorded" on all five completed games, because they predate
`runsByInning` and the PA markers. Until then the board's populated state cannot be checked against
anything but constructed values.

**Status: ready, awaiting the first real completed game.** No completed game has exercised it
because all five predate both the PA markers (`d5d8777`) and the RPC (`42cc9d6`) by two days, and
every current `player_rest_state` row is a hand-seed sharing one `updated_at` with values like 44
and 47. Nothing needs building for this to work.

### What is genuinely open

**1. ~~The three-step sequence is implemented twice and nothing compares them.~~ Closed 2026-08-28.**
`restTrackingSqlParity.test.ts` evaluates the SQL's own expressions, extracted from the migration
text, against `restTracking.ts` over 1050 cases. Mutation-verified in both directions. It found real
drift immediately: the SQL folds the default-attributes exemption into its appeared flag, so the
exemption is a **contract on TypeScript callers** — and `postGameSummary.ts` was not honouring it,
projecting a fatigue charge for exactly the players a GM used default attributes to protect. Fixed.
Any new caller of `applyGameCompletionRest` must apply the exemption before calling.

**2. Small wiring job — the client projection cannot reach the season game count.**
`postGameSummary.ts` returns `MISSING_SEASON_GAME_COUNT` because the milestone step needs the
manager's completed-game count for the season, which lives in the `games` table, not `GameState`.
The SQL already derives it correctly server-side. Worth doing the right way round: after a game
completes, the projection should read the authoritative `player_rest_state` values that were just
written, rather than fetch a count and recompute — recomputing would add a *third* implementation
of the same rule to the two in item 1.

**3. A flagged modeling choice never got its second look.** The migration reads the Rulebook's
default-attributes override ("in order to avoid accruing fatigue effects") as exempting **only**
the appearance increment — the flat per-game decrement and any milestone bonus still apply, on the
reasoning that those are rest-day grants rather than accrual and the Rulebook offers no carve-out
from a benefit. That was deliberately flagged as a judgment call rather than treated as
self-evident. It will persist real values the first time a real game completes.

**4. The migration header said the opposite of the truth.** It opened "NOT applied yet — review
before running" for two days after it had been reviewed, run and verified. Fixed 2026-08-28.

## The playable shell writes a thinner event payload than the state page

Found 2026-08-28 while building the half-inning transition. Two pages persist gameplay, and they
write different payloads for the same event:

- `GameplayGameStatePage.tsx` writes the full picture — `score`/`resultingScore`, `batter`,
  `pitcher`, `inning`, `half`, `outs`, `bases`. Scoring plays are recoverable from it by diffing the
  before/after score, which is how the transition card lists them.
- `GameplayPlayableShellPage.tsx` writes `{roll, chartResult, playableShell: true}` and nothing else.

So of the games that exist, `65efe77d` (complete, 68/68 rich payloads) can produce a real scoring
list — the bottom-9th walk-off, Harry Kenyon on a `1B+` off Charles Heywood with two out — while
`42d9a80c`, `572d74b0`, `f718f0b0` and `be71a7ff` cannot, despite one of them being a 10-2 game.

**The consequence is pointed: the transition card lives in the playable shell, so every game played
on the page that shows the card will say the plays cannot be listed.** Closing it is small — the
shell already holds the same before/after state the state page writes; it just does not persist it.
That is the "richer `game_events` payload capture" item from Phase 2, and it is the cheapest of them.

**A second gap sits behind it, and is not small.** No `DECISION_RESOLVED` payload carries a score
at all (0 of 40 on `65efe77d`), so a run scored by a manager decision is invisible to any
score-diffing derivation, no matter which page wrote it. The transition card therefore reconciles
its derived runs against `runsByInning` and presents the list as **partial** when they disagree,
rather than showing a short list as the summary. Fixing this properly means recording runs at the
moment `decisionEngine.ts` scores them, alongside the existing `creditRunsToInning` call.

## Built but wired into nothing — do not rebuild, do not delete

Recorded 2026-08-28 from a full stock-take of the gameplay screen. Both of these exist, compile and
are covered; neither is reachable from any page. Without this note the likely failure is someone
rebuilding one from scratch or deleting it as dead code.

### `src/gameplay/presentation/sequence.ts` — KEEP, wire it later

`runSequence()` is Phase 1's third piece (the pitch → advantage → swing → result reveal). It is
written and has its own tests, and is imported by **nothing but its own test file**. The visual
motion it drives lives in `gameplay-motion.css`, which *is* imported by `App.tsx`.

**This gets wired in during the presentation thread. Do not delete it as dead code** — `knip` does
not flag it precisely because its test imports it, so the only signal it is unwired is this note.

### `src/gameplay/dice.ts` — unused, decide deliberately

`knip` reports it as a fully unused file. It holds `QueuedTestDiceProvider`, which `CLAUDE.md`
describes as the deterministic dev/test roll source. The scenario harnesses force their rolls by
other means, so nothing imports it. Either the harnesses should use it or it should go — but that is
a deliberate call about the testing model, not a cleanup to do in passing.

### The mockup is now tracked

`.design-mockup/` was untracked until 2026-08-28 — the entire three-column design existed only as
loose files on one machine. The artboards, `canvas.json`, `field.webp` (referenced by name from
`Main.dc.html`) and the design notes are now in git. Only the ~2.5MB seeded payload and the ~2.6MB
source render stay ignored, both regenerable.

**What the mockup is NOT:** implemented. The real screen is a single-column shell. See the stock-take
for the piece-by-piece split.

## Next major piece: implement the mockup, responsively

Requested 2026-08-28, after playing the real screen for the first time and hitting the gap between
it and the design directly. **The screen must be built to the mockup, and must adjust responsively to
the window** -- not a fixed desktop layout with a separate phone version, but one layout that holds
its design intent as the window changes (which is what `MOBILE_PARITY_STANDARD.md` already requires).

Scope, from the stock-take's NOT STARTED list:

- the three-column layout (lineup rail / centre field column / game rail)
- the field itself: nine fielders at true positions with live DEF ratings, replacing today's
  `Diamond` -- eleven lines rendering three base markers and the word HOME
- the DEF bar (C / INF / OF) across the top of the field
- batter and pitcher card imagery in the matchup
- the hitting rail with per-player rows
- the bullpen/bench panel (the *actions* already exist and are live; the roster view does not)
- the game menu behind the hamburger (pause now exists in the shell; save/exit/settings do not)

Sequenced deliberately AFTER the first full playthrough so it is built against a real completed
game -- real runners, real fielders, real line score, real scoring plays -- rather than against
constructed values, which is the position every presentation piece so far has been built from.

The mockup source is tracked in `.design-mockup/` (artboards + `canvas.json` + `field.webp`) and
published as an Artifact. `_shared-notes.md` and `_rail.txt` carry the exact palette, radii, control
heights and rail row anatomy, so the implementation has real specs rather than screenshots to work
from.

## Screen implementation status — 2026-08-28 (autonomous session)

The mockup is being implemented at **`/games/lab/:gameId/screen`**, side by side with the working
shell at `/play`, which is untouched and still the only surface that resolves a game. Every region
is now built and rendering live state.

| Region | State |
|---|---|
| Three-column responsive shell | **Done** — 1440 three columns, ~1024 two, phone single stack |
| Scorebug | **Done** — score, inning, out dots |
| DEF bar (C / INF / OF) | **Done** — via `getFieldingRating`, the engine's own exported helper |
| Field, nine fielders, runners | **Done** — true positions, live DEF, BsR/SB pills |
| Lineup rail | **Done** — real card art, active/on-deck verified against the engine |
| Matchup + roll readout | **Done** — fatigue-adjusted OB/CTRL via the existing RatingReadout |
| Chart readout | **Done** — printed ranges, live chart marked |
| Decision board | **Done** — the verified component reused as-is, rendered read-only |
| Availability (bullpen/bench) | **Done** — see the drift note in `availability.ts` |
| Game log | **Done, narrated** — `playNarration.ts`; pre-widening events stay raw on purpose |

**Not built, and stated on the surface where it is missing:** per-batter stat lines (AB/H not
tracked), play-by-play for events written before 2026-08-28 (their payloads recorded the dice, not
the play), the result rule headline (`confirmationSummary` is empty in all 27 decision types — an
engine change), moment takeover (the classifier exists; the treatment is a design piece), resign.

**The screen is read-only.** It renders a game; `/play` resolves it. Making it playable means either
duplicating the shell's action layer or refactoring the shell to share it — a decision left open
deliberately.

## Season game count for the rest projection — blocked on an RLS decision, not on code

Recorded 2026-08-28. `postGameSummary.restProjectionFor` still returns `MISSING_SEASON_GAME_COUNT`
because no caller supplies the count. Wiring it turns out NOT to be the small job it was listed as,
for a reason only found by reading with a service role:

`player_rest_state` carries a **select policy scoped to the owning manager**, and `games` is
home-scoped. So from one manager's session you can see neither the opponent's rest rows nor
necessarily their full completed-game count. Any client-side count is therefore right for your own
side and potentially wrong for theirs — and a rest projection that is silently wrong for one side is
worse than one that says it does not know.

The options are a decision, not a guess: expose a counting RPC that runs server-side (where the
existing rest SQL already does exactly this `count(*)`), or show the projection for your own side
only and say so, or read back the persisted rows post-completion and accept the same one-sided
limit. Left for review.

## BEFORE REAL PvP — a standing list, not a someday list

Recorded 2026-08-28 when the cutover decisions were settled. These are explicitly **not** parity
gaps and do **not** block cutting over to the new screen. They are listed here because the new
screen will look finished once it is live, and looking finished is exactly how work like this
slips.

Each one must be closed before real player-versus-player games start counting.

**1. Season game count for the rest projection (F).**
`postGameSummary.restProjectionFor` returns `MISSING_SEASON_GAME_COUNT` because nothing supplies the
count. Not the small job it was first listed as: `player_rest_state` has a select policy scoped to
its owner and `games` is home-scoped, so any client-side count is right for your own side and
possibly wrong for the opponent's. **Agreed direction: a server-side counting RPC**, mirroring the
`count(*)` the rest SQL already performs. Not a cutover gap because `/play` has the identical limit.

**2. `confirmationSummary` — empty in all 27 decision types (G).**
The hook exists in the type and every implementation returns `''`. Not a parity gap (both screens
lack it equally), but empty rule-explanation text undercuts the thing that makes Elements worth
playing digitally: that the app teaches the Rulebook while you play. **The rules text needs Anthony's
eye when this is written** -- it is rules-facing copy, not UI filler. Touching `decisionEngine.ts`,
so it is an engine change and wants its own careful pass.

**3. Default-attributes rules reading (K).**
Anthony is settling this in the Rulebook independently. It is on this list because the migration is
**already persisting real values** under that reading, so it matters before real games count
regardless of what happens with the screen. See the modelling note in
`20260826_gameplay_rest_tracking_on_completion.sql`.

### After cutover, agreed as refinements — not on this list

Moment takeover (I), the `sequence.ts` reveal (J), and the designed mobile rail layout (L). All
three are improvements over a screen that already beats `/play`, and all three are better judged
once real play is happening on it.
