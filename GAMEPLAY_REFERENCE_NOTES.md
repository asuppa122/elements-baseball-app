# Gameplay Reference Notes — ERA Baseball & Showdown 2000

Reference material only, gathered 2026-08-26 via live Playwright exploration of two
comparable dice-and-chart baseball card games. **This is not a spec.** Elements has its
own Rulebook as the actual source of truth — nothing here should be read as "we should
do it their way." Where something below looks structurally interesting, it's flagged as
such in Part B of the accompanying review, with an explicit line between "I'd build the
*plumbing* differently" and "the *rule* should work differently" (the latter is never
this document's call).

## Access notes (read this first)

- **era-baseball.vercel.app** — the Playwright browser session had a persisted login for
  account `suppastar122` (this appears to be the user's own account — the name matches
  `asuppa122@gmail.com`). Navigating to the root URL redirected straight into an
  **already-in-progress, real, live duel** against a real opponent (`xbeardedcanuckx`),
  mid-simulation. Per explicit user instruction, everything in Part 1 below was gathered
  by **passive observation only** — no clicks that could affect game state (no "Stop
  Simulation," no "Swing," no "PITCH," no "IBB," no lineup/bullpen/bench interaction, no
  "Forfeit"). The one interactive click made was a "Log" button that turned out to be a
  pure view toggle (diamond visualization ↔ text play-by-play), confirmed harmless.
  **Net effect: setup/new-game flow was never observed on ERA** — the session skipped
  straight past it. Everything in Part 1 is from watching this one real match unfold.
- **showdown2000.fun** — the user explicitly logged the browser session into their own
  account for this task and authorized full interactive play, scoped to that one browser
  context. Under that authorization, Part 2 below is from **real, active, permitted
  play** — a full account dashboard, a real "New Game" setup flow, a real lineup-build
  screen, and a real self-play game (code `C534HB`, both sides controlled by the same
  account) taken through a complete top half-inning. No credentials were entered or
  accounts created at any point (both sites' login forms were left untouched throughout
  this whole session, on principle, independent of what access the user had already
  granted).

---

## Part 1: ERA Baseball (era-baseball.vercel.app)

### What the URL structure suggests

`/duel/<id>` — each match is its own persistent, shareable URL. The root path redirects
to whatever duel a logged-in account currently has active (no explicit "resume game" UI
needed; this can't be verified for someone with zero active games, but there is
apparently no separate lobby/dashboard route the app falls back to as long as one is in
a match).

### Core resolution pipeline (from the play-by-play log)

Every plate appearance produces exactly two log lines, matching a two-roll pattern:

```
Roll: (18) +6, Advantage: Francisco Liriano
Roll: (5) Ichiro Suzuki: Strike Out [Liriano]
```

Read as: first roll (d20) plus a modifier (+6, source unconfirmed — plausibly a
Control/On-Base differential) determines which side has "advantage" for this PA; second
roll resolves the actual chart outcome, attributed to whichever side got advantage, with
the pitcher named in brackets regardless of who has advantage. This is structurally close
to Elements' Pitch Roll → Advantage → Swing Roll → Chart Result pipeline — a first roll
that decides who "wins" the matchup, then a second roll against the winning side's own
chart.

Ancillary rolls follow the same "extra modifier, named outcome" shape:

```
Roll: (9) + OF:+5, Runner Scores on Base Hit: José Reyes (23) (+10)
Rolling for double play
Roll: (17) + IF: +9, Double Play Successful: Gary Sánchez (9)
```

The runner-advancement roll shows the runner's own rating in parentheses (23) and a
target/threshold (+10); the double-play roll shows an infield modifier (+9) against the
batter's own rating (9). Both are visually distinct sub-events under the same PA, not
folded into the two-line pattern above — i.e., a single plate appearance can spawn a
variable number of log lines depending on what happens (comparable to how an Elements PA
can chain through multiple decision/roll steps before `finishPlateAppearance`).

### Decision UI — the batter's turn

When it's the batter's manager's turn to act, the interface shows a **"Swing" button** in
a "Batter options" group. It was **disabled** throughout observation — consistent with
this being a real async two-player match where the button only activates once the
opposing manager has thrown the pitch (i.e., decision-gating is enforced by whose actual
turn it is, not by an engine auto-advancing both sides). This is the clearest visible
analog to Elements' "decision required, game pauses" pattern — except here the pause is
a real wait for a real second human, not a single engine mediating both sides in
sequence.

