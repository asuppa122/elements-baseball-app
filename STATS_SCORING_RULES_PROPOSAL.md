# Elements Digital Scoring Rules (EDSR) — v3 (2026-11-01)

> **Status 2026-11-01 (implementation):** every EDSR rule here is **approved** (audit decisions 9–11: walk-off HR and natural-course adaptations, the W tree as written, L, HLD, BSV, ORDER, RESP, SB, LOB, PA) and implemented locally in `src/gameplay/stats/` and `src/gameplay/runScoring.ts`. Holds and blown saves are recorded by side (the same card may pitch for both teams).

Status: each rule is marked **[APPROVED]** or **[PROPOSED]**. Nothing here
is implemented. v3 records Anthony's decisions 7–11 of 2026-11-01: EDSR-W
(approach), EDSR-SV option A, EDSR-GIDP, EDSR-RBI, EDSR-TP and EDSR-G are
approved; the complete W decision tree, RBI table, GIDP criteria and
defensive-attempt table are in `IMPLEMENTATION_PLAN.md` §5 (authoritative
where this document is shorter). Still proposed: EDSR-L, HLD, BSV, ORDER,
RESP, SB, LOB, PA (U11) and the walk-off adaptations (U10). Proposed rules
are not built. Once approved, an EDSR is an **Elements rule**, documented as
such, never attributed to MLB.

**MLB references.** Quoted or paraphrased from the Official Baseball Rules as
reproduced at baseballrulesacademy.com (9.06, 9.17) and MLB's glossary
(GIDP). Older editions number the scoring rules 10.xx. Exact wording is to be
checked against the current official edition before each rule is adopted.

**Facts about Elements games the rules rely on (verified):**

- Regulation is 9 innings (`gameBoundaryEngine.ts`; 1925 season
  configuration). The Rulebook has no shortened-game, weather or mercy rule,
  and no early ending exists. Extra innings have no placed runner.
- The winning team therefore always defends at least 9 innings.
- No ties. A terminated or cancelled game has no result and no decisions.
- Substitutions happen only before a pitch roll. There are no balls and
  strikes.
- Three-batter minimum for every pitcher (MLB 5.10(g), adopted 2026-10-30,
  `GAMEPLAY_REFERENCE_NOTES.md` ruling 6).
- A pitcher moved to the field may return to the mound with one continuous
  pitching line (ruling 5).

**Shared measures** (kept separate on purpose):

| Measure | Meaning |
|---|---|
| **Runs charged** (R / ER) | Runs scored by runners he is responsible for, whenever they score |
| **Inherited runs scored** | Runners left by an earlier pitcher who score while he is pitching (charged to that pitcher) |
| **Runs while pitching** | All runs that score while he is on the mound = his own runners scoring while he pitches + inherited runs scored |
| **Outs** | Outs recorded while he is the pitcher (incl. caught stealing, outs on throws) |
| **Baserunners allowed** | Hits + walks allowed |
| **Entry order** | Order in which pitchers first took the mound — unique per pitcher |

---

## EDSR-WO — Walk-off games [APPROVED: Anthony, 2026-11-01]

1. **Source.** OBR 7.01(g) and 5.08: in the last half of the 9th or an extra
   inning, the game ends the moment the home team scores the winning run;
   only the runs needed count, except that on a home run hit out of the
   playing field the batter and all runners score (9.06(g)). With the bases
   full and the batter awarded first base, the game ends when the forced
   runner from third touches home and the batter touches first (5.08(b)).
   OBR 9.06(f): the batter's game-ending hit is credited with only as many
   bases as the winning runner advanced, and only if he runs out his hit that
   far; comment: a base touched in the natural course of play is credited even
   if the winning run scored moments before.
