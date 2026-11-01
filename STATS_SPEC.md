# Elements statistics specification — v6 (2026-11-01)

> **Status 2026-11-01 (implementation):** implemented locally on branch `stats-and-gameplay-v2` (not deployed): play log (`src/gameplay/playLog.ts`), statistics module (`src/gameplay/stats/`), box scores, live lines, season strip, official writer and tables (local migration, unapplied). Audit decision 10 approved the remaining EDSR rules as a block, so every rule below marked proposed is now approved and built. Where wording below says "not implemented", read `IMPLEMENTATION_PLAN.md` §0.

Status: **specification only. Nothing here is implemented.** v6 records
Anthony's 12 decisions of 2026-11-01 (walks, Infield In, rolls during an
at-bat, distance fatigue, efficiency, zero-BF appearances, GIDP, W, SV, RBI,
failed triple plays, gameplay-first ordering). The consolidated scope,
decision trees, tables, open rulings (U1–U15) and staged plan are in
`IMPLEMENTATION_PLAN.md`, which supersedes §17 below. The scorer-review workflow stays
**withdrawn**: every statistic, decision and credit is computed by a fixed
rule. Principle **[APPROVED]**: MLB scoring wherever it doesn't conflict with
an explicitly approved Elements rule; MLB judgment provisions replaced by
approved Elements Digital Scoring Rules.

### Approved rules (build exactly these)

OBA from the engine's batting advantage · OCHO, PCHW, OCHW, HCHO, ADV ·
automatic pitcher advantage = ADV · failed bunt then swing = a regular swing ·
converted results count as converted · squeeze rolls never give chart
categories · contact play and every fielder's choice = FC + chart out ·
intentional walk = BB + pitcher OCHW, no PCHW / OBA / ADV, flag kept · batting
G needs a completed PA · DEF 1…n unlimited, in order · OBP = (H + BB) / PA ·
QS (≥ 18 outs, ≤ 3 ER) · all runs earned · runs charged to the responsible
pitcher (9.16(g)) · team LOB only · IP stored as outs, rates from outs,
display 6.2 / 6.67 · DBP/DBPa and TBP/TBPa per participating fielder, one
attempt per sequence · two-out triple-play attempt: TBPa only, no DBPa
(provisional) · bunt all-safe = SH (FC with two out) · 1B+ = 1B + SB/CS ·
caught stealing (incl. squeeze 1–7, a CS) for the third out → no PA, same
batter leads off · **walk-off scoring per OBR 7.01(g), 5.08, 9.06(f)–(g)** ·
**no run on a third out that is the batter-runner before first or a force out
(5.08(a))** · Shutout Bonus Option B · returning-pitcher fatigue · box scores
for every completed game · official statistics only from eligible official
games, server-written, once per game · live D2 lines and season strip · mobile
parity.

**Added 2026-11-01 (12 decisions):** chart and intentional walks advance
forced runners only (engine already does; Rulebook amended) · Infield In
whenever runners are on with < 2 out (mechanics for new states: U1–U5) ·
steal rolls don't block a later intentional walk / pinch hitter, batting rolls
do (D9) · distance −2 from the out completing card IP · efficiency −1 when
BF = outs and BF ≥ 1 (U8) · pitching G = 1 on entry even with BF 0, no rest ·
GIDP = exactly two outs on a ground-ball DP/TP attempt, not a completed TP ·
deterministic W (tree in `IMPLEMENTATION_PLAN.md` §5.4, U12) · three-inning
save `6 × ER ≤ outs` with outs ≥ 9 · MLB-style RBI per the decision table ·
failed TP with two outs: TBPa 1, no TBP/DBP/DBPa, team DP 1 · gameplay fixes
before dependent statistics.

### Proposed rules (awaiting approval; not built)

Still proposed: EDSR-L, EDSR-HLD, EDSR-BSV, EDSR-ORDER, EDSR-RESP, EDSR-SB,
EDSR-LOB, EDSR-PA (U11); the walk-off HR and "natural course" adaptations
(U10); the W tree's final wording (U12). Open gameplay rulings: U1–U9, U13–U15
in `IMPLEMENTATION_PLAN.md` §3.