A second, distinct view (reached via toggling to the "diamond" visualization — see
below) shows a **"PITCH"** button under the pitcher's card and an **"IBB"** (intentional
walk) button under the batter's side. IBB is a real, explicit, one-click manager decision
— directly comparable to Elements' `INTENTIONAL_WALK_CONFIRM` decision type. No bunt,
steal-attempt, or defensive-alignment controls were visible in what was observed, though
the match never reached a state where those would obviously apply (no runners on base
during observation), so their absence here is not evidence they don't exist elsewhere in
the UI.

### Two full visualization modes, toggled by one button

Clicking "Log" swaps between:
1. **A text/list play-by-play view** — box score across the top, two flanking player
   cards (current batter/pitcher), a scrolling log grouped by inning with "Current" vs
   "Previous" headers and explicit `END Top/Bottom N: X-Y` boundary lines.
2. **A visual baseball-diamond view** — green field graphic, small circles at each base
   showing occupied/empty runners, a literal **animated d20 icon in the middle of the
   diamond displaying the actual roll result**, large pitcher/batter cards flanking the
   diamond, and a **"2D" / "3D" / (third, unlabeled) dice-rendering toggle** letting the
   player choose how much visual flourish the dice get.

Both views share the same header (score, inning arrow + number, outs) and the same
bottom bar: full **both-teams' batting orders** shown as a horizontal strip of small card
icons (not just the current batter — the entire lineup, both sides, visible at all
times), plus **BENCH**, **BULLPEN**, and **MOUND** sections showing available
substitutes/relievers with their ratings, always visible without navigating away from the
live at-bat screen.

### Card presentation

Every card (large matchup view or small lineup-strip view) shows: name + card year,
point value ("410 PT."), a single headline rating number in a diamond badge (On-Base for
hitters, Control for pitchers), position + defensive rating pill(s) — some cards show
multiple position/rating pairs (e.g., a utility infielder shown with 2B/3B/SS ratings
simultaneously), speed rating + bat/throw hand, and the **full chart directly on the card
face** at all times (e.g. hitter: `SO- GB1-4 FB5-8 W9-10 S11-16 S+17-20 DB- TR- HR-`;
pitcher: `SO1-7 PU8 GB9-13 FB14-16 W17 S18-19 DB20 HR-`). Award badges (All-Star, Gold
Glove, MVP) appear as small icon+league-code pairs directly on the card. Nothing about a
card's real numbers is hidden behind a click or hover — full information is always on
screen.

### Simulation / fast-forward

A **"Simulation Running"** banner with a "Stop Simulation" button appeared while
observing, tied to a specific stated goal: *"Sim to Pitcher Fatigue."* A second, separate
**"Fast Sim"** button was visible in the diamond view. Together these suggest a tiered
system for skipping ahead through multiple plate appearances without per-pitch manual
input, with at least one mode that has an explicit, named stopping condition rather than
running indefinitely.

Noted for completeness only — **this is not a gap in Elements.** Elements is strictly
PvP: both managers make every live decision for their own side. A "simulate ahead"
feature doesn't fit that design and isn't something Elements should build; ERA Baseball
having one says nothing about Elements needing one.

### Box score depth

The live box score carries two stat columns beyond the standard R/H/LOB:
**"AVRL"** and **"ADV"** — unrecognized as standard baseball stats, almost certainly
dice-system meta-stats (plausibly "average roll" and an advantage-roll count/tally).
Full per-player hitting (AB/H/BB/S/DB/TR/HR/RBI/RS/SB/CS/K/DBP/OCHW/OCO) and pitching
(BF/IP/ER/K/H/BB/DBP/OCO/OCHW) tables are available, tab-switchable per team, with several
abbreviations (DBP, OCHW, OCO) that are specific to this system's own rule vocabulary,
not generic baseball stats — worth noting as a pattern (a dice-driven ruleset produces
dice-driven stat categories, not just traditional ones) without guessing at their exact
Elements-equivalent meaning.

### Other controls observed

