# Gameplay outcome → statistics matrix (2026-11-01)

> **Status 2026-11-01 (implementation):** the rows are now implemented: `playLog.ts` records each outcome and `stats/gameStats.ts` attributes it; the matrix is exercised by `rulesV2ScenarioHarness.ts`, `stats/statsScenarioHarness.ts` and 60 reconciled simulated games (`statsFullGame.test.ts`). Infield In rows for 1B, 2B and 1B + 2B are approved (audit 4); R1 + R3 hold: batter safe, R1 to 2B, R3 holds, no out (audit 1, confirmed).

Status: **specification only.** Updated for Anthony's 12 decisions
(2026-11-01): rows for walks, GIDP, RBI, W/SV, TBP/DBP and pitching G are now
approved rules; Infield In rows for the newly available states (1B, 2B,
1B + 2B) await U1–U5 in `IMPLEMENTATION_PLAN.md` §3, which also has the full
RBI table (§5.2). Every legal event the engine can produce
(`src/gameplay/coreGame.ts`, `decisionEngine.ts`, `gameBoundaryEngine.ts`),
with every statistic it produces under the approved rules (`STATS_SPEC.md`)
and the proposals (`STATS_SCORING_RULES_PROPOSAL.md`, marked **[P]**). A row
marked **[R]** depends on a gameplay ruling in `RULES_AUDIT.md`. In A1 this
document becomes an executable table: every row is a test, and an engine
outcome with no row fails the build.

---

## 1. Rules applied to every event

**Notation for chart categories** (chart swings only):

- **[A]** advantage credit on every completed chart PA: batter's advantage →
  batter OBA; pitcher's advantage (incl. automatic) → pitcher ADV.
- **[CO]** chart out: batter's advantage → batter OCHO + pitcher HCHO;
  pitcher's advantage → nothing further.
- **[HW]** chart hit or walk: pitcher's advantage → batter PCHW + pitcher
  OCHW; batter's advantage → nothing further.

**Uniform consequences:**

| Item | Rule |
|---|---|
| PA / BF | Completed PA → batter PA, pitcher BF (EDSR-PA [P]); lineup advances; hitter fatigue appearance (existing) |
| Outs | Each out → +1 out (IP) for the pitcher on the mound; distance-fatigue check for him |
| Runs | Each run → R for the runner; R charged to the runner's responsible pitcher; "runs while pitching" to the pitcher on the mound; team run; line score. Scoring order: EDSR-ORDER [P] |
| Fatigue | Earned-run ladder from runs charged (after phase F; today: the pitcher on the mound); an inherited runner scoring ends the Shutout Bonus (Option B, after F) |
| Responsibility | A batter who reaches carries the current pitcher, except 9.16(g) transfers (EDSR-RESP [P]); a pinch runner inherits |
| No error / WP / PB / HBP | Never produced |

## 2. Event tables

### 2.1 Chart swing results (no conversions)

| Result | Batter | Chart | Pitcher | Runners / defence | RBI |
|---|---|---|---|---|---|
| SO | PA, AB, SO | [A] [CO] | BF, SO, 1 out | — | — |
| PU | PA, AB | [A] [CO] | BF, 1 out | No tag-ups or extra bases | — |
| FB, 2 out | PA, AB | [A] [CO] | BF, 3rd out | — | — |
| FB, < 2 out, no tag-up (declined or RTS failed) | PA, AB | [A] [CO] | BF, 1 out | — | — |
| FB, tag-up, ≥ 1 run scores | PA, **SF** (no AB) | [A] [CO] | BF, outs | Per §2.3 | 1 per run |
| FB, tag-up, no run scores | PA, AB | [A] [CO] | BF, outs | Per §2.3 | — |
| GB | see §2.2 | [A] [CO] always | | | |
| 1B | PA, AB, H, 1B | [A] [HW] | BF, H | Runners +1; extra bases §2.3 | 1 per run |
| 1B+ | PA, AB, H, 1B | [A] [HW] | BF, H | As 1B; then, if 2B is open after extra bases, batter steals 2B: SB or CS (catcher SBa / CS); a CS adds an out (PA already complete) | 1 per run on the hit; none on the steal |
| 2B | PA, AB, H, 2B | [A] [HW] | BF, H, 2B | Runners +2; extra base (1B → home) §2.3 | 1 per run |
| 3B | PA, AB, H, 3B | [A] [HW] | BF, H, 3B | All runners score | 1 per run |
| HR | PA, AB, H, HR, R | [A] [HW] | BF, H, HR | All score | runners + 1 |
| BB (chart) | PA, BB | [A] [HW] | BF, BB | Forced runners +1 (approved, Decision 1; Rulebook amended) | 1 (bases loaded only) |