Companion documents (all local drafts, uncommitted):

| Document | What it holds |
|---|---|
| `STATS_SCORING_RULES_PROPOSAL.md` | Every proposed deterministic Elements scoring rule (W, SV, HLD, BSV, triple play with two outs, …), each in the eight-part format |
| `RULES_AUDIT.md` | Inventory of every subjective or undefined rule found in the Rulebook, the engine and this spec; confirmed engine discrepancies |
| `STATS_OUTCOME_MATRIX.md` | Every legal gameplay event → every statistic it produces; missing play-record data |
| `FATIGUE_RESPONSIBILITY_PROPOSAL.md` | The responsible-run fatigue correction (separate gameplay change) |
| `REST_SERVER_CORRECTION_PROPOSAL.md` | The server-side rest-writer correction (separate database change) |
| `LAUNCH_BLOCKERS.md` | Consolidated pre-launch blockers |

Labels used throughout:

- **[APPROVED]** — Anthony's decision; build exactly this.
- **[PROPOSED]** — awaiting Anthony's approval; not built until approved.
- **[DISCREPANCY]** — confirmed difference between the engine and an approved
  rule or the Rulebook.
- **[DEPENDENCY]** — technical prerequisite.
- **[BLOCKER]** — must be done before official launch.

Guiding principle **[APPROVED]**: every completed game gets a box score; only
eligible official games affect season statistics.

---

## 1. Foundational requirement — determinism [APPROVED]

1. Every legal gameplay event produces exactly one statistical outcome.
2. No scorer judgment, provisional decision, administrator override or
   fallback guess. The same play records under the same scoring version always
   produce the same statistics.
3. MLB official scoring (OBR chapter 9) is the foundation. Where an MLB rule
   needs scorer judgment, it is replaced by an explicit **Elements Digital
   Scoring Rule (EDSR)**, documented as an Elements rule (never attributed to
   MLB), and only after Anthony approves it.
4. One shared statistics module computes everything — live lines, box scores,
   season totals. No second implementation anywhere.
5. Every scoring definition carries a **scoring version**; a game is always
   scored under the version it was played with, and a correction re-scores it
   under a stated version, replacing (never adding to) its earlier
   contribution.
6. A legal event without a scoring definition is a **build failure**, not a
   runtime fallback (§16, coverage test).

MLB references in these documents are paraphrased from the Official Baseball
Rules; exact wording is to be checked against the current edition before each
EDSR is adopted.

## 2. Identity and keys [APPROVED]

- **Card:** `card_key` — player + year + team + set/version. Different
  versions never merge.
- **Game line:** `(game_id, side, card_key, role)`; role ∈ batting, pitching,
  fielding.
- **Official season line:** `(season_id, user_id, card_key, role)`.
- A card used in default-attributes mode is still that card; the mode is
  recorded in the play record.

## 3. Units [APPROVED]

- Innings are stored as **integer outs** (6⅔ = 20). IP = outs / 3 in every
  calculation; totals sum outs first; displayed decimals are never inputs.
- All other categories are integer counts; rates from summed counts; a zero
  denominator displays blank ("—"), never 0.

## 4. Structured play record [APPROVED in principle; fields in `STATS_OUTCOME_MATRIX.md` §3]

One record per resolved game event, written once, never edited, versioned.
It is the single source for play-by-play, live lines, box scores, Elements
statistics, historical records, season statistics and fatigue responsibility.
It preserves: exact batter and pitcher cards; the engine's advantage
determination; chart used; printed and converted results; every die roll with
its purpose; runner movements in scoring order; outs (who, how, by whom); runs
and RBI; the responsible pitcher of every runner; fielders involved;
double-play and triple-play attempts; substitutions and position changes;
scoring classifications.

## 5. Batting [APPROVED]