2. **Ambiguity for Elements.** Elements has no running timing ("natural course
   of play"), and no inside-the-park home run distinction.
3. **Rule.**
   - **Game end.** The game ends at the run that puts the home team ahead in
     the bottom of the 9th or later. Runs later in the scoring order
     (EDSR-ORDER) on that play don't count, except on an Elements **HR**.
   - **HR.** Every Elements HR result is a home run out of the playing field
     (Elements has no inside-the-park HR) → batter and all runners score.
     *Elements adaptation, [PROPOSED] — confirm (U10).*
   - **Forced award** (BB, intentional walk with the bases loaded): one run;
     the batter gets the BB.
   - **Hit credit** (9.06(f)). Credited bases = the smaller of (a) the bases
     of the chart result after any conversion and (b) the bases advanced on
     the play by the runner who scores the winning run. *Elements adaptation,
     [PROPOSED]:* since the batter's chart base is reached in the same instant
     as the winning run, "natural course of play" is read as "no further than
     the winning runner advanced".
   - **Third-out exceptions** (5.08(a)) apply first: no run counts when the
     play's third out is the batter-runner before first or a force out.
   - **Recognised during the play**: hits, walks, sacrifices, fielder's
     choices, contact plays, steals of home, extra-base and tag-up decisions,
     extra innings. Nothing after the winning run happens (no extra-base
     decision, no 1B+ steal, no further throw).
   - **Walk-off steal of home** during an unfinished PA: no PA, no AB, the
     batting order doesn't advance.
4. **Conditions.** Bottom of the 9th or any later inning, home team tied or
   behind before the play.
5. **Data.** Scoring order, each runner's start base, chart result, score
   before the play.
6. **Outcome.** Conventional: hit type per (3); R and RBI only for counted
   runs; pitchers charged only for counted runs; fatigue only from counted
   runs. Showdown chart statistics use the actual chart result (a chart 2B
   credited as a 1B is still a chart hit). The play record keeps both.
7. **Examples.**

   | Situation | Play (chart) | Final | Credited |
   |---|---|---|---|
   | Tied 4–4, runners 2B + 3B | 2B | 5–4 | **1B** (winning runner from 3B advanced 1), RBI 1 |
   | Trailing 4–3, bases loaded | 3B | 5–4 | **2B** (winning runner from 2B advanced 2), RBI 2 |
   | Tied 3–3, runner 2B | 2B | 4–3 | **2B**, RBI 1 |
   | Tied 3–3, runner 1B, extra base 1B → home succeeds | 2B | 4–3 | **2B** (winning runner advanced 3; chart 2) |
   | Trailing 4–3, runners 1B + 2B | HR | 6–4 | **HR**, RBI 3 |
   | Tied 2–2, bases loaded | BB | 3–2 | BB, RBI 1 |
   | Tied 3–3, runner 3B, 1 out | steal of home | 4–3 | SB; no PA for the batter |
   | Tied 1–1, runner 3B, 2 out | squeeze 16–19 | inning over, 1–1 | no run (batter-runner third out, 5.08(a)) |
   | Tied 5–5, runners 1B + 3B, 1 out | GB, lead out at 2B (RFO 6–20) | 6–5 | FC, RBI 1 (not a third out) |

8. **Tests.** Every row above; walk-off in the 10th and 12th; walk-off
   contact play; walk-off sac fly with a trailing runner thrown at (game ends
   before the throw); walk-off with an extra-base decision pending
   (not offered); a top-of-the-9th home lead (unchanged); live line, box score
   and pitcher charges all reflect only counted runs.

## EDSR-ORDER — Scoring order within one play [PROPOSED]

Runs on one play score **lead runner first** (from 3B, then 2B, then 1B, then
the batter), matching the Rulebook's extra-base rule that a lead runner's
attempt completes before a trailing runner is thrown out. Defines the
go-ahead run, the walk-off run and RBI order. Tests: bases-loaded double;
trailing runner thrown out for the third out after the lead runner scores.

## EDSR-W — Winning pitcher, v2 [APPROVED approach — Decision 8; final tree: `IMPLEMENTATION_PLAN.md` §5.4, U12]

1. **Source (OBR 9.17).**
   - (a) The win goes to the pitcher whose team takes the lead while he is in
     the game, or during the half-inning in which he is removed, and never
     relinquishes it. Comment: a tie starts a new contest; a pitcher who
     allowed the opponent's lead and stays in until his team regains it, and
     holds it, gets the win.
   - (b) A starter must complete 5 innings in a game lasting 6+ innings on
     defense (4 innings in a 5-inning game). Otherwise the win goes to the
     only reliever, or, with several, "the most effective" in the scorer's
     judgment. Comment: a reliever should generally pitch at least one full
     inning or record a crucial out; the scorer weighs runs, earned runs,
     baserunners and the game situation; equally effective relievers → the
     earlier one.
   - (c) A reliever who is ineffective in a brief appearance is not credited
     when a succeeding reliever pitches effectively in helping keep the lead;
     the win goes to the most effective succeeding reliever. Comment:
     generally, under one inning with two or more earned runs scoring —
     even if charged to a previous pitcher.
2. **Ambiguity.** "Most effective", "crucial out", "brief and ineffective",
   "pitches effectively".
3. **Rule.** Three separate steps — eligibility, the brief-and-ineffective
   test, ranking.

   **Step 1 — pitcher of record (eligibility under 9.17(a)).** Find the
   go-ahead run (the run that put the winning team ahead for the last time;
   EDSR-ORDER). The pitcher of record is the winning team's pitcher who most
   recently resolved an event on the mound before it scored (their starter if
   none yet).

   **Step 2 — starter requirement (9.17(b)).** If the pitcher of record is the
   starter: he wins if his outs ≥ **15** when the winning team defended 6 or
   more innings, or ≥ **12** when it defended 5. (In Elements as configured,
   always 15: the winner always defends at least 9. The 12-out branch exists
   so a future season configuration with shorter games stays correct.) If he
   falls short, the win goes to the best-ranked reliever of the winning team
   (Step 4); with one reliever, to him. **No brief-and-ineffective filter
   here** — 9.17(b) doesn't use it.

   **Step 3 — brief and ineffective (9.17(c)), only when the pitcher of
   record is a reliever.** He is brief and ineffective if outs **< 3** and
   runs while pitching **≥ 2** — MLB's own comment, made binding; it counts
   inherited runs because the comment says "even if charged to a previous
   pitcher". If he is, the win goes to the best-ranked **succeeding**
   reliever (first entered after him) who is not brief and ineffective
   himself; if there is none, he keeps it.

   **Step 4 — ranking ("most effective"), following the order of the 9.17(b)
   comment.** Compare candidates on each key in turn; the first difference
   decides:
   1. Pitched at least one full inning (outs ≥ 3) — preferred over shorter
      outings (the comment's "at least one full inning"; the "crucial out"
      alternative is judgment and is left out).
   2. Fewer **runs charged**.
   3. Fewer **runs while pitching** (inherited runs scored count against
      him here — the comment weighs earned runs whoever is charged).
   4. Fewer baserunners allowed (H + BB).
   5. More outs.
   6. Earlier entry (the comment's own tie-breaker).
4. **Why not the v1 formula.** v1 ranked by outs − 3 × runs ("each run cancels
   an inning"). The weight 3 was an invented exchange rate with no MLB basis
   and made long, leaky outings outrank short clean ones (a 9.00 ERA break-even
   point). v2 drops it for the comment's own order of factors.
5. **No conflicting results.** Each key is a number compared the same way for
   every candidate; key 6 is unique per pitcher (a returning pitcher keeps one
   entry, his first). So the ranking is a strict total order: exactly one
   best candidate, every time, from the same records.
6. **Data.** Pitcher per event; scoring order; score after each run; per
   pitcher: outs, runs charged, inherited runs scored, H, BB, entry order,
   starter flag; defensive innings of the winning team.
7. **Where v2 differs from MLB's ordinary presumptive winner** (the pitcher of
   record):

   | Case | Presumptive | EDSR-W | MLB scorer |
   |---|---|---|---|
   | Starter leads after 4.2 IP, 3 relievers | (not eligible) | best-ranked reliever | same, by judgment |
   | Reliever of record: 0.2 IP, 2 inherited runners score; next reliever 2 IP, 0 R | reliever of record | the next reliever | may do the same; rarely applied in practice — EDSR applies it every time |
   | Starter short; relievers 3 IP 1 R vs 1 IP 0 R | — | the 1 IP 0 R reliever (fewer runs charged; both ≥ 1 inning) | might prefer the longer outing |
   | Starter short; one reliever got a single bases-loaded out in the 8th, another 1 IP 0 R | — | the 1 IP reliever (≥ 3 outs preferred) | might credit the "crucial out" |
   | Relievers identical on keys 1–5 | — | the earlier one | same (comment) |

8. **Edge cases.** Complete game → starter. Pitcher of record pinch-hit for
   in the half the lead was taken → still him. Walk-off → the home pitcher who
   pitched last. Lead changes several times → only the final go-ahead run
   counts. Returning pitcher (field and back) → one line, first entry, starter
   status kept. The starter has ≥ 15 outs but isn't the pitcher of record → no
   win for him. Default-attributes pitchers → as usual.
9. **Tests.** Starter at 15 / 14 outs; one reliever; several relievers
   separated by each key 1–6 in turn; reliever of record brief-and-ineffective
   with an effective successor, with only ineffective successors, with none;
   inherited runners scoring (keys 2 vs 3 diverge); the same pitcher
   relieving twice (field and back); a pitcher of record moved to the field
   before the lead is taken; pinch-hit pitcher of record; walk-off; extra
   innings; visitors scoring in the top of the 1st; lead changing hands three
   times; identical records → identical W.

## EDSR-L — Losing pitcher [PROPOSED]

OBR 9.17(d): the pitcher responsible for the run that gives the winning team a
lead it never relinquishes. Rule: the **responsible pitcher of the go-ahead
run's runner** (EDSR-ORDER, EDSR-RESP). Tests: inherited go-ahead runner;
pinch-run go-ahead runner; 9.16(g) transfer; second run of a multi-run play
as the go-ahead run; HR.

## EDSR-SV — Save, including the three-inning save, v2 [APPROVED — Decision 9: option A, `6 × ER ≤ outs`, outs ≥ 9]

1. **Source (OBR 9.19).** A save to a pitcher who (a) finishes a game his team
   wins, (b) is not the winning pitcher, (c) records at least one out, and (d)
   either (1) enters with a lead of no more than three runs and pitches at
   least one inning, (2) enters with the potential tying run on base, at bat
   or on deck, or (3) **pitches effectively** for at least three innings.
2. **Ambiguity.** Only "effectively" in (d)(3).
3. **Objective parts, kept exactly:** (a), (b), (c); (d)(1) lead at entry ≤ 3
   and outs ≥ 3; (d)(2) lead at entry ≤ runners on base + 2 (tying run on
   base, at bat or on deck); (d)(3) outs ≥ 9. The lead can never have been
   tied or lost while he pitched (implied by (b)).
4. **What each measure means for a finisher.** He never leaves, so his **runs
   charged** all scored while he pitched. **Inherited runs scored** are runs
   charged to the pitcher before him. **Outs** are his own.
5. **Effectiveness — options:**

   | Option | Effective if | 9 outs | 12 | 15 | 18 |
   |---|---|---|---|---|---|
   | **A (recommended)** — appearance ERA ≤ 4.50, runs charged only | runs charged × 6 ≤ outs | ≤ 1 | ≤ 2 | ≤ 2 | ≤ 3 |
   | B — appearance ERA ≤ 3.00 (v1), runs charged only | runs charged × 9 ≤ outs | ≤ 1 | ≤ 1 | ≤ 1 | ≤ 2 |
   | C — as A, inherited runs scored also count | (charged + inherited scored) × 6 ≤ outs | | | | |
   | D — lead-based: never let the potential tying run come to bat | lead stays > runners on base + 2 throughout | | | | |

   **Recommendation: A.** "Effective" = pitched no worse than an
   average-quality outing (4.50 ERA, about a league-average run rate) over his
   own innings; inherited runners are excluded because they are charged to the
   previous pitcher and would make his save depend on someone else's
   baserunners. B (v1) is stricter than common practice — a 4-inning, 2-run
   outing would not be effective. D measures game danger rather than his
   pitching and would deny saves for a reliever who pitched well while his
   predecessor's runners were on.
6. **Examples (option A).** 3 IP 1 R → save. 3 IP 2 R → no. 4 IP 2 R → save.
   3 IP 0 R charged with 2 inherited runners scoring → save (C: no). 6 IP 3 R
   → save.
7. **Edge cases.** Walk-off wins have no save. A finisher who tied the game and
   then won → W, not SV. Qualifies under several of (1)–(3) → one save.
   Returning finisher → combined line; the save situation is judged at his
   last entry.
8. **Tests.** Each of (1), (2), (3) on both sides of each threshold (lead 3 vs
   4; tying run on deck vs in the hole; 9 outs with 1 / 2 runs; 12 outs with 2
   / 3 runs); inherited runners scoring; walk-off; finisher who becomes W;
   returning finisher.

## EDSR-HLD — Hold [PROPOSED]

Not an official MLB statistic. A reliever who enters in a save situation
((d)(1) lead ≤ 3, or (d)(2)), records ≥ 1 out, leaves with the lead never tied
or lost while he pitched, is not the finisher, and gets neither W nor SV.
Tests: enter at +3 / +4; tying run on deck; lead lost while pitching; the
finisher never gets HLD.

## EDSR-BSV — Blown save [PROPOSED]

A reliever who enters in a save situation (as HLD) and the lead is tied or
lost while he is pitching, whoever the run is charged to. May coexist with W
or L. Tests: inherited runner ties the game; own runner ties it; BSV then W.

## EDSR-TP — Triple-play attempt with two outs [APPROVED — Decision 11: TBPa 1, TBP 0, no DBP/DBPa; completed TP: TBP 1 + TBPa 1; team DP/TP from the actual event]

The defensive attempt statistic follows the declared attempt only: a
triple-play attempt gives its participants (3B, 2B, 1B) TBPa, and TBP only for
three outs; never DBP/DBPa. The traditional classification is separate —
see EDSR-GIDP and the box-score DP / TP lines.

## EDSR-GIDP — Grounded into double play [APPROVED — Decision 7]

**Source.** MLB: a GIDP is a ground ball that results in a **force double
play** (both putouts force plays) or a **reverse force double play** (the
first out a force, the second on a runner whose force was removed by it).
The official scorer credits no RBI on either. MLB statistical practice
(Elias, via a secondary source) does **not** charge a GIDP when an extra out
follows, i.e. on a triple play.

**Elements facts.** Every Elements double-play and triple-play check is on a
forced runner or the batter-runner at first; there are no tag plays, so no
reverse force double play exists.

| Play (batter's ground ball) | Outs on the play | GIDP | RBI | Box line |
|---|---|---|---|---|
| Standard or 3B-to-1B DP, both out (incl. roll 20) | 2 | **yes** | no | DP 1 |
| … lead out, batter safe | 1 | no | yes if a run scores | — |
| … lead safe, batter out | 1 | no | yes if a run scores | — |
| … roll 1, all safe | 0 | no | yes if a run scores | — |
| Triple-play attempt, two outs (runners to 3B and 2B forced, batter safe) | 2 | **yes** (force double play) | no | DP 1 |
| Triple-play attempt, three outs | 3 | **no** (extra out follows) | — (no run counts) | TP 1 |
| Triple-play attempt, 0 or 1 out | 0–1 | no | yes if a run scores | — |
| Automatic out / RFO, infield-in outcomes, contact play | ≤ 1 | no | per RBI table | — |
| Any non-ground-ball double play (none exist in Elements today) | — | no | — | DP 1 |

Approved as tabled (Decision 7). Precise criteria: `IMPLEMENTATION_PLAN.md` §5.3 — final chart result GB, a declared DP/TP attempt, exactly two outs from its checks.

## EDSR-RBI — Runs batted in [APPROVED — Decision 10; full table `IMPLEMENTATION_PLAN.md` §5.2]

**Source.** OBR 9.04: RBI for each run that scores because of the batter's
safe hit, sacrifice bunt, sacrifice fly, infield out or fielder's choice
(unless 9.04(b) applies), and for a run forced home by a walk or other award;
none when the batter grounds into a force or reverse force double play; no
RBI on a run scoring because of a misplay (Elements has none).

| Run scores … | RBI |
|---|---|
| On a hit, including runners' extra bases on that hit's extra-base decision | yes |
| The batter's own HR | yes |
| Forced home by a walk or intentional walk (bases loaded) | yes |
| (Non-forced runs on a walk can't occur: walks advance forced runners only — Decision 1) | — |
| On a sacrifice fly (incl. when a trailing runner is then thrown out) | yes |
| On a successful squeeze (16–19 with < 2 out, 20) | yes |
| On a fielder's choice or infield out that is not a GIDP: RFO, failed DP attempt, triple-play attempt with 0–1 out, contact play incl. "all safe", runner from 3B scoring on a GB out | yes |
| During a GIDP (force double play) | no |
| On a steal (incl. steal of home, the 1B+ steal) or squeeze 1–7 | no |
| After the winning run in a walk-off (doesn't count) | — |

## EDSR-G — Pitching appearance, v2 [APPROVED — Decision 6]

1. **Source.** MLB credits a game pitched to every pitcher who enters the game
   as a pitcher, whether or not he faces a batter (a reliever who ends an
   inning with a pickoff has 1 G, 0 BF, 0.1 IP). The three-batter minimum
   (5.10(g)) is waived when the half-inning ends.
2. **Ambiguity.** The engine records an appearance only when a PA is
   completed against the pitcher. That is the confirmed rest rule (ruling 8:
   "the CS-only reliever not getting appearance credit is accurate"), but it
   is not a statistics rule.
3. **Rule — five separate records:**

   | Record | Definition |
   |---|---|
   | Entry / removal | Logged when he takes or leaves the mound (pitching change, double switch, position swap, return) |
   | **Pitching G** | 1 when he takes the mound at least once in the game (the starter, or any entry). Every entry is followed by at least one event on his watch — the mound lock prevents an immediate change, and no game can end without an event |
   | GS | His side's first pitcher |
   | BF | Completed PAs against him (EDSR-PA) |
   | Outs / IP | Every out recorded while he pitches, including caught stealing and outs on throws |
   | Rest incurred | Unchanged: ruling 8 — only with a completed PA against him (rest proposal §3) |

4. **Example.** A reliever enters with two out and the runner is caught
   stealing for the third out; he's replaced next inning: G 1, GS 0, BF 0,
   IP 0.1, no rest incurred.
5. **Tests.** That case; a returning pitcher (one G); a starter (G 1, GS 1).

## EDSR-RESP — Responsibility when a fielder's choice retires several runners [PROPOSED]

OBR 9.16(g). If a play retires one or more runners left by preceding pitchers
and the batter reaches, the batter takes the responsibility of the **most
advanced** such retired runner; otherwise the current pitcher's. Tests: one
inherited runner forced; two forced from different pitchers; own runner
forced.

## EDSR-SB — Multiple steal with the target thrown out [PROPOSED]

OBR 9.07: when one runner of a double or triple steal is thrown out, no other
runner gets an SB. Rule: the others advance (Rulebook) without SB; catcher CS
1, no SBa for them. Target safe → all SB, SBa each. Target out for the third
out → others don't advance (Rulebook). Tests: all three.

## EDSR-LOB — Team left on base [PROPOSED]

Runners on base when each half ends: after the third-out play; in a walk-off,
those still on base when the game ends (the winning runner excluded).

## EDSR-PA — Whose plate appearance [PROPOSED]

The PA and BF belong to the batter and pitcher at the roll that completes it
(swing, intentional walk, bunt or squeeze roll). A pitching change or pinch
hitter between a steal and the pitch → the new player gets the whole PA.

## EDSR-PRE — Pre-pitch eligibility after rolls in the same at-bat [APPROVED — Decision 3; scope U6, reset U7]

Steal rolls never block a later intentional walk or pinch hitter; a pitch,
swing, bunt or squeeze roll blocks both for the rest of that PA (D9). See
`RULES_AUDIT.md` G6.