### 2.2 Ground balls

Outs before the play are 0 or 1 unless stated. Every row is a chart out [A]
[CO].

| Situation / choice / roll | Batter | Runners, outs, runs | Defence | RBI |
|---|---|---|---|---|
| 2 out | out (AB) | Batter out, inning over, no run | — | — |
| Bases empty | out (AB) | 1 out | — | — |
| R3 only (no Infield In) | out (AB) | R3 scores, batter out | — | 1 |
| R2 only | out (AB) | RTH 1–10 R2 → 3B; 11–20 holds | — | — |
| R2 + R3 | out (AB) | R3 scores; R2 RTH | — | 1 |
| R1 (± others) → **automatic out**, RFO 1–5 (R1 only) | out (AB) | Batter out; R1 → 2B; others +1 (R3 scores) | — | 1 per run |
| … RFO 6–20 (R1 only) | **FC** (AB) | R1 out at 2B; batter safe; others +1 | — | 1 per run |
| R1 + R2 → automatic out, RFO 1–5 / 6–15 / 16–20 | out / FC / FC (AB) | Batter / runner to 2B / runner to 3B out; others +1 | — | 1 per run |
| **Standard or 3B-to-1B DP**, roll 1 (all safe) | **FC** (AB) | No outs; everyone +1 | DBPa each participant (0/1) | 1 per run |
| … both out (incl. roll 20) | out (AB), **GIDP** | 2 outs; others +1 (a run counts only if the inning isn't over) | **DBP 1/1** each; team DP turned; box "DP" | **none** |
| … lead out, batter safe | **FC** (AB) | 1 out | DBP 0/1 | 1 per run |
| … lead safe, batter out | out (AB) | 1 out | DBP 0/1 | 1 per run |
| **Triple play**: 0 outs (first check 1 or failed) | FC (AB) | All +1 | TBPa each (0/1) | 1 per run |
| … 1 out (runner to 3B out) | FC (AB) | R1 → 2B, batter safe, R3 scores | TBP 0/1 | 1 per run |
| … 2 outs (batter safe) | AB, no hit, **GIDP** | Runner to 3B and 2B out; R3 scores | TBP 0/1; **no DBP/DBPa** (EDSR-TP [P]); box "DP" | none |
| … 3 outs (incl. roll 20 on check 1 or 2) | out (AB); **no GIDP** (extra out follows — EDSR-GIDP [P]) | Inning over, no run | **TBP 1/1** each; box "TP" | none |
| **Infield In**, bases loaded | FC (AB) | Runner from 3B out at home; others +1 | — | — |
| Infield In, 3B / 2B+3B (+ 2B only) | out (AB) | Runners hold; batter out | — | — |
| Infield In, 1B + 3B (Anthony, 2026-11-01) | FC (AB), no out | Batter safe at 1B, R1 to 2B, R3 holds -- bases loaded, no out | — | — |
| Infield In, 1B / 1B+2B (new states, U5) | FC (AB) | Lead runner forced out; others +1; batter safe | — | — |
| **Contact play** (Infield In, offence option): lead runner out (check or 20) | FC (AB) | Lead out; others +1; batter safe | — | — |
| … lead runner safe (check failed, or roll 1 "all safe") | **FC** (AB), no error | No outs; lead scores; all +1 | — | 1 |

Participants: double play — the chosen combination's three fielders; triple
play — 3B, 2B, 1B.

### 2.3 Extra bases (after 1B / 2B) and tag-ups (after FB)

| Step | Outcome | Statistics |
|---|---|---|
| Declined / RTS fails | Play over | Batter keeps the hit (or the FB out) |
| Throw, target safe | Every attempt succeeds | Runs per §1; RBI to the batter (part of the hit, or SF on a tag-up) |
| Throw, target out | Target out on the throw (not a CS); **OFA** to the outfielder; lead runners' attempts complete first (Rulebook); trailing runners stop if it's the third out | Out → pitcher IP; runs that scored first count, with RBI / SF |
| Infield In PU/FB → 1B | No extra bases or tag-ups (Rulebook) | — |
| PU | No tag-ups (Rulebook) | — |

### 2.4 Conversions

| Conversion | Scored as | Chart |
|---|---|---|
| Failed Infield In: PU / FB → 1B | 1B (hit); runners +1; no extra bases, no SF | [A] [HW] — a hit, never a chart out |
| Negative infield fielding: pitcher-chart GB → 1B | 1B (hit) | [A] [HW] (pitcher's advantage: PCHW + OCHW) |

### 2.5 Pre-pitch actions

| Action / roll | Batter | Pitcher | Runners / defence | RBI | PA |
|---|---|---|---|---|---|
| **Intentional walk** | BB (no AB); `intentional` | BF, BB, **OCHW**; no ADV | Forced +1 | 1 if bases loaded | yes |
| Natural steal, one runner, safe | — | — | Runner SB; catcher SBa; to home: run, no RBI | — | no |
| … caught | — | 1 out | Runner CS; catcher CS. **Third out → no PA; same batter leads off** | — | no |
| Squeeze 1–7 is classified the same way: the Rulebook calls it "an unsuccessful stolen base attempt of home" → CS | | | | | |
| Multiple steal, target safe | — | — | Each SB; catcher SBa each | — | no |
| Multiple steal, target out (not 3rd) | — | 1 out | Target CS; others advance **without SB** (EDSR-SB [P]); catcher CS 1 | — | no |
| Multiple steal, target out for the 3rd out | — | 1 out | Target CS; others don't advance | — | no |
| Second steal of home (after a steal of 2B with R3) | — | out if caught | SB / CS; catcher SBa / CS | — | no |
| Walk-off by steal of home | — | — | SB; game ends at once; no PA, no AB, order doesn't advance (EDSR-WO; engine wrong today: D2) | — | no |
| **Sac bunt, no wheel** 1–2 "not possible" | the swing that follows is scored as a normal swing on the pitcher's chart (pitcher's advantage) | | | | per swing |
| … 3–4 "K result" | PA, AB, SO | BF, SO, out; **no chart category** | Runners hold | — | yes |
| … 5 lead runner out | PA, AB, FC | BF, out | Others forced +1 | — | yes |
| … 6–20 batter out, runners advance | PA, **SH** (< 2 out) or AB (2 out) | BF, out | Runners +1 (R3 holds with 1B+3B) | — | yes |
| **Sac bunt, wheel** 1–15 all safe | PA, **SH** (< 2 out) or AB + FC (2 out) | BF | All +1 (R3 holds unless forced) | — | yes |
| … 16–20 lead runner out | PA, AB, FC | BF, out | Others +1 | — | yes |
| **Squeeze** 1–7 | — | out | R3 CS; catcher CS; PA continues. **Third out → no PA** (engine wrong today: D1) | — | no |
| … 8–15 | PA, AB, FC | BF, out | R3 out at home; batter safe; others forced +1 | — | yes |
| … 16–19 | PA, **SH** (< 2 out); with two out: AB, out | BF, out | R3 scores, batter out. **Two out: no run** — the batter-runner is the third out before first (OBR 5.08(a), approved in principle; engine wrong today: D8) | 1 (< 2 out); 0 (2 out) | yes |
| … 20 | PA, **SH** (< 2 out) / AB + FC (2 out) | BF | R3 scores; batter safe; others forced +1 | 1 | yes |
| Infield In declared | — | — | State only; available with any runner and < 2 out (Decision 2) | — | — |

Sacrifice and squeeze rolls never give chart categories.

### 2.6 Substitutions and positions

| Action | Statistics |
|---|---|
| Pinch hitter | Gets the PA if he completes it (EDSR-PA [P]); batting G only with a completed PA; DEF entry if he takes the field |
| Pinch runner | Inherits the replaced runner's responsibility; R if he scores; no batting G without a PA; DEF entry if he stays in |
| Defensive substitution | DEF entry (position, in order); no batting G without a PA |
| Pitching change | Entry logged; pitching G 1 (EDSR-G v2 [P]) even with no completed PA; rest only with a completed PA (ruling 8); three-batter minimum applies |
| Double switch | Pitcher and fielder changes + lineup slots; DEF entries |
| Fielder ↔ pitcher swap | DEF entries for both; the new pitcher's appearance; a returning pitcher keeps one line and his responsibility |
| Default-attributes entry | Recorded in the play record; statistics as usual (S24 [P]) |

### 2.7 Game boundaries

| Event | Statistics / state |
|---|---|
| Third out | Half ends; team LOB (EDSR-LOB [P]); next half starts with the batter after the last completed PA |
| Home leads after the top of the 9th or later | Game complete; decisions computed |
| Walk-off run (bottom 9th or later) | Game ends at the winning run (EDSR-WO, approved): later runs on the play don't count except on an HR; nothing after it happens (no extra-base decision, no 1B+ steal); hit credited = min(chart bases, winning runner's advance); only counted runs reach R, RBI, pitcher charges, fatigue; chart statistics use the actual chart result. Engine today counts every run on the play (D7) |
| Extra innings | No placed runner (1925 season configuration) |
| Terminated / cancelled game | No result, no decisions; play-by-play kept, labelled "ended without result" [P] |