| Col | Definition |
|---|---|
| G | Games with ≥ 1 completed PA. Pinch runners / defensive replacements without a PA: none |
| PA | Completed plate appearances. A PA ended by a third out on the bases (caught stealing etc.) is **not** a PA; the same batter leads off the next inning |
| AB | PA − BB − SH − SF |
| R | Times scored |
| H, 1B, 2B, 3B, HR | From the **final converted** result, except a walk-off hit, credited per OBR 9.06(f)–(g) (EDSR-WO). 1B+ is a 1B; its steal is a separate SB/CS |
| RBI | Per the deterministic RBI table (`STATS_OUTCOME_MATRIX.md` §2.9) |
| SB, CS | As a runner |
| BB | All walks, including intentional |
| SO | Strikeouts, including a bunt "out on a K result" |
| OBA, OCHO, PCHW | §7 |
| GIDP | MLB: a ground ball resulting in a force (or reverse-force) double play; not on a completed triple play. Table: EDSR-GIDP [PROPOSED for confirmation] |
| SAC | Sacrifice bunts, including successful squeezes |
| SF | Sacrifice flies |
| BA / AVG | H / AB |
| OBP | **(H + BB) / PA** — Anthony's formula, intentionally not MLB's |
| SLG | (1B + 2·2B + 3·3B + 4·HR) / AB |
| OPS | OBP + SLG |

Positions **[APPROVED]**: DEF 1, DEF 2, DEF 3, … — every position played, in
order, no limit (box score and game line; the season tracker has no DEF
columns).

## 6. Fielding [APPROVED]

| Col | Definition |
|---|---|
| CS / SBa | As catcher: runners caught stealing / stolen bases allowed, every steal type |
| DBP / DBPa | Per participating fielder, per **double-play attempt** (one complete defensive sequence, however many rolls): DBPa 1; DBP 1 if the attempt succeeds. 1/1 or 0/1 |
| TBP / TBPa | **New permanent categories.** Per participating fielder, per **triple-play attempt**: TBPa 1; TBP 1 only if all three outs are recorded. A two-out result is TBPa without TBP |
| OFA | Outfield throw retires a runner (credited to the throwing outfielder) |

- Participants are recorded by card key at the moment of the play: a standard
  or 3B-to-1B double play — the three fielders of the chosen combination
  (`1B+2B+SS`, `1B+2B+3B`, `1B+3B+SS`); a triple play — 3B, 2B and 1B (the
  Rulebook's "3B-to-2B-to-1B", which also consumes the `1B+2B+3B` combination
  in the engine). Uninvolved fielders get nothing.
- **Team** double plays and triple plays are counted from attempts, never by
  summing fielders.
- A double-play attempt **succeeds** when both of its outs are recorded (roll
  20 is an automatic success; roll 1 and "lead out, batter safe" are
  failures).
- **Two-out triple-play attempt [APPROVED provisionally]:** one triple-play
  attempt — TBPa 1, no TBP, no DBPa. Its traditional classification (box-score
  DP line, GIDP) is separate: EDSR-GIDP.
- TBP/TBPa exist in the data model from A1, even if their UI columns arrive
  later.

## 7. Showdown categories [APPROVED]

| Col | Side | Awarded |
|---|---|---|
| OBA | batting | Exactly one per completed PA in which **the engine gave the batter the advantage**, whatever the result. Never inferred from hits or walks |
| OCHO | batting | A chart out in a PA with the batter's advantage |
| PCHW | batting | A hit or walk in a PA with the pitcher's advantage (incl. automatic) — never for an intentional walk |
| ADV | pitching | Every PA in which the pitcher has the advantage, including automatic |
| OCHW | pitching | A hit or walk allowed in a PA with his advantage, plus every intentional walk |
| HCHO | pitching | A chart out in a PA with the batter's advantage |

