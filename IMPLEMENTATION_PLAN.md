# Consolidated audit and implementation plan — v2 (2026-11-01)

Status: **IMPLEMENTED LOCALLY** on branch `stats-and-gameplay-v2` under
Anthony's consolidated authorization of 2026-11-01 (§0). Not pushed, not
deployed; the migration is written and tested on PGlite but **not applied**;
official tracking OFF; no exhibition data deleted. Sections 1–11 below are the
plan as approved; where Anthony's 14 audit decisions superseded it, §0 says so. Covers Anthony's 12 decisions of
2026-11-01, the chart-walk clarification, and his request for one coordinated
implementation approved once.

Status labels used here and in every companion document:

| Label | Meaning |
|---|---|
| **[APPROVED · IMPLEMENTED]** | Anthony's decision, and the live engine already does it |
| **[APPROVED · NOT IMPLEMENTED]** | Anthony's decision; code still differs or doesn't exist |
| **[PROPOSED]** | Awaiting Anthony's approval |
| **[UNRESOLVED]** | Needs Anthony's ruling before it can be built (§3) |

Companion documents (all local, uncommitted): `STATS_SPEC.md` (v6),
`STATS_SCORING_RULES_PROPOSAL.md` (v3), `RULES_AUDIT.md` (v3),
`STATS_OUTCOME_MATRIX.md`, `FATIGUE_RESPONSIBILITY_PROPOSAL.md`,
`REST_SERVER_CORRECTION_PROPOSAL.md` (v3), `LAUNCH_BLOCKERS.md`,
`OPERATIONS.md`.

---


## 0. Implementation status (2026-11-01)

### Superseding decisions (audit decisions of 2026-11-01)