### 2.8 Other game-state consequences

| Event | Consequence |
|---|---|
| Double-play / triple-play attempt | Combination usage cycle advances (Rulebook) |
| Outfield throw | Outfielder usage cycle advances (Rulebook) |
| Natural steal | Team's natural steal used, unless the catcher's fielding is negative |
| Batter faced | Three-batter-minimum counter |
| Completed game (official, tracking on) | Server rest writer (`REST_SERVER_CORRECTION_PROPOSAL.md`); official statistics (phase E) |

### 2.9 RBI table (OBR 9.04 made deterministic) — confirm as EDSR-RBI [P]

| Run scores on … | RBI |
|---|---|
| Any hit, including runners' extra bases on that hit; the batter's own HR run | yes |
| Walk or intentional walk with the bases loaded | yes |
| Sacrifice fly; successful squeeze (SH) | yes |
| Fielder's choice or infield out without a double play (RFO, failed DP attempt, contact play incl. "all safe", triple-play attempt with 0 or 1 out, R3 scoring on a GB out) | yes |
| A ground-ball play with ≥ 2 outs (double play, two-out triple-play attempt) | **no** |
| A steal (incl. steal of home, the 1B+ steal), a squeeze 1–7 | no |
| (Errors, wild pitches, balks — none exist) | — |