- **Chart out:** K, PU, FB or GB — including an ordinary fielder's choice and
  every contact-play outcome ("1 — all safe" included) — unless an Elements
  rule converted the result into a hit (failed Infield In PU/FB → 1B; negative
  infield fielding turning pitcher-chart GB results into 1B), which counts as
  the hit.
- A walk is never an out.
- **No chart category without a chart swing:** intentional walks (except the
  pitcher's OCHW, as decided), sacrifice-bunt rolls, squeeze rolls (including
  16–19 "GB result"), a bunt "K result".
- A failed bunt ("not possible") followed by a swing is a regular swing, with
  its advantage and chart.
- Conventional scoring and chart scoring stay separate.

## 8. Pitching [APPROVED]

| Col | Definition |
|---|---|
| G | Took the mound at least once — separate from BF, outs and rest (EDSR-G v2 [PROPOSED]); a CS-only reliever has G 1, BF 0, IP 0.1 |
| GS, CG, SHO | Starts; only pitcher for his side; OBR 9.18 |
| QS | Start with ≥ 18 outs and ≤ 3 ER |
| W, L, SV, HLD, BSV | **[PROPOSED]** EDSR-W v2, EDSR-L, EDSR-SV v2, EDSR-HLD, EDSR-BSV |
| BF | PAs against (charged to the pitcher on the mound for the roll that completes the PA) |
| IP | Outs recorded while he is the pitcher |
| H, 2B, 3B, HR, BB (incl. intentional), SO | Allowed |
| R | **Runs charged** as responsible pitcher (§9) |
| ER | = R (all runs are earned) |
| OCHW, HCHO, ADV | §7 |
| ERA = ER × 27 / outs · WHIP = 3(H + BB) / outs · H9, BB9, HR9, SO9 = 27 × count / outs | |

The Elements view also shows **runs while pitching** (runs that scored while
he was on the mound, inherited included) where it differs from R.

## 9. Pitcher responsibility [APPROVED]

