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