| Plan item | Final ruling | Implemented as |
|---|---|---|
| Original decision 3 (steal rolls don't block IBB/PH) | **Superseded by audit 5:** after any resolved steal attempt in a PA, no further manager action in that PA; resets with a new PA or half | `plateAppearance.actionsLocked`; `getPrePitchActions` returns nothing while locked |
| Original decision 5 (BF = outs) | **Superseded by audit 7:** BF ≥ 1 and BF ≤ outs | `restRules.ts` + SQL writer |
| U14 legacy summary | **Replaced by audit 13:** every pre-launch game is an exhibition; old games show only trustworthy saved data; cleanup prepared, never run | `competition_class`, legacy box summary, owner-only cleanup |
| U1–U5, U3 | Approved (audits 1–4) | see rulings 14 in `GAMEPLAY_REFERENCE_NOTES.md` |
| U9, D10 | Approved (audit 8) | `distanceControlPenaltyV2` |
| U10 | Approved (audit 9) | `runScoring.ts`, `playLog.ts` |
| U11, U12 | Approved (audits 10, 11) | `stats/decisions.ts` |
| U13 | Approved (audit 12): develop locally; Will baseline game on the current production build before any deployment; second two-account verification of the new build before launch | — |
| U15 | Approved (audit 14): nothing pushed | — |

### Interpretations taken where the wording left a gap (flagged for Anthony)

1. **Audit decision 1 wording.** The decision is labelled Option A (my plan's
   U1: R1 to 2B, R3 holds, *batter out at 1B*), but its text says "the batter
   reaches first". Read literally that is a ground ball with no out, which the
   Rulebook's hold rule ("the runner heading to 1B is out") contradicts. I
   implemented Option A as defined in the approved plan (batter out). If the
   intended play is "R1 forced out at 2B, batter safe on a fielder's choice",
   it is a one-line change in `gbInfieldInHold` plus its two scenarios.
2. **Audit decision 5 and further steals.** "No additional managerial actions"
   is applied to *every* pre-pitch action, including another natural steal in
   the same PA. The second-steal-of-home follow-up that the Rulebook attaches
   to a successful steal of 2B is part of the same attempt and is still
   offered.
3. **Rulebook text.** The website's official text mirrors the Google Doc word
   for word (project rule), so the approved amendments are shown as green
   "Approved Rule Amendment" markers beside the affected rules rather than
   by rewriting the official text. The Google Doc needs the §2 edits; then the
   official text can be updated and the markers retired.

### What was built (commits on `stats-and-gameplay-v2`)

| Commit | Content |
|---|---|
| Gameplay rules v2 | `rulesVersion`; one run path (`runScoring.ts`); D1, D2, D7, D8, D3 (`groundBallResolution.ts` + adapter), D9/lock, D10, F, Infield In expansion, IN-PU; play-log foundation; rest facts; 70 v2 scenarios |
| Statistics | `stats/gameStats.ts`, `decisions.ts`, `boxScore.ts`; LOB; 32 statistics scenarios; 60 simulated games reconcile |
| Local migration | `20261101_gameplay_stats_and_rest_v2.sql`: classification, v2 rest adjustments, official statistics tables + writer (two switches), exhibition cleanup; `restRules.ts`; `officialPayload.ts`; 26 PGlite tests |
| UI | Box score (Box / Elements / Play-by-play), `/games/lab/:gameId/box`, lab list tags, live game lines, season strip, sandbox recorded scenarios |
| Rulebook + tests | Approved-amendment markers, coverage page, extra tests |
| Saved games | Real snapshot games load and play under v1 |

### Test totals

786 passing across 42 files (30 of them need the local `backups/` snapshot).
`npm run build` and `npm run lint` (0 errors) pass. All 97 pre-existing SQL
tests also pass with the new migration applied on top.

## 1. Decision acknowledgment

| # | Decision | My exact interpretation | Engine today |
|---|---|---|---|
| CW | Chart walk = intentional walk = forced runners only | Batter to 1B; only runners forced by the batter advance one base; a runner scores only with the bases loaded (RBI 1). Responsibility, fatigue and walk-off apply to that run. The v1.3.73 correction is confirmed as Anthony's rule; the Rulebook is amended to match | **[APPROVED · IMPLEMENTED]** (`automaticHit`) — Rulebook text not yet amended |
| 1 | Same as CW, with the 8-state test matrix | §7 T-WALK | as CW |
| 2 | Infield In available whenever runners are on base with < 2 out (Option B) | Availability approved; **mechanics for the newly available states need approval (§3 U1–U5)**. Correction to my last report: the Rulebook **does** define a ground-ball outcome for every base state, including 1B only and 1B + 2B | **[APPROVED · NOT IMPLEMENTED]** — engine offers it only with a runner on 3B |
| 3 | Baserunning rolls (natural steal, second steal of home) don't block a later intentional walk or pinch hitter; batting rolls (pitch, swing, bunt, squeeze) do, for the rest of that PA | Correct D9 (squeeze 1–7). Application to other "no die rolls" options: §3 U6. Reset after an inning-ending squeeze: §3 U7 | Steals: **[APPROVED · IMPLEMENTED]**. Squeeze: **NOT** (D9) |
| 4 | First −2 at the out that completes card IP (3 IP → 9th out … 7 IP → 21st), −2 per later out; Shutout Bonus exceptions as previously approved (inherited run: bonus ends, accrued kept, no immediate −2, then −2 per later out) | Already in the engine since commit f025cd2 for the −2 branch. Inherited-runner handling is phase F. Two Shutout Bonus defects found (D10) | −2 branch **[APPROVED · IMPLEMENTED]**; inherited-runner and D10 **NOT** |
| 5 | Efficiency −1 if BF = outs, BF ≥ 1, other conditions met | Integer comparison. **Conflict flagged — §3 U8** (double plays and caught stealing make BF < outs) | **[APPROVED · NOT IMPLEMENTED]** (no live code applies it) |
| 6 | Pitching G = 1 on entry even with BF 0; rest 0 under ruling 8 | Entry, G, BF, outs, rest kept separate; the box score lists the pitcher. For rest, the CS-only reliever counts as a **non-appearance** (decays −1 like any non-appearing card — today's server behaviour) | Rest: **[APPROVED · IMPLEMENTED]**. Statistics: **NOT** (no statistics exist yet) |
| 7 | GIDP: ordinary ground-ball DP, and a failed TP attempt that yields a qualifying DP; not a completed TP, fly-ball DP, baserunning out | Criteria in §5.3 | **[APPROVED · NOT IMPLEMENTED]** |
| 8 | Deterministic MLB-style W; 5-inning starter requirement; objective brief-and-ineffective; fixed hierarchy; future game lengths | Complete decision tree §5.4 (EDSR-W v2 as proposed, now approved in approach). Tree itself needs a final look | **[APPROVED · NOT IMPLEMENTED]** |
| 9 | Three-inning save: outs ≥ 9, finishes a win, not W, `6 × ER ≤ outs`, other routes unchanged | ER = runs charged to him (all runs earned in Elements). §5.5 | **[APPROVED · NOT IMPLEMENTED]** |
| 10 | MLB-style RBI; no RBI on force DP, steals, nullified runs | Complete table §5.2 | **[APPROVED · NOT IMPLEMENTED]** |
| 11 | Failed TP with two outs: TBPa 1, TBP 0, no DBP/DBPa; completed TP: TBP 1, TBPa 1; team DP/TP from the actual event; one attempt per event | §5.6 | **[APPROVED · NOT IMPLEMENTED]** |
| 12 | Fix gameplay bugs D1, D2, D7, D8, D3 (+D9) before dependent statistics | §4 | **[APPROVED · NOT IMPLEMENTED]** |

**Conflicts between decisions and existing mechanics** (flagged, not assumed):

1. **Decision 5 vs "retire the minimum number of batters faced"** — §3 U8.
2. **Decision 3 vs Rulebook wording** for defensive substitution and pitching
   change ("so long as no die rolls have been made for the current at bat"),
   which Decision 3 doesn't mention — §3 U6.
3. **Decision 2 vs the Rulebook's DP-toward-home rule** — §3 U2.
4. **Earlier sequencing vs the new consolidated plan:** "The Will game and my
   explicit Stage 4 approval remain prerequisites" vs "preserve the Will game
   … before official launch" — §3 U13.
5. **"Every completed game must ultimately have a persistent box score"** —
   games completed before play recording exists have no play-level data —
   §3 U14.

## 2. Rulebook amendments

**Files.** The canonical Rulebook is Anthony's Google Doc (I can't edit it —
Anthony applies the same wording). The website mirror is
`src/data/rulesData.ts`; category badges (Official / Approved Digital /
Proposed Digital / Clarification Needed) are in `src/data/digitalRuleReview.ts`.
Both are edited in the implementation, wording below.

| # | Section (website · Google Doc) | Current | Replacement |
|---|---|---|---|
| A1 | §7 Managerial Running Decisions — automatic advancement | "BB, 1B, & 1B+ swing results = All existing runners automatically advance 1 base." | "BB swing results = The hitter is awarded 1B & only forced runners advance 1 base; runners who are not forced remain on their base. 1B & 1B+ swing results = All existing runners automatically advance 1 base." |
| A2 | §7 Managerial Defensive Decisions — intentional walk | "…so long as no die rolls have been made for the current at bat." | "…so long as no pitch, swing, bunt or squeeze die roll has been made for the current at bat. Stolen base die rolls do not count." (scope per U6) |
| A3 | §7 Managerial Running Decisions — pinch hitter / runner | "When no die rolls have been completed against the current hitter…" | "When no pitch, swing, bunt or squeeze die roll has been completed against the current hitter… Stolen base die rolls do not count." (scope per U6) |
| A4 | §7 Infield In — DP-toward-home sentence | "…cannot be attempted on a runner heading toward home plate unless the defensive GM has also declared 'infield-in'…" | per U2 (recommended: "Standard GB double play, 3B-to-1B double play, & 3B-to-2B-to-1B triple play attempts are never made on a runner heading toward home plate. With 'infield-in' declared, the only out at home plate on a GB result is the bases-loaded force described below.") |
| A5 | §7 Infield In — declaration | "When there are runners on base with less than 2 out…" | unchanged text (Option B keeps it); add per U3: "Infield-in applies only if there are runners on base & less than 2 outs when the swing result is given; otherwise it has no effect." |
| A6 | §7 Infield In — 1B + 3B hold | "…all existing runners 'hold' at their base unless forced…" | per U1 |
| A7 | §8 In-Game Distance Fatigue (IX-C) | "For each out that all pitchers record pitching beyond their card IP length, -2…" | "Beginning with the out that completes their card IP length, -2 is subtracted from their current Control score for that out & each out recorded after it, until the pitcher is removed." |
| A8 | same — example | "0.2 IP past … Control 2 (… totaling -4)" | "A pitcher with a Control 6 score & a card IP length of 6.0 records his 18th out (completing his card IP length) & then 2 more outs. This pitcher will have a Control 0 score for the next hitter (-2 for the 18th, 19th & 20th outs, totaling -6)." |
| A9 | same — Shutout Bonus | "…only -1 … for each out … beyond their card IP length…" | "…only -1 … for the out that completes their card IP length (or their 15th out, whichever is later) & each out after it…" (U9 confirms) |
| A10 | same — Shutout Bonus example | "1.1 IP past … Control 2" | "A pitcher with a Control 6 score & a card IP length of 5.0 has recorded 19 outs & allowed 0 earned runs. This pitcher will have a Control 1 score for the next hitter (-1 for each of the 15th through 19th outs)." |
| A11 | same — earned run after bonus example | "…Control 2 … HR … Control 0 … out … Control -2" | "…Control 1 … HR … Control -1 for the following hitter. If that hitter records an out, the pitcher will have a Control -3 score for the next hitter." |
| A12 | same — inherited runner (new sentence, Option B) | — | "If an inherited runner scores while the Shutout Bonus is in effect, the Shutout Bonus ends: Control reductions already applied remain, no immediate -2 is applied, & -2 is subtracted for each subsequent out recorded until the pitcher is removed." |
| A13 | same — card IP < 5 (clarify, D10) | "…standard IP fatigue effects … until they reach 15 outs & then these modified fatigue effects are applied going forward." | add: "Reductions already applied before the 15th out remain." |
| A14 | §8 Pre-Game Fatigue (IX-B) — efficiency | "Pitchers who retire the minimum number of batters faced…" | "Pitchers who face at least 1 batter & whose batters faced equals the outs recorded in an appearance…" (wording per U8) |
| A15 | §8 — appearance definition (new note, ruling 8 + Decision 6) | — | "For rest purposes a pitcher appears in a game only if at least one plate appearance is completed against him. A pitcher who enters & records outs without completing a plate appearance (e.g. a runner caught stealing) is credited with a pitching appearance in the box score but incurs no rest." |
| A16 | §7 Bunting — squeeze | no change; badge note | Mark: "the squeeze die roll is a batting roll (it blocks a later intentional walk & pinch hitter in that at bat)". |
| A17 | Statistics (new appendix, Approved Digital) | — | The EDSR rules once approved (walk-off, W, L, SV, GIDP, RBI, G, TBP/DBP), stated as Elements rules. |

Rule-version history kept in `GAMEPLAY_REFERENCE_NOTES.md` (each amendment
gets a dated entry: previous text, new text, decision reference) and in the
engine's `rulesVersion` (§8 S1a).

## 3. Remaining ambiguities — need Anthony's ruling before implementation

### Infield In (Decision 2)

The Rulebook already prescribes every base state; the engine and Rulebook
agree on all states the engine allows today. Newly available states and their
Rulebook outcomes (**proposed as the mechanics — U5 approves them**):

| Base state (0 or 1 out) | Engine today | GB result (Rulebook text) | Contact play? | PU / FB |
|---|---|---|---|---|
| 1B | not offered | Lead runner (R1) out at 2B (force); batter safe at 1B on FC | no (Rulebook offers it only on "hold" states) | 1B, runners +1, no extra bases |
| 2B | not offered | Runner holds; batter out at 1B | **yes**: check vs R2's BsR — out → R2 out at 3B, batter safe on FC; safe → R2 to 3B, batter safe on FC; roll 1 all safe; roll 20 R2 out | same |
| 1B + 2B | not offered | Lead runner (R2) out at 3B (force); R1 to 2B; batter safe on FC | no | same |
| 3B | offered | hold; batter out | yes | same |
| 1B + 3B | offered | hold (engine: R1 stays — U1); batter out | yes | same |
| 2B + 3B | offered | hold; batter out | yes | same |
| Loaded | offered | Runner from 3B out at home; others +1; batter safe on FC | no | same |

Interactions (all deterministic, none needing a new rule): chart conversions
(negative infield fielding GB → 1B) happen first and Infield In applies to
the final result; Infield In ground balls never offer a DP / TP, RFO or RTS,
so no infield combination is consumed and no DBPa/TBPa is credited; squeeze
stays unavailable with Infield In; a converted PU/FB 1B is a hit with
automatic +1 advancement and no tag-ups or extra-base decisions; runs scored
follow 5.08(a) and walk-off rules as usual.

- **U1 — 1B + 3B "hold unless forced".** The only state in the hold list with
  a runner on 1B. Does R1 advance to 2B on the GB? Engine: R1 stays. The
  phrase "unless forced" has no other application, which suggests R1 advances.
  *Recommendation:* R1 advances to 2B (batter out at 1B, R3 holds). This
  **changes live gameplay**. Alternative: keep the engine (R1 stays) and strike
  "unless forced".
- **U2 — DP toward home.** The Rulebook says DP / TP attempts on a runner
  heading home require Infield In, yet every Infield In GB outcome is fixed and
  none is a DP. *Recommendation:* no DP/TP mechanic ever retires a runner
  heading home; amend A4 (matches engine; no gameplay change).
- **U3 — state changes after declaration.** Infield In is declared before any
  roll, but a steal or caught stealing can change the bases or make two outs
  before the swing. Today the engine still turns PU/FB into a 1B even with two
  outs or empty bases. *Recommendation:* Infield In applies only if, at the
  swing result, there are runners on base and < 2 outs; otherwise it has no
  effect (A5). The declaration stays locked for the PA.
- **U4 — declaring Infield In after a steal roll** — covered by U6.
- **U5 — approve the Rulebook outcomes above for 1B, 2B and 1B + 2B**, the
  statistics (FC, AB, no hit, no RBI on forced-out states, no DP credit), and
  contact play for the 2B-only state.

### Rolls during an at-bat (Decision 3)

- **U6 — scope of the steal/batting separation.** Decision 3 names the
  intentional walk and pinch hitter. The same "no die rolls" condition appears
  for pinch runners (same sentence as pinch hitter), defensive substitutions,
  pitching changes, Infield In and the sac bunt ("before any pitch roll").
  The engine today allows **all** of them after any steal roll and after
  squeeze 1–7. *Recommendation:* one rule for every pre-pitch option: only a
  batting roll (pitch, swing, bunt, squeeze) in the current PA blocks it; steal
  rolls never do. In practice the only blocked window is after squeeze 1–7
  with < 2 out (every other batting roll ends the PA).
- **U7 — inning-ending squeeze 1–7.** The same batter leads off the next
  inning (approved). Is the block reset? *Recommendation:* yes — a new
  half-inning starts a new at-bat (MLB treats it as a new PA), so pinch hitter
  and intentional walk are available again.

### Fatigue and rest

- **U8 — efficiency equality (Decision 5).** "BF = outs" excludes outings
  where a double play or caught stealing gives more outs than batters: e.g. a
  reliever enters with a runner on 1B, one out, and gets a GIDP (BF 1, outs 2)
  — he faced the minimum but fails BF = outs. *Options:* (a) as written,
  BF = outs; (b) BF ≤ outs (the usual "faced the minimum" meaning).
  *Recommendation:* (b). Decision 5 says equality, so I won't assume.
- **U9 — Shutout Bonus −1 counting.** Decision 4 sets the −2 counting. The
  engine applies the same "threshold-completing out counts" rule to the bonus's
  −1 (first −1 at the card-IP out, or the 15th out for card IP < 5).
  *Recommendation:* confirm (A9).
- **D10 (rule clear, not a ruling — listed so it isn't a surprise):** the
  engine recomputes the bonus from scratch, so (i) a card-IP < 5 pitcher's
  accrued −2s are refunded at out 15 (card IP 3, Control 6: Control −5 at out
  14 → **0** at out 15), and (ii) a pitcher at negative Control when the bonus
  starts goes back up, contrary to "does not see any reduction…". Fix: freeze
  accrued reductions when the bonus starts or ends (A13).

### Scoring

- **U10 — walk-off adaptations.** Decision 12 says "preserve the special
  treatment of qualifying out-of-the-park walk-off home runs". Confirm:
  **every** Elements HR qualifies (no inside-the-park HR exists), and the hit
  credit rule = min(chart bases, bases the winning runner advanced).
- **U11 — remaining scoring rules not covered by the 12 decisions**, needed by
  the statistics system: EDSR-L (loser = responsible pitcher of the go-ahead
  runner), EDSR-HLD, EDSR-BSV, EDSR-ORDER (lead runner scores first),
  EDSR-RESP (9.16(g), most advanced retired runner), EDSR-SB (no SB for others
  when a multiple-steal target is out), EDSR-LOB, EDSR-PA (the PA belongs to
  the batter/pitcher at the completing roll). *Recommendation:* approve as a
  block as written in `STATS_SCORING_RULES_PROPOSAL.md`.
- **U12 — W decision tree (§5.4)** — the approach is approved; confirm the
  tree as written (in particular: brief-and-ineffective uses runs **while
  pitching** — MLB's comment counts runs charged to a previous pitcher — while
  ranking uses runs **charged** first).

### Process

- **U13 — Will game timing.** Earlier: the Will game and Stage 4 approval are
  prerequisites to starting development of play records. Now: "before
  official launch". *Recommendation:* development may start locally after the
  consolidated approval (nothing is deployed); the Will game is played on the
  **current** production build and must be complete before anything from this
  work is deployed. Confirm.
- **U14 — games completed before play recording.** They can't get a full box
  score (no per-play data). *Options:* (a) a "legacy summary" from the saved
  final state (line score, final score, pitchers used, lineups) labelled as
  partial; (b) none. *Recommendation:* (a), read-only, never official.
- **U15 — pushing branches.** A push to `main` deploys production (Vercel). A
  pushed feature branch creates a Vercel **preview** deployment. *Recommendation:*
  keep everything local; no push of any branch until deployment is authorised.

## 4. Gameplay corrections

All new behaviour applies to games created under `rulesVersion` 2; games in
progress keep v1 behaviour to completion (approved requirement: no mid-game
rule change). Each fix starts with a scenario that fails before it.

| ID | Defect (confirmed in code) | Fix |
|---|---|---|
| D1 | `SQUEEZE_BUNT_ROLL` 1–7 making the 3rd out calls `finishPlateAppearance`: PA marked, order advances | Call `finishWithoutPlateAppearance`; batter leads off next inning; runner CS (catcher CS) |
| D2 | Steal of home (second-steal sequence) that puts the home team ahead in the 9th+ resumes the PA | Check walk-off after every run on every path; end the game, no PA, no AB, order not advanced |
| D7 | Walk-off check runs only after the whole play: every run counts and extra-base decisions are still offered | One `scoreRunners` path (lead runner first); stop at the winning run unless HR (all score); bases-loaded walk/IBB = one run; cancel pending decisions, 1B+ steals and throws; credited hit = min(chart, winning runner's advance) recorded for statistics |
| D8 | Squeeze 16–19 with two out scores the run, then records the batter-runner's 3rd out | Batter-runner out first; no run (5.08(a)); non-force cases unchanged |
| D9 | Intentional walk / pinch hitter offered after squeeze 1–7 in the same PA | `plateAppearance.battingRollMade` set by pitch/swing/bunt/squeeze rolls; gates options per U6; reset per U7 |
| D3 | Two GB implementations. The reference (`groundBallEngine.ts`, used by harnesses, demos, verification page) differs from live: TP drops/duplicates R3 with the bases loaded; `gbLegalChoices` lacks the TP's 2B ≥ +4 / 3B ≥ +2 requirement and the combination cycle; **`resolveAutoOut` Infield-In 1B-only and 1B+2B record an out but keep every runner (phantom out)** — correcting my earlier claim that it "invents" outcomes; its contact-play availability also omits the 2B-only state | Make the live resolvers the single shared module; port harnesses, demos and verification page; delete the reference; guard test (§7 T-GB) |
| D10 | Shutout Bonus refunds accrued penalties (card IP < 5) and raises negative Control | Freeze accrued reductions at bonus start/end (§6) |
| F | Fatigue ladder and Shutout Bonus −2 use runs scored while pitching, not runs charged; inherited runs never end the bonus Option-B style | `FATIGUE_RESPONSIBILITY_PROPOSAL.md` (approved interpretation): runner carries responsible pitcher; `pitcherRunsCharged`, `pitcherInheritedRunsScored` |
| II | Infield In availability (Decision 2) | Offer with runners on base and < 2 out; outcomes per U1–U5 |
| IN-PU | PU/FB→1B conversion applies even when outs or bases changed (U3) | Apply only if runners on base and < 2 outs at the swing |

## 5. Statistical scoring

### 5.1 Walks (8 states, chart BB and IBB identical in movement)

| Before | After | Runs / RBI |
|---|---|---|
| empty | 1B | 0 |
| 1B | 1B 2B | 0 |
| 2B | 1B 2B | 0 |
| 3B | 1B 3B | 0 |
| 1B 2B | loaded | 0 |
| 1B 3B | loaded | 0 |
| 2B 3B | loaded | 0 |
| loaded | loaded | 1 / RBI 1 (walk-off: game ends 1 run, BB) |

Chart BB: PA, BB, chart categories; IBB: BB, pitcher BB + OCHW, no
PCHW/OBA/ADV (approved).

### 5.2 RBI decision table (Decision 10)

A run "counts" unless cancelled by 5.08(a) or scored after a walk-off's
winning run (non-HR). RBI only for counted runs.

| Outcome | Runs that can score | RBI |
|---|---|---|
| 1B, 1B+, 2B, 3B (chart or converted) | automatic advances + extra-base decisions on that hit | 1 per counted run |
| HR | batter + all runners | 1 per run (incl. batter) |
| Infield-In PU/FB → 1B | automatic +1 (R3 scores) | 1 per run |
| BB / IBB | loaded only | 1 |
| K, PU (not converted) | none | 0 |
| FB, tag-up from 3B scores (< 3 outs after the catch) | R3 | 1 (SF); still 1 if a trailing runner is then thrown out for the 3rd out (non-force) |
| FB, runner thrown out at home on tag-up | none | 0 |
| GB, 2 out or bases empty | none | 0 |
| GB, R3 only (no Infield In) | R3 | 1 |
| GB, 1B open with R2 (± R3) | R3 | 1 |
| GB RFO / automatic forced out (R1 present) | R3 if present and < 3 outs | 1 per run |
| Standard or 3B→1B DP: both out | R3 if < 3 outs | **0** (GIDP) |
| DP attempt: one or zero outs | R3 | 1 per run |
| TP attempt: 3 outs | none | 0 |
| TP attempt: exactly 2 outs | R3 if < 3 outs | **0** (GIDP) |
| TP attempt: 0–1 out | R3 | 1 per run |
| Infield In: loaded GB | none (lead out at home) | 0 |
| Infield In: hold | none | 0 |
| Infield In: 1B / 1B+2B (U5) | none | 0 |
| Contact play: lead from 3B safe, or roll 1 | R3 | 1 (FC) |
| Contact play: lead out | none from 3B | 0 |
| Sacrifice bunt (any band) | none (never offered with a run possible) | 0 |
| Squeeze 1–7 | none (CS) | 0 |
| Squeeze 8–15 | none (runner out at home) | 0 |
| Squeeze 16–19, < 2 out | R3 | 1 (SH) |
| Squeeze 16–19, 2 out | none (D8) | 0 |
| Squeeze 20 (all safe) | R3 | 1 |
| Natural steal, double steal, second steal of home, 1B+ steal | steal of home only | 0 |
| Walk-off (any of the above) | up to the winning run (HR: all) | counted runs only |
| Runs on a play whose 3rd out is batter-runner before 1B / a force | none count | 0 |

### 5.3 GIDP (Decision 7)

GIDP = 1 when **all** hold: (1) the batter's final chart result is GB (not
converted to a hit); (2) the defence attempted a standard DP, 3B→1B DP or
3B→2B→1B TP; (3) **exactly two** outs were recorded by that play's checks
(including a roll 20), each on a forced runner or the batter-runner (always
true in Elements). Not GIDP: completed TP (3 outs), any one- or zero-out
attempt, RFO/automatic forced outs, Infield In and contact play outcomes, FB
or PU, steals and other baserunning outs. A GIDP that ends the inning is
still a GIDP. Batter: AB, no RBI. Separate from DBP/DBPa/TBP/TBPa.

### 5.4 Winning pitcher decision tree (Decision 8)

Inputs per game: winning team **T**; the **go-ahead run G** = the run (in
EDSR-ORDER) after which T led for the rest of the game; per T pitcher: entry
order, starter flag, outs, runs charged, runs while pitching, H + BB; T's
defensive innings.

1. **Pitcher of record (POR).** T's pitcher who resolved the most recent event
   on the mound before G scored (covers "removed during the half-inning in
   which T took the lead"); if none, T's starter. Final result is never a tie
   (Elements has none); a game without a result gets no decisions.
2. **POR is the starter?**
   - **Yes:** starter threshold S = 15 outs if T defended ≥ 6 innings, 12 if
     T defended 5 (future configurations; Elements always 15). Outs ≥ S →
     **W = starter. End.** Outs < S → step 4 over **all** T relievers (one
     reliever → him). The brief-and-ineffective test is not applied here
     (9.17(b) doesn't use it).
   - **No** → step 3.
3. **Brief and ineffective POR.** POR is brief and ineffective iff outs < 3
   **and** runs while pitching ≥ 2. Not B&I → **W = POR. End.** B&I →
   candidates = T relievers who entered after POR and are not B&I themselves;
   none → **W = POR. End.**; else step 4 over the candidates.
4. **Ranking** — first difference decides: (1) outs ≥ 3 preferred; (2) fewer
   runs charged; (3) fewer runs while pitching; (4) fewer H + BB; (5) more
   outs; (6) earlier entry. Key 6 is unique per pitcher (a returning pitcher
   keeps his first entry), so exactly one winner. **End.**

Disqualification is only by: starter short of S (step 2); B&I (step 3).
Walk-off: POR is T's last pitcher (he pitched the top half). Lead changes:
only the final G matters. Tests: every branch and every key (§7 T-W).

**Loser (U11):** the responsible pitcher of G's runner (losing team).

### 5.5 Save logic (Decision 9 + MLB 9.19)

SV iff: finishes the game for the winner; not W; ≥ 1 out; the lead was never
tied or lost while he pitched; and **any** of —
(d1) lead at entry ≤ 3 and outs ≥ 3; (d2) lead at entry ≤ runners on base +
2 (tying run on base, at bat or on deck); (d3) outs ≥ 9 and `6 × ER ≤ outs`.
ER = runs charged to him (inherited runners excluded). One SV max. Walk-off
wins have no SV. Returning finisher: situation judged at his last entry, outs
and ER from his whole line. Examples: 9 outs 0/1 ER → SV; 9 outs 2 ER → no;
12 outs 2 ER → SV; 18 outs 3 ER → SV.

### 5.6 Defensive attempt classification (Decision 11)

| Event | Fielders credited (the declared combination) | Team line |
|---|---|---|
| Standard / 3B→1B DP attempt, 2 outs | DBPa 1, DBP 1 each | DP 1 |
| … 0 or 1 out | DBPa 1 each | — |
| TP attempt, 3 outs | TBPa 1, TBP 1 each; no DBP/DBPa | TP 1 |
| TP attempt, exactly 2 outs | TBPa 1 each; TBP 0; no DBP/DBPa | DP 1 (and batter GIDP) |
| TP attempt, 0–1 out | TBPa 1 each | — |
| RFO, Infield In, contact play, steals | none | — |

Team DP/TP totals count events, never summed fielders.

## 6. Fatigue and rest

### 6.1 Out-by-out distance Control (Decision 4)

L = card-IP outs; n = outs in this appearance; k = max(0, n − L + 1); Base =
printed Control − pre-game rest penalty − earned-run ladder (runs charged
after F). Floor −5.

- **Ordinary:** reduction = 2k (first −2 at out L).
- **Shutout Bonus** (n ≥ 15, n ≥ L, 0 runs charged, 0 inherited scored, not
  ended): starts at out m = max(15, L). Reduction = A + min(n − m + 1,
  max(0, Base − A)), where A = the ordinary reduction already accrued through
  out m − 1 (0 when L ≥ 15). *(Engine today uses min(k, Base) — equal when
  L ≥ 15; wrong otherwise: D10.)*
- **Bonus ended by a charged run:** accrued (frozen) + 2 immediately + 2 per
  later out.
- **Bonus ended by an inherited run (Option B):** accrued (frozen) + 2 per
  later out; no immediate −2.

Control 6, no other effects (engine today = approved, except where marked):

| Out | 3 IP | 5 IP | 6 IP | 6.67 IP | 7 IP |
|---|---|---|---|---|---|
| 8 | 6 | 6 | 6 | 6 | 6 |
| 9 | **4** | 6 | 6 | 6 | 6 |
| 10 | 2 | 6 | 6 | 6 | 6 |
| 11 | 0 | 6 | 6 | 6 | 6 |
| 12 | −2 | 6 | 6 | 6 | 6 |
| 14 | −5 | 6 | 6 | 6 | 6 |
| 15 | −5 SOB (engine **0** — D10) / −5 1 ER | **5** SOB / 4 | 6 | 6 | 6 |
| 18 | −5 | 2 SOB / −2 | **5** SOB / 4 | 6 | 6 |
| 20 | −5 | 0 SOB / −5 | 3 SOB / 0 | **5** SOB / **4** | 6 |
| 21 | −5 | 0 / −5 | 2 / −2 | 4 / 2 | **5** SOB / **4** |
| 23 | −5 | 0 / −5 | 0 / −5 | 2 / −2 | 3 / 0 |

(x SOB / y = Shutout Bonus intact / ordinary with ≥ 1 run charged.)
Card IP 5, bonus intact to out 19 (Control 1), HR at out 19 → −1; next out → −3.
Inherited run at out 19 instead → 1; next out → −1 (engine today: −4 if the
reference input were used; live charges the run as earned → −1 then −3).

### 6.2 Authoritative rest (Decisions 5, 6, Part 3)

| Step | Written rule | Reference `postGameRestGames` | Live server (`20261031`) | **Proposed authoritative (server)** |
|---|---|---|---|---|
| Non-appearance | rest decays | returns prior unchanged | prior − 1 (floor 0) | prior − 1, floor 0 (unchanged) |
| Appearance | + card fatigue | + card fatigue | + card fatigue | + card fatigue |
| Relief distance | +1 reliever beyond card IP and > 1.0 IP | +1 if relief, outs > 3, outs > L | **missing** | +1 if reliever, outs > 3, outs > L (ruling 7) |
| Efficiency | +1 bonus (= 1 game less), not back-to-back | −1 if flag, not back-to-back, floor 0 | **missing** | −1 if BF ≥ 1, BF = outs (U8), not back-to-back; floor 0 |
| Negative Control | +1 if started ≥ 1 and pitched at ≤ −1 | +1 with both flags | **missing** | +1 if Control at first pitch ≥ 1 and any pitch thrown at ≤ −1 |
| Milestone | − bonus | — | − bonus, floor 0 | − bonus, floor 0 |
| Appearance definition | — | flag | client marker (completed PA) | completed PA (ruling 8, Decision 6) computed by the server |
| Default attributes | — | unchanged | no accrual | no accrual |

Order: prior + fatigue + relief → efficiency (floor 0) → negative Control →
milestone (floor 0). One TypeScript module; SQL port with a parity test; the
client only displays server values. Written as a new migration, tested
locally, **not applied** without authorisation.

## 7. Test strategy (all deterministic, added to the harnesses so `npm test` picks them up)

- **T-WALK:** 8 states × chart BB / IBB × 0–2 outs; loaded walk-off; RBI;
  responsibility of the forced-in run; Showdown categories.
- **T-II (Infield In):** availability (positive and negative) for 8 states ×
  outs 0/1/2; every GB outcome; contact play bands (1, 20, out, safe) per
  hold state; PU/FB conversion per state; state change after a steal (U3);
  squeeze blocked; no combination consumed.
- **T-ROLL:** each pre-pitch option before any roll, after a successful steal,
  after CS, after inning-ending CS, after squeeze 1–7 (< 2 out), next inning
  after squeeze 1–7 as 3rd out (U7); three-batter mound lock unaffected.
- **T-WO:** every EDSR-WO example; walk-off in 10th/12th; contact play; sac
  fly with trailing throw (game ends first); pending extra-base decision not
  offered; 1B+ steal skipped; steal of home (no PA); HR all runs; top-9th
  lead unchanged.
- **T-508:** squeeze 16–19 two out; GB force third out with R3 running;
  trailing runner non-force third out after lead scores.
- **T-GB:** full matrix through the live decision API: 8 states × 0/1/2 outs ×
  choices × roll bands; TP fielding requirement and combination cycle; guard
  that nothing outside the shared module resolves a GB.
- **T-FAT:** tables in §6.1 for card IP 3, 4, 5, 6, 6.67, 7 (both branches,
  boundaries L − 1, L, L + 1, out 14/15); D10 cases; charged vs inherited
  bonus endings; ladder thresholds 3/4, 6/7, 7/8, 8/9, 9/10 runs charged;
  floor −5; returning pitcher.
- **T-REST:** every row of §6.2; each modifier alone, pairs, all three;
  boundaries (outs 3 vs 4, L vs L + 1, Control 0 vs 1 at start, −1 reached on
  last out without another pitch); floor 0; back-to-back; CS-only reliever;
  default attributes; SQL = TS parity; Postgres eligibility gates (pre-launch,
  practice, friendly, tracking off, duplicate completion).
- **T-STAT:** outcome matrix as executable table (every engine outcome needs a
  row); RBI table rows; GIDP criteria; DBP/TBP table; W tree (each branch,
  each key, returning pitcher, position change and back, inherited runners,
  walk-off, extra innings, lead changes ×3, 5-inning configuration); SV each
  route both sides of each threshold; G with BF 0 / outs 0 (walk-off steal);
  identical inputs → identical statistics (determinism, re-scoring).
- **T-PERSIST:** play records and box scores round-trip; idempotent writes;
  official writer refuses pre-launch/ineligible games; re-score replaces.
- **T-UI:** live lines and season strip ("No season stats yet"); desktop,
  condensed, tablet, 390–430 px; demo routes.
- **Regression:** all 317 existing tests; real persisted games loaded
  read-only from existing local snapshots still resume and play under
  `rulesVersion` 1.

## 8. Staged implementation (internal phases under one approval)

| Phase | Content | Depends on |
|---|---|---|
| **S0** (now) | This plan; rulings U1–U15; Will game on the current build (U13) | — |
| **S1 Gameplay** | a. `rulesVersion` on `GameState` (v1 frozen for games in progress). b. D3 shared GB module + full matrix (pure refactor first, behaviour unchanged). c. One `scoreRunners` path carrying each runner's responsible pitcher and scoring order. d. D1, D2, D7, D8, D9, D10, F, Infield In expansion, IN-PU, walk tests. e. Rulebook mirror amendments. | S0 rulings |
| **S2 Statistics foundation** | Identities (game, event sequence, card instance = side + card key, season from the frozen config), scoring version, pure statistics module, executable outcome matrix | S1c |
| **S3 Play recording** | A play record per transition emitted by the engine; verification that each outcome → exact batting/pitching/defensive lines | S1, S2 |
| **S4 Box scores** | Traditional + Elements box, play-by-play, history page (lab + `/demo`); persistence table (new migration, local only); legacy summaries per U14 | S3 |
| **S5 Live UI** | Batter/pitcher lines, season strip, mobile parity | S2, S3 |
| **S6 Official integration** | Empty protected official tables, trusted writer function, unified rest module + SQL port (§6.2), eligibility/idempotency on PGlite; migrations written, **not applied**; tracking OFF | S2–S4 |

**Why S1c is in the gameplay phase:** the walk-off fix (D7/D2) and the
fatigue correction (F) need per-runner scoring (who scored, in what order,
charged to whom). Building that bookkeeping inside the engine in S1 satisfies
"gameplay before statistics", and the play records in S3 then just read it.
This changes the earlier plan, which put it in A2 after the statistics schema.

Commits: one per phase or sub-phase on a local branch off `main` (which
already holds the unpushed `.gitignore` commit); nothing pushed (U15).

## 9. Documentation status — implemented vs approved-but-not-built

**Implemented today:** forced-only walks; distance −2 at the card-IP out;
Shutout Bonus −1 branch (with the D10 defects); intentional-walk/pinch-hitter
availability after steals; rest appearance = completed PA (ruling 8); server
rest base formula (fatigue, decay, milestone) with Stage 3 gates; three-batter
minimum; returning pitcher's continuous line; Infield In for runner-on-3B
states.

**Approved, not implemented:** Infield In expansion; D9; D1, D2, D7, D8, D3,
D10; F (charged runs, Option B, returning pitcher); efficiency/relief/
negative-Control rest on the server; every statistic, box score, play record,
live line and season strip; GIDP, RBI, W, SV, TBP/DBP rules; Rulebook
amendments A1–A17.

**Proposed / unresolved:** §3.

## 10. Launch blockers (official competitive launch)

1. Server-side move validation (recommended as a separate scope — §11).
2. Clean slate (enforced by the switch).
3. Two-account game with Will.
4. S1 gameplay corrections incl. F and D10, with regression tests.
5. Authoritative server rest (§6.2) applied.
6. Play records from the first official pitch (S3).
7. Box scores (S4); live UI (S5).
8. Trusted official writer, eligibility and idempotency (S6) — migrations
   applied with authorisation.
9. Rulebook amendments published (website + Google Doc).
10. Anthony's explicit deployment and activation authorisations.

Operational (not gameplay): backups / Supabase plan per `OPERATIONS.md`.

## 11. One coordinated effort — recommendation

**Yes**, everything in §4–§8 can be built as one coordinated effort under a
single approval, with internal phases S1–S6 committed separately and the full
suite run after each. It is large (engine, statistics, persistence, UI), so
the main risks are regressions in the dense engine code and compatibility
with saved games; both are covered by doing D3 first as a behaviour-neutral
refactor with the full matrix, and by freezing `rulesVersion` 1 for existing
games.

**Separate, for technical or data-safety reasons:**

1. **Server-side move validation** (launch blocker 1). It changes how every
   move is saved, needs a hosting decision (e.g. a Supabase Edge Function
   running the engine) and its own two-player verification. The trusted
   writer and authoritative rest are only as trustworthy as it. I'll make the
   engine server-runnable in this effort, but recommend the validation itself
   be its own approved scope right after.
2. **Applying migrations to the production database and deploying** —
   already reserved by Anthony.
3. **Activation of official tracking** — reserved.
4. **Backups / Supabase plan** — operational, Anthony's decision.

I'll pause only for the conditions Anthony listed (undefined rule, conflicting
approved rules that change gameplay, scope-changing technical issue, risk to
existing data or official records).