**"Enforce BF"** (likely "Enforce Batters Faced," a fatigue/usage-rule toggle), **"Menu"**,
**"Forfeit"** (an explicit concession control), and a mobile-orientation nudge — *"Please
use in landscape mode"* — indicating the live-game screen is data-dense enough that this
site doesn't attempt true mobile-portrait parity for it, unlike Elements' explicit
mobile-parity standard.

### Console

2 console errors were present throughout observation; not investigated (out of scope —
this is a third-party site, not something to debug).

### Part 1b: a full game played, 2026-10-29

Anthony logged into the built-in browser, opened a CPU game and authorized full play.
The game was one opponent in a **Challenge** ("Hall of Fame 2020: Ted Simmons": beat six
teams with an uncapped 2020 roster to unlock a career card) — his 2020 side at home vs
the CPU "All Stars Cardinals". Played start to finish, **won 7-4**, which marked that
opponent Defeated on the challenge page. Viewport was a small 800x352 landscape pane.
Two rules below came from Anthony mid-game rather than from observation; they are marked.

#### Screen model

- **Your side is always on the left.** Cards, MOUND/BENCH/BULLPEN tiles and team DEF line
  (`CA: +5, IF: +8, OF: +4`) swap sides with the half. Opponent's on the right.
- **Header:** current pitcher's game line on the left (`15/22 BF, 4 IP, 4 K, 1 ER…` —
  BF used vs BF capacity), score / inning arrow / outs in the centre, current batter's
  game line on the right (`1/2, 1 HR, 1 RBI, 2/2 SB`).
- **Centre:** the two duel cards, a dot-matrix message line, dice-mode toggle, a small
  diamond with runner badges, `Enforce BF` and `Fast Sim` pills.
- **Bottom strip:** both full batting orders as small cards. The current slot is marked
  by a large number; runners' cards lift and get a `1B`/`2B`/`3B` tag; completed PAs
  become coloured tiles (red out, yellow sacrifice). Clicking a strip card enlarges it.
- **Five circles, top left and top right — the manager-decision budget** (Anthony): five
  per team per game, spent by steals, bunts and IBBs; white = used. When they run out
  BUNT and IBB simply disappear and runner badges stop responding — no message says why.

#### Turn flow

- Defence: `PITCH` (red when live) → `WAITING` while the hitter acts.
- Offence: `READY` → CPU pitches → `SWING`.
- Every roll is narrated in the centre: `ROLL: (19) +3, ADVANTAGE: WALKER BUEHLER`,
  then `ROLL: (2) EDGAR RENTERIA: STRIKE OUT [BUEHLER]`, then a turn label. The card
  with advantage glows gold.
- Dice modes: 2D, 3D (a tumbling die crosses the field), and none (a faint `[14]` only;
  also skips the full-field set-piece views). The choice resets after Fast Sim.
- No half-inning transition: the board just flips. Walk-off rules respected — bottom 9th
  skipped with the home team ahead.

#### Manager decisions (cost one of the five)

| Action | How | Confirm? | Notes |
|---|---|---|---|
| Steal | click the runner's **speed badge on the small diamond** | **No** | Cuts to a full-field view: runner card at the target base, catcher's card on the lane, "OPPONENT ROLLING FOR THROW". Logged `Roll: (16) + CA:+5, Steal Successful: Ronald Acuña Jr. (21)`. Steal of 3rd is legal with a catcher bonus (Anthony); untested — budget ran out first. No steal of home. |
| Sacrifice bunt | `BUNT` under the pitcher's card, before the pitch | **No** | Replaces the PA — no pitch roll. `Roll: (5) Dominic Smith: Bunt [Carpenter]`; batter out, runner up. |
| Intentional walk | `IBB` under the batter's card | **No** | No roll; logged as `Intentional Walk`. |

All three fire on a single click. Exploring the screen spent one by accident.

#### Rolls that are prompts, not decisions

- **Runner's choice (offence):** after a hit, a full-field view states the whole maths
  before you choose — `RUNNER'S CHOICE: (21+5) SPD VS OF: (3) ATTEMPTING HOME?` with
  `SEND` / `HOLD`. The bonus was +5 normally and +10 with two outs. Same prompt for
  tag-ups on fly balls (`(13) SPD VS OF: 3 ATTEMPTING THIRD?`). Only the lead runner is
  asked; trailing runners move automatically. HOLD resolves instantly.