- Every runner carries the pitcher responsible for him, set when he reaches.
- A run is charged to that pitcher — never simply to whoever is pitching.
- Preserved through pitching changes, multiple changes, inherited runners,
  pinch runners (the replacement inherits the replaced runner's), pitchers
  moving to another position and returning (responsibility follows the
  pitcher, not the position).
- OBR 9.16(g): a batter who reaches on a fielder's choice that retires a
  runner left by a preceding pitcher takes that preceding pitcher's
  responsibility. The multi-runner case is **[PROPOSED]** EDSR-RESP.

## 10. Team [APPROVED]

- **LOB:** team totals only — runners on base at the end of each half
  (walk-off half included; exact definition **[PROPOSED]** EDSR-LOB).
- Line score by inning incl. extra innings; R and H.
- No E, WP, PB or HBP anywhere (not part of Elements; extensible later).

## 11. Box score [APPROVED]

Every completed game, every classification (pre-launch, friendly, practice,
test, official), permanent:

- **Traditional view (default):** final score; line score; R and H; batting
  lines (AB R H RBI BB SO, + AVG for official season context only where
  official stats exist); pitching lines (IP H R ER BB SO + decisions);
  substitutions; decisions; notes: 2B, 3B, HR, SB, CS, SAC, SF, GIDP, DP, TP,
  team LOB. No unsupported categories.
- **Elements view:** OBA, OCHO, PCHW, OCHW, HCHO, ADV, DBP/DBPa, TBP/TBPa,
  catcher CS/SBa, OFA, DEF 1…n, runs while pitching.
- **Play-by-play:** the complete persistent log from play records.
- **Historical games** (before play records): only what can be reconstructed
  reliably, labelled "reconstructed"; everything else "not recorded" — never
  fabricated.
- Viewing, rebuilding or exporting a box score writes nothing and never
  triggers progression.

## 12. Live statistics — D2 [APPROVED]

- **Beside the scoreboard:** two stacked compact lines.
  - Batter: AB H R RBI HR BB SO (this game).
  - Pitcher: IP H R ER BB SO (this game; R = runs charged).
- Update on every saved event; follow substitutions (a new batter or pitcher
  shows his own line, starting from zeros or his earlier line in this game).
- Preserve the multiplayer turn status and every existing control.
- **Under the player cards:** official Elements season statistics only.
  - Batter: AVG HR RBI OPS. Pitcher: ERA W-L SO WHIP.
  - "No season stats yet" until official statistics exist for that card.
- Desktop, condensed desktop, tablet and 390–430 px phone parity; no new
  desktop scrolling; the cards are not shrunk materially.

## 13. Official season statistics and pre-launch protection [APPROVED]

- Only `official`, `complete` games completed while tracking is on contribute
  to season statistics, standings, records, milestones, progression and
  official rest. Pre-launch games never become eligible.
- Written only by trusted server-side logic from validated play records; app
  roles have no write access.
- One contribution per game (`game_id` key); a correction replaces it.
- Reopening or viewing never double-counts.
- Card identities and seasons stay separate.
- Stage 3 classifications and protections unchanged.
- Spreadsheet history never imported without separate approval.
- **[BLOCKER]** server-side move validation before official accumulation.

## 14. Display formats [APPROVED]

| Where | IP | Rates |
|---|---|---|
| Box score | 6.0 / 6.1 / 6.2 | ERA 2 dp |
| Season | 6.00 / 6.33 / 6.67 | AVG / OBP / SLG / OPS 3 dp · ERA 2 · WHIP 3 · per-9 2 |

## 15. Comparison with Anthony's spreadsheets

| Spreadsheet column | Game tracker | Season tracker | Elements system | Source in play records | Status |
|---|---|---|---|---|---|
| PLAYER | ✓ | ✓ | card (exact version) | batter / pitcher keys | approved |
| G (bat) | ✓ | ✓ | ✓ | ≥ 1 completed PA | approved |
| DEF 1, DEF 2 | ✓ | — | DEF 1…n | substitutions, alignment | approved (unlimited) |
| PA AB R H 1B 2B 3B HR | ✓ | ✓ | ✓ | outcome, runners | approved |
| RBI | ✓ | ✓ | ✓ | RBI table | approved; table in matrix |
| SB CS | ✓ | ✓ | ✓ | steal records | approved; multi-steal SB **[PROPOSED]** EDSR-SB |
| BB SO | ✓ | ✓ | ✓ | outcome | approved |
| OBA OCHO PCHW | ✓ | ✓ | ✓ | advantage + chart | approved |
| BA OBP SLG OPS | — | ✓ | ✓ | derived | approved (OBP = (H+BB)/PA) |
| GIDP SAC SF | ✓ | ✓ | ✓ | outcome | approved |
| CS SBa (catcher) | ✓ | ✓ | ✓ | steal records | approved |
| DBP DBPa | ✓ | ✓ | ✓ | dpAttempt | approved |
| — | — | — | **TBP TBPa** | tpAttempt | approved (new) |
| OFA | ✓ | ✓ | ✓ | throw records | approved |
| G GS (pitch) | ✓ | ✓ | ✓ | appearances | G definition **[PROPOSED]** |
| QS CG SHO | ✓ | ✓ | ✓ | lines | approved |
| W L SV HLD BSV | ✓ | ✓ | ✓ | decisions | **[PROPOSED]** EDSR-W/L/SV/HLD/BSV |
| BF IP | ✓ | ✓ | ✓ (IP as outs) | PAs, outs | approved |
| H BB 2B 3B HR SO (allowed) | ✓ | ✓ | ✓ | outcome | approved |
| — (sheet has no R) | — | — | **R charged** | responsibility | approved (new column) |
| ER | ✓ | ✓ | ✓ (= R) | responsibility | approved |
| OCHW HCHO | ✓ | ✓ | ✓ | advantage + chart | approved |
| ADV | — | ✓ | ✓ (also per game) | advantage | approved |
| ERA WHIP H9 BB9 HR9 SO9 | — | ✓ | ✓ (from outs) | derived | approved |
| IP entry as 6.67 | ✓ | ✓ | display only | outs | approved |
| LOB | — | — | team only | end-of-half bases | approved |

Differences from the sheets, all intentional: R charged added; TBP/TBPa added;
ADV also per game; DEF unlimited; IP stored as outs; nothing is entered by
hand.

## 16. Testing plan

Deterministic tests (harness scenarios, run by `npm test`) for every approved
rule, each with a stable ID:

1. **Showdown:** OBA on a hit, a walk and an out with the batter's advantage;
   no OBA without it (even on a hit or walk); every chart category in both
   advantages; automatic pitcher advantage → ADV; failed bunt then swing;
   squeeze 16–19 gives no chart category; intentional walk → BB + OCHW, no
   PCHW / OBA / ADV.
2. **Conversions:** failed Infield In PU/FB → 1B (hit, not chart out, no SF);
   negative infield fielding GB → 1B (hit).
3. **Fielder's choices:** ordinary FC; every contact-play outcome; RBI cases.
4. **Double plays:** success, failure, roll 1, roll 20, lead out / batter
   safe, lead safe / batter out, with 0 and 1 out; individual credits; team
   counts from attempts; uninvolved fielders get nothing; multiple rolls are
   one attempt.
5. **Triple plays:** 0, 1, 2 and 3 outs; automatic on roll 20 (first and
   second check); TBP/TBPa per participant; two-out result per the approved
   EDSR-TP; a completed triple play is not also a double play; team counts.
6. **Bunts:** every no-wheel band, every wheel band, every squeeze band, with
   0, 1 and 2 outs; SH never with two outs.
7. **Baserunning:** 1B+ steal SB and CS, and no steal when 2B is occupied;
   extra-base and tag-up outcomes incl. the lead-runner-scores-first rule;
   caught stealing for the third out (no PA, same batter leads off); every
   multi-steal case.
8. **Responsibility:** inherited runners; two and three changes in one
   inning; 9.16(g) incl. multi-runner cases; pinch runner; pitcher to field
   and back; Σ charged = runs.
9. **Fatigue (with the approved proposal):** its §7 list.
10. **Decisions (once approved):** every EDSR-W/L/SV/HLD/BSV edge case in
    the proposal; identical inputs always give identical decisions.
11. **Outs arithmetic:** 20 outs → 6.2 / 6.67; 6.1 + 2.1 = 26 outs = 8.2 /
    8.67; rates across several games; zero outs → blank.
12. **Aggregation:** season line = Σ game lines; multi-game totals.
13. **Historical reconstruction:** the 2026-10-30 game reconstructs only
    what its events support; nothing fabricated.
14. **Eligibility (real Postgres):** every classification gets a box score;
    only official + complete + tracking-on contributes; duplicate and
    corrected contributions replace, never add; activation never includes
    earlier games; no app write access.
15. **Presentation:** live lines and season strip at desktop, condensed
    desktop, tablet and phone widths; substitution updates; no layout
    regressions.
16. **Consistency checks (every simulated game, thousands of games):**
    Σ player R = team runs = line score; Σ pitcher R charged = opponent runs;
    PA = AB + BB + SH + SF; H = 1B + 2B + 3B + HR; Σ pitcher outs = opponent
    outs; defensive credits = recorded participants; live line = box score
    truncated at that moment = season contribution; one W and one L per game.
17. **Walk-off (EDSR-WO):** every example row in the proposal; walk-off
    walk, sacrifice fly, fielder's choice, contact play, steal of home (no PA),
    extra-base decision (not offered after the winning run), 10th and 12th
    innings; HR counts every run; hit credit = min(chart, winning runner's
    advance); only counted runs reach R, RBI, pitcher charges and fatigue.
18. **Third-out run rule (5.08(a)):** squeeze 16–19 with two out (no run);
    trailing runner thrown out after the lead run (run counts); force third
    out on a ground ball (no run); multiple-steal target third out (Rulebook:
    others don't advance).
19. **Squeeze 1–7:** CS for runner and catcher; third out → no PA, same batter
    leads off; not third out → PA continues.
20. **Ground-ball matrix against the live engine** (`RULES_AUDIT.md` §4): every
    base state × outs × choice × roll band, incl. every triple-play outcome.
21. **Rulings once made:** D6 walks (every runner vs forced), G5 Infield In
    availability, G6 eligibility after rolls (blocked after squeeze 1–7, not
    after steals), R6 distance threshold, efficiency reading.
22. **Coverage test:** every engine event type × outcome in
    `STATS_OUTCOME_MATRIX.md` has a scoring definition and a scenario; a new
    engine outcome without one fails the build.
23. **Acceptance:** the Will game, hand-scored by Anthony.

## 17. Phased implementation plan — SUPERSEDED

Superseded on 2026-11-01 by `IMPLEMENTATION_PLAN.md` §8 (phases S0–S6 under
one consolidated approval; per-runner scoring moved into the gameplay phase
S1). Kept below for history.

Previous order: Stage 3 verification → R0 rule approvals → A1 → A2 →
G / F and separately approved corrections → B → C → D → E. The audit confirms
this order technically: the walk-off fix (D7) and the responsible-run fatigue
correction (F) both need A2's per-runner scoring (who scored, in which order,
charged to whom), so they come after A2. D1 (squeeze PA) and D3 (one
ground-ball implementation) don't depend on A2 and may be done any time after
approval, each as its own change.

| Phase | Content | Depends on |
|---|---|---|
| Stage 3 verification | The full two-account game with Will | — |
| R0 | Anthony approves or amends the proposals | — |
| A1 | Versioned play-record schema, shared statistics module, outcome matrix as executable tests (approved rules only) | R0 for each rule it encodes; **Stage 4 authorisation** |
| A2 (Stage 4) | Play records on every event, responsibility bookkeeping, scoring order, detailed play-by-play | A1 |
| G | Engine corrections: D1, D2/D7 walk-off, D8 squeeze two-out run, D3 one GB implementation, D9 eligibility, D6 if changed — each its own change with regression scenarios | A2 (D2/D7, D8); approval |
| F | Responsible-run fatigue, Option B, returning pitcher; rules version frozen per game | A2; explicit approval |
| B | Box scores: traditional, Elements, play-by-play, historical | A2 |
| C | Live D2 lines | A2 |
| D | Season strip + empty protected official tables | A1 |
| RS | Authoritative server rest (`REST_SERVER_CORRECTION_PROPOSAL.md`) | A2; server move validation |
| E | Trusted official statistics writer, once per game, corrections replace | server move validation; D; approved decision rules |

**Blockers to start Stage 4 (A2):** the Will game; Anthony's explicit
authorisation; A1 complete. Blockers for official launch: `LAUNCH_BLOCKERS.md`.

Official tracking stays off until Anthony declares launch.

## 18. Changes in v5

- Walk-off scoring approved (EDSR-WO) and wired into H, RBI, pitcher charges
  and fatigue.
- 5.08(a) third-out rule approved in principle; squeeze 1–7 confirmed as a CS.
- GIDP now follows MLB's force-double-play definition (no GIDP on a completed
  triple play); GIDP and RBI tables moved to the proposal for confirmation.
- Pitching G separated from BF, outs and rest (EDSR-G v2).
- Two-out triple play: provisional approval recorded.
- Tests 17–21 added; phase plan with dependency reasons; Stage 4 vs launch
  blockers separated.

## 19. Changes in v6

- Anthony's 12 decisions recorded; status of each (implemented vs not) in
  `IMPLEMENTATION_PLAN.md` §1 and §9.
- GIDP: exactly two outs on a declared ground-ball DP/TP attempt (Decision 7).
- W tree, SV (d)(3) `6 × ER ≤ outs`, RBI table, DBP/TBP table: plan §5.
- Pitching G on entry with BF 0 (Decision 6).
- §17 superseded by the plan's phases S0–S6.