## 3. Play record — fields, what exists today, what is missing

Today every saved move writes a `game_events` row whose payload carries a
before/after envelope (`src/gameplay/eventPayload.ts`): inning, half, outs,
score, bases (with runner card keys), batter and pitcher **names**, advantage,
resulting outs / score / bases, the next pending decision, and the action's
own keys (roll, chart result, play description). Server-issued dice are
stored separately.

| Field | Exists today | Needed for |
|---|---|---|
| `scoringVersion`, `rulesVersion` | **missing** | Re-scoring, rule changes mid-season |
| `sequence` within the game | state_version (yes) | Ordering |
| Batter and pitcher **card keys** | **missing** (names only) | Exact identity |
| Lineup slot of batter; on-deck batter | derivable from state, not recorded | EDSR-SV (d)(2) |
| Advantage (hitter / pitcher / automatic / none) | partly (advantage; "automatic" not distinguished) | OBA, ADV |
| Chart used; printed result; converted result + conversion reason | **missing** (only the final chart result) | Conversions, chart outs |
| Every die roll with its purpose (pitch, swing, RTS, RFO, DP check 1/2, TP check 1/2/3, contact, OF throw, catcher, squeeze, bunt) | partly (dice log; purpose not structured in the event) | Reconstruction, DP/TP attempts |
| Decision choices: GB choice, combination, wheel / no wheel, Infield In, contact play, extra-base / tag-up attempts and target, steal attempts and target, intentional walk | **missing** as structured fields | Every bunt / DP / TP / steal row |
| Per-runner movement: from, to, scored (with `scoreOrder`) or out (how, by whom) | **missing** (a before/after diff can't tell who scored vs who was out when several runners vanish) | R, RBI, LOB, OFA, CS |
| Responsible pitcher per runner | **missing** | R charged, W/L, fatigue F |
| RBI per run | **missing** | RBI |
| Outs per event with the out type (force, tag, caught stealing, thrown out by OF X) | **missing** | IP, OFA, CS, GIDP |
| DP / TP attempt: type, participants (card keys), rolls, outs, success | **missing** | DBP/DBPa, TBP/TBPa |
| Substitutions and position changes (who, from → to, lineup slot) | in state, not in the event | DEF, G, responsibility |
| Attribute mode (card / default) | in state | Identity notes |
| PA flag: complete / continues / none | **missing** | PA, G, no-PA third outs |
| Pitcher's Control at each pitch roll; Control at entry | **missing** | Server rest (negative-Control rule) |
| Pitcher entry state (score, runners, outs) | **missing** | SV, HLD, BSV |

Historical games keep only what the envelope supports, labelled
"reconstructed"; anything that needs a missing field is "not recorded".