- **Runner's choice (defence):** the same prompt shows with no buttons while the CPU
  decides; if it sends, the defence gets a `THROW` button to roll.
- **Ground ball, runner on 1st, <2 outs:** defence gets `DOUBLE PLAY TRY`, and with more
  than one force available also `FORCE OUT LEAD`. DP TRY is not optional — the game
  waits indefinitely until it is clicked. FORCE OUT LEAD resolves with no roll. Logged
  `Roll: (5) + IF: +8, Double Play Successful: Scott Rolen (10)`.
- Ground ball with a runner on 2nd and a hitter out: runner advanced automatically, no
  prompt, no log line.
- None of these consumed a decision circle.

#### Roster moves (do not cost a decision)

- **Bullpen tile → full-screen overlay of every reliever as a full-size card**, with the
  rule printed on top: *SPs must face 15 batters before being replaced; relievers 3, or
  may be replaced at the start of an inning if they finished the previous one.* Once
  legal, each card gets a big `Put In Game`. **No confirmation**; a "CALLING BULLPEN"
  beat plays, then the new pitcher is in. The pen pages (different relievers on later
  visits).
- **Bench tile → two-pane overlay.** Left: bench cards. Right: the live lineup table
  (`#, POS, Player, eligible positions with ratings, SPD`) with `Move` per row
  (select-then-swap between fielders), and **Base Info** (`AB / 1B / 2B / 3B` with who
  occupies each) — the pinch-hit / pinch-run surface.
- Bench rule printed on the overlay: "cannot be used until the 6th inning". In practice
  `Select`/`Sub` only appeared from the **7th** (disabled throughout the 6th, both on
  defence and offence).
- Substitution flow: bench card `Select` → that card pulls forward with `Cancel`; every
  `Sub` button (lineup rows and Base Info rows) turns live → click the target row →
  **side-by-side confirm** of incoming vs outgoing card with `Cancel` / `Swap`. The only
  confirm step in the whole game.
- Removed players leave the bench for good. The team DEF line recalculates live (IF +8 →
  +9 for Tatis at SS, → +11 for Wendle).
- **No position validation:** a COF-only pinch hitter (Conforto) was left at shortstop
  for the next half with no warning; the IF total silently dropped.

#### Fatigue

Each pitcher card shows a BF capacity (`22 BF | 5 IP` starter, `6 BF | 1⅓ IP` reliever).
Once a pitcher reaches it, Control drops on the card (6 → 5, 5 → 4 → 3 for one CPU
reliever kept in). The CPU changed pitchers on its own, sometimes mid-inning, with no
announcement on the play screen; the log records `X --REPLACES-- Y`.

#### Other surfaces

- **Log:** right-hand slide-over, field visible; grouped by inning (`Current` /
  `Previous`), `END Top 2: 0 - 3` lines, `Scored` lines per runner. Its controls overlap
  `MENU`'s position — mis-toggles are easy.
- **MENU:** box-score overlay — line score with R/H/LOB/`AVRL` (average roll)/`ADV`
  (advantages won), team toggle, hitter table (AB H BB S DB TR HR RBI RS SB CS K DBP
  OCHW OCO) and pitcher table (BF IP ER K H BB DBP OCO OCHW), `SAVE & QUIT`.
- **Fast Sim:** separate text-mode screen (scoreboard, play-by-play, both cards) with
  `Sim At Bat / Sim Half Inning / Sim Inning / Sim to Pitcher Fatigue / Sim Game` and
  `Play Ball` to return. Runs about one PA per 3-5 s under "Simulation Running" with
  `Stop Simulation`. It made no decisions on our behalf that were visible.
- **Final:** box-score screen titled "Final" with `Exit` (back to the challenge page)
  and `Log`.
- `Enforce BF` was never exercised; meaning unconfirmed.

#### How Elements differs — Anthony's answers, 2026-10-29

1. **No decision budget.** The only limited action is the one natural steal per team
   (`naturalStolenBaseUsed`; the engine also lifts the limit while the catcher's DEF is
   negative). IBB and bunts are unlimited. Nothing like ERA's five circles is needed.
2. **Bench, pinch runner and bullpen are available after the first pitch** — no 6th/7th
   inning lock.
3. **No catcher bonus on a steal of 3rd.** The steal-of-home catcher bonus is already in
   the Rulebook (engine: `SECOND_STEAL_HOME_ROLL`, full infield + catcher).
4. Extra-base / tag-up bonuses, 5. double-play vs force-out handling, 6. fatigue — all
   already defined by the Rulebook; ERA's versions are not a reference for these.
7. Fast Sim, challenges and token rewards are out of scope (Elements is strictly PvP).

#### Implications for Elements' bench/bullpen drawers (step 5)

ERA confirms the existing direction — roster moves start from the bench/bullpen tiles,
open a full-card overlay, and print the governing rule at the top. The bench overlay
pairing **bench cards + live lineup table + base occupancy** is the strongest single idea
to borrow: one surface for pinch hitter, pinch runner, defensive swap. Where Elements
should differ: confirm steals/bunts/IBB (its Select → Confirm → Locked model already
does), say *why* an action is unavailable instead of hiding it silently, validate
defensive positions after a pinch hitter, and show whether the team's one natural steal
is still available rather than letting the option silently vanish.

---

## Part 2: Showdown 2000 (showdown2000.fun)

In-app, this product is branded **"MLB Showdown"** — the landing-page name "Showdown
2000" is the marketing/domain name only.

### Dashboard

Logged-in home shows **Games / Teams / Cards / Credits** counters plus career stats
(Trophies, Wins, Losses, Run +/-, HR, SB, K). An **"Include self-play"** toggle reveals a
separately-tracked self-play game history line (distinct won/loss/HR/SB/K totals from
real opponent games) — i.e. the product itself distinguishes "played against another
person" from "played against myself" as two different stat pools, rather than treating
self-play as just another game.

### New Game setup

A "New Game" modal exposes two setup choices before a lobby is created:
- **Salary Cap Restriction**, as named tiers rather than a single number: Tiny (2,000) /
  Small (3,000) / Mid (4,000) / Standard (5,000, the default) / Plus (6,000) / Large
  (7,000) / Unlimited. **Structurally different from Elements**, which fixes a single
  4,000-point cap per season league-wide (`ACTIVE_SEASON_CONFIG`) rather than exposing a
  per-game cap choice to the manager.
- **Game Visibility**: Private (join by code only) or Public.

Creating a game produces a **shareable game code** (e.g. `C534HB`) and a lobby screen
with Challenger/Defender panels waiting to fill. The lobby has an explicit **"Join to
Play Against Yourself"** button — self-play is a first-class, one-click path, not a
workaround.

### Lineup build

"Set Your Lineup" shows all 9 starters in a **visual diamond arrangement at their real
fielding positions**, each with a Batting Order dropdown (1st–9th) and a 🔍 button that
opens a "Select Eligible Player for [POS]" modal listing bench alternatives filtered by
real position eligibility (e.g. "LF/RF +1 · Hitter"). A **"Lineup Status" checklist**
(Lineup 9/9, Batting 9/9, Cap X/Y, Pitcher Random) gates a "🚀 Submit Lineup" button —
the submit control stays disabled until every line reads complete.

**The one line worth flagging as a real structural difference from Elements**: the
checklist's pitcher line reads **"Pitcher: Random"** with a 🎲 icon, and no manual
pitcher-selection control exists anywhere on this screen. The starting pitcher is
assigned automatically, not chosen by the manager. Elements' `setPregameSelections`
(`engine.ts`) requires an explicit, validated `startingPitcherCardKey` — the manager must
choose. This is a genuine mechanical difference, not just a UI difference (whether
Elements should ever offer a "random" option is a Rulebook question, not something this
document is taking a position on).

### Live game screen

The at-bat screen shows a green fielding diamond with all fielders placed at their real
positions, an aggregate defensive-rating readout above the diamond ("OF: +4  IF: +11
C: +5" — closely paralleling ERA Baseball's own OF/IF aggregate display), and the current
pitcher/batter cards inline with the field graphic rather than off to the side.

**Pitcher fatigue is live and granular.** The pitcher's card reads e.g. `Stamina: 87% |
Command: 5/5 | Current Game IP: 0.66/5` and visibly decrements after every plate
appearance — confirmed directly by watching the same value change PA-to-PA (100%/0.00 IP
→ 93%/0.33 IP → 87%/0.66 IP across three consecutive batters). Three independent axes
(percentage stamina, a fractional command rating, IP-vs-a-stated-limit) update in real
time, not just a single fatigue counter.

**Pre-pitch decision**: two buttons sit under the pitcher's card before each pitch —
**"🫲 Walk"** (a direct one-click intentional-walk shortcut) and **"⚾ Pitch."** This is a
different UI placement from ERA Baseball's separate IBB button (which lives under the
batter's side in ERA's diamond view) but the same underlying decision, and directly
comparable to Elements' `INTENTIONAL_WALK_CONFIRM` decision type.

Clicking Pitch resolves the same two-roll shape observed on ERA Baseball: an
**"⬆ Pitcher's Advantage"** or **"⬆ Batter's Advantage"** banner appears first (both were
observed across different plate appearances in the same half-inning — advantage
genuinely flips based on the matchup, it isn't always pitcher-favored), gating a green
**"🏏 Swing"** button that only then becomes clickable — a real, confirmed pause-for-
batter-decision, not just a visual label (the Swing button was unclickable/absent until
advantage resolved, on every PA observed).

Clicking Swing resolves the plate appearance **instantly**, with a brief animated
**chart-result badge** overlaid on the diamond (e.g. a large "GB" badge for a ground-ball
result) before settling into **narrative-only play-by-play text**: *"Fernando Tatis Jr.
grounded out off Tomoyuki Sugano · Just now."* **No raw roll numbers appear anywhere in
the play-by-play** — a real, notable design contrast with ERA Baseball, whose log lines
show the actual dice values inline (`Roll: (18) +6, Advantage: ...`). Showdown 2000 shows
*what* happened; ERA Baseball shows *what* happened *and the exact numbers that produced
it*.

### A complete half-inning, observed directly

The self-play game (`C534HB`) was played through a full top-of-1st: pop out, ground out,
ground out — three outs, no baserunners, still 0–0. On the third out the game
transitioned cleanly to the bottom half: the outs indicator reset, and the same leadoff
batter slot reappeared with a fresh Walk/Pitch prompt. (No runner-on-base or extra-base
decision was reached in this half-inning — three quick outs — so no direct comparison
point against Elements' runner-advancement/tag-up decision UI was available from this
session's play.)

### Other UI observed

- **Full season-to-date box score**, both teams, tab-switchable, with per-player AVG/OBP/
  SLG **pre-populated from prior games** (not zeroed for this game) alongside this game's
  AB/R/H/RBI/HR/SB/BB/K — i.e. the box score is a season stat sheet with today's line
  layered on top, not a fresh per-game table.
- **A live in-game chat box** ("No messages yet. Start the conversation!" + text input +
  Send button) directly on the game screen. Neither Elements nor (as far as observed) ERA
  Baseball has an equivalent in-game chat surface.
- **A "💎 Game Rewards" panel** showing a running, live-updating preview of credits the
  current game will earn ("Game Played +3," "🥇 Shutout +10") — confirmed by observation
  to be a **live preview during play**, not an end-of-game summary screen (it was already
  showing projected rewards while the box score still read 0–0 with only 1–2 outs
  recorded).
- Full lineup strip (both bench + starters) with 🔍 inspect buttons stays visible below
  the diamond throughout the at-bat, similar in spirit to ERA Baseball's always-visible
  BENCH/BULLPEN/MOUND strip, though Showdown 2000's version is starters-and-bench only —
  no separate bullpen/mound section was visible during this single-pitcher half-inning.

---

## Summary table

| | ERA Baseball | Showdown 2000 |
|---|---|---|
| Access this session | Persisted login, passive observation only (user instruction) | Logged in, full permitted interactive play |
| Actual gameplay observed | Yes — one real, live, in-progress match vs. a real opponent, passively | Yes — real setup flow + a full self-play half-inning, actively played |
| Setup/new-game flow observed | No — session started mid-match | Yes — Salary Cap tier choice, visibility choice, shareable game code, lineup build |
| Starting pitcher selection | Not observed (mid-match) | **Automatic/random** — no manual picker found (contrast: Elements requires an explicit manager choice) |
| Decision-gate pattern confirmed | Yes — disabled "Swing" button = waiting on the other manager; explicit IBB button | Yes — Advantage banner gates "Swing"; separate one-click Walk button |
| Advantage can favor either side | Not directly confirmed (only one PA fully observed) | Yes — both "Pitcher's Advantage" and "Batter's Advantage" seen in the same half-inning |
| Chart outcome shown with raw roll numbers | Yes — every log line shows the actual dice values | **No** — narrative text only ("grounded out"), no numbers anywhere in the log |
| Full chart always visible on-card | Yes | Not directly confirmed this session |
| Pitcher fatigue display | Not observed in detail | Live, granular: % stamina + fractional command + IP-vs-limit, updating per PA |
| Player-facing "sim ahead" feature | Yes (2+ tiers) — not a gap for Elements; Elements is PvP-only by design | Not observed |
| Roster acquisition model | Not shown (mid-match only) | Credits/booster-pack economy, plus a per-game Salary Cap tier choice |
| Both full lineups/bench always visible during an at-bat | Yes, plus separate BULLPEN/MOUND sections | Yes (starters + bench); no separate bullpen section seen |
| In-game chat | Not observed | Yes — live chat box on the game screen |
| Live rewards/economy preview during play | Not observed | Yes — a running credits-earned panel, updating mid-game |

## Rulings from the first live two-player game (Anthony vs. Will, 2026-10-30)

Anthony's answers to questions the Rulebook does not settle, or settles
differently. Each is implemented and pinned by the scenario IDs listed.

| # | Ruling | Category | Rulebook text it touches | Scenarios |
|---|---|---|---|---|
| 1 | Over-IP fatigue starts on the out that **reaches** card IP: a 6.67 IP pitcher pays -2 at his 20th out, then -2 per out. Shutout Bonus counts the same way (-1). | Proposed Digital Gameplay Update | IX-C: "-2 for each out … beyond their card IP length"; its example (0.2 IP past = -4) becomes -6 | FAT-DIST-01..06, FAT-SO-03, REG-FAT-01 |
| 2 | Postgame rest: a player who appeared adds his full card fatigue and does **not** also get the day's -1; a player who sat gets -1. Milestone bonus still applies to everyone. | Official Rule (the Rulebook's own IX-B examples: 2 + 6 = 8) — the code was wrong | IX-B | REST-FULL-01..07, restTrackingSqlParity; migration 20261030_gameplay_rest_appearance_fix.sql |
| 3 | Anyone with a pitcher card may start: rotation, bullpen, or a two-way player from the field or bench. | Approved Digital Gameplay Behavior | V: "start at P only … pitcher charts in the primary position" — Anthony: two-way players can start | — (UI) |
| 4 | A fielder already in the game may move to P with the pitcher moving to the field, nobody entering. Unlisted positions at -10; unlisted only after the game's first PA. In a DH game it ends the DH (MLB 5.11): the DH leaves the game and the former pitcher bats in his slot; the double switch then opens. | Proposed Digital Gameplay Update | X: "Fielders are only allowed to shift … when there is another … replacement player entering" | SWAP-01..07 |
| 5 | MLB 5.10(d) Comment: a pitcher moved to the field may return to pitch; P → field at most once per inning; one continuous pitching line. | MLB fallback (Rulebook I: defer to MLB) | — | SWAP-05, SWAP-06 |
| 6 | MLB 5.10(g) three-batter minimum for every pitcher, starter included; removable between innings if the half ends first, owes the rest if he returns. Games created before 2026-10-30 carry no minimum. | MLB fallback, adopted | — | MOUND-01..04 |
| 7 | Postgame relief distance rest (+1 game) stays strictly *beyond* card IP — reaching it exactly does not count. | Official Rule, confirmed | IX-C relief distance | FAT-REL-01..03 |
| 8 | A pitcher is charged with an appearance (for rest) only when a plate appearance against him is completed; a reliever who only records an out on the bases is not. | Approved Digital Gameplay Behavior, confirmed | IX-B "makes an appearance" | — |

## Rulings of 2026-11-01 (Anthony's 12 decisions and 14 audit decisions) — rules version 2

Approved by Anthony on 2026-11-01 and implemented locally on branch
`stats-and-gameplay-v2` (not deployed). They apply to games created under
`rulesVersion` 2; games created before keep rules v1 to completion. Each
amends or clarifies the Rulebook; the website shows the approved wording as a
green "Approved Rule Amendment" marker beside the official text, which still
mirrors the Google Doc until Anthony amends it. Superseded rulings are noted.

| # | Ruling | Category | Rulebook text it touches | Scenarios |
|---|---|---|---|---|
| 9 | Chart walks and intentional walks: batter to 1B, only forced runners advance (bases-loaded walk = 1 run, RBI). The v1.3.73 engine behaviour is the rule. | Approved amendment | §7 automatic advancement ("BB, 1B, & 1B+ … all existing runners") | V2-WALK-*, V2-IBB-*, V2-WALK-WALKOFF |
| 10 | Walk-offs (OBR 7.01(g), 5.08, 9.06(f)–(g)): game ends at the winning run; later runs count only on a HR (every Elements HR is out of the park); hit credited min(chart bases, winning runner's advance); nothing after the winning run. | Approved amendment | — (MLB) | V2-WO-* |
| 11 | Ruling 1 confirmed (original decision 4): distance −2 from the out completing card IP. | Approved amendment (was Proposed) | §8 IX-C "beyond their card IP length", 0.2 IP example | V2-FAT-THRESHOLD |
| 12 | Shutout Bonus never restores Control (D10); begins at the later of the card-IP out and the 15th out; inherited run ends it (Option B: no immediate −2, −2 per later out). | Approved amendment | §8 IX-C Shutout Bonus text and examples | V2-FAT-* |
| 13 | ~~Steal rolls do not block intentional walks / pinch hitters (original decision 3)~~ **superseded by audit decision 5:** after any resolved steal attempt in a PA (natural steal, second steal of home, squeeze 1–7) no further manager action in that PA; lock resets with a new PA or half-inning. | Approved amendment | §7 intentional walk, pinch hitter/runner, defensive substitution ("no die rolls") | V2-LOCK-*, V2-D1-SQUEEZE-LOCK |
| 14 | Infield In only with a runner on 3B and < 2 outs (Anthony, 2026-11-01, revising the earlier runner-on-any-base approval), using the Rulebook's outcomes; judged at the swing (no effect with 2 outs or empty bases); R1+R3 hold: batter safe at 1B, R1 forced to 2B, R3 holds, no out (confirmed by Anthony); no DP/TP toward home. | Approved amendment | §7 Infield In | V2-II-*, INF-13, INF-NO-PHANTOM-OUT* |
| 15 | ~~Efficiency: BF = outs (original decision 5)~~ **superseded by audit decision 7:** BF ≥ 1 and BF ≤ outs, not back-to-back. | Approved amendment | §8 IX-B efficiency | statsV2Sql "efficiency …" |
| 16 | Pitching G on entry even with BF 0; no rest for a zero-BF appearance (ruling 8 kept). | Approved statistics rule | — | LINE-ZERO-BF-APPEARANCE |
| 17 | Squeeze: 1–7 is a CS; as the third out no PA, same batter leads off (D1); 16–19 with two outs scores no run (D8). | Approved amendment | §7 squeeze | V2-D1-*, V2-D8-* |
| 18 | Scoring rules (EDSR): GIDP, RBI, W tree, L, SV (6 × ER ≤ outs), HLD, BSV, ORDER, RESP, SB, LOB, PA; TBP/TBPa for triple-play attempts. | Approved statistics rules | — | stats matrix |
| 20 | Extra bases (v2): hit → offence sends → offence rolls RTS first (1–10 nobody advances, play over; 11–20 continue) → defence picks runner + outfielder in one step → outfield check. Two out and any runner sent home: no RTS. Reverses the Rulebook's target-before-RTS order (Anthony, 2026-11-01). | Approved amendment | §7 Extra bases | V2-XB-* |
| 19 | All games before the official launch are exhibitions (progression ≠ official); never official statistics, standings or rest; cleanup only by separate authorization. | Approved policy | — | statsV2Sql, BOX-CLASSIFICATION |
