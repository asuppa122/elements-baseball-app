# Rules audit — subjective, undefined and inconsistent rules — v3 (2026-11-01)

> **Status 2026-11-01 (implementation):** D1, D2, D3, D7, D8, D9 (now the full post-steal lock, audit decision 5), D10, II and IN-PU are **fixed locally** under rules v2, each with permanent scenarios (`rulesV2ScenarioHarness.ts`, `groundBallScenarioHarness.ts`). D4 (server rest) is fixed in the local, unapplied migration. G6 is superseded by audit decision 5. U1–U15 are resolved: `IMPLEMENTATION_PLAN.md` §0.

Status: **audit and proposals. Nothing changed in code or data.** v3 records
Anthony's 12 decisions of 2026-11-01; open rulings are numbered U1–U15 in
`IMPLEMENTATION_PLAN.md` §3, which also holds the Rulebook amendment wording
(A1–A17). Scope: the
Elements Rulebook (`src/data/rulesData.ts`, all 380 rule texts), the engine
(`src/gameplay/`), the server writer
(`supabase/migrations/20261031_gameplay_one_active_game.sql`), and the
recorded rulings in `GAMEPLAY_REFERENCE_NOTES.md` and `CHANGELOG.md`.

**Rulebook references** use the website's section number and sub-heading
(e.g. "Rulebook §7 · Managerial Running Decisions"). The Rulebook's own
cross-references use the Google Doc numbering ("Section IX Player Fatigue &
Effects subpart B"), which is one higher than the website's §8 for that
section; both are given where known.

Every engine finding was confirmed by reading the code. Per the standing
regression rule, each fix starts with a scenario that fails before it.

Labels: **[APPROVED]**, **[PROPOSED]**, **[DISCREPANCY]**,
**[RULING NEEDED]**, **[RESOLVED]**.

---

## 1. Statistical scoring situations

| ID | Situation | Reference | Resolution | Status |
|---|---|---|---|---|
| S1 | Walk-off: game end, runs counted, hit credit | OBR 7.01(g), 5.08, 9.06(f)–(g) | EDSR-WO | [APPROVED] (HR and "natural course" adaptations [PROPOSED]) |
| S2 | Several relievers, starter short: "most effective" | OBR 9.17(b) + comment | EDSR-W v2 | [APPROVED approach — Decision 8] |
| S3 | "Brief and ineffective" reliever | OBR 9.17(c) + comment | EDSR-W v2 | [APPROVED approach — Decision 8] |
| S4 | Losing pitcher | OBR 9.17(d) | EDSR-L | [PROPOSED] |
| S5 | Three-inning save "effectively" | OBR 9.19(d)(3) | EDSR-SV v2 option A | [APPROVED — Decision 9] |
| S6 | Holds, blown saves | not official MLB | EDSR-HLD, EDSR-BSV | [PROPOSED] |
| S7 | Two-out triple-play attempt: defensive attempt credit | Anthony's TBP/TBPa | TBPa only, no DBPa | [APPROVED — Decision 11] |
| S8 | GIDP | MLB force / reverse-force double play | EDSR-GIDP table | [APPROVED — Decision 7] |
| S9 | RBI | OBR 9.04 | EDSR-RBI table | [APPROVED — Decision 10] |
| S10 | Hit vs error, "ordinary effort" | OBR 9.05, 9.12 | N/A — no errors; a hit ⇔ the final converted result is a hit | [APPROVED] |
| S11 | Bunt: SH vs hit | OBR 9.08(a); Rulebook §7 · Bunting (wheel play 1–15) | SH (< 2 out), FC (2 out) | [APPROVED] |
| S12 | Hit value when runners are thrown at | OBR 9.06 | The batter keeps the chart's hit (Elements never advances the batter on a throw) | [APPROVED] |
| S13 | Other runners' SB when a multiple-steal target is out | OBR 9.07 | EDSR-SB | [PROPOSED] |
| S14 | Defensive indifference | OBR 9.07(g) | Never arises | [APPROVED] (by absence) |
| S15 | PA / BF after a mid-PA change | OBR 9.15, 9.16(h) | EDSR-PA | [PROPOSED] |
| S16 | 9.16(g) with several retired runners | OBR 9.16(g) | EDSR-RESP | [PROPOSED] |
| S17 | Pitching G without a completed PA | MLB appearance practice | EDSR-G v2 (G separate from BF, outs, rest) | [APPROVED — Decision 6] |
| S18 | Order of runs on one play | — | EDSR-ORDER | [PROPOSED] |
| S19 | Team LOB in a walk-off | — | EDSR-LOB | [PROPOSED] |
| S20 | Squeeze 1–7 out: classification | Rulebook §7 · Bunting: "automatically out on an unsuccessful stolen base attempt of home" | **CS** (runner), catcher CS | [APPROVED] (the Rulebook calls it a steal attempt) |
| S21 | Earned vs unearned | OBR 9.16 | All runs earned | [APPROVED] |
| S22 | Scorer review / provisional decisions | v3 | Withdrawn | [APPROVED] |

## 2. Gameplay rules

### G4 → APPROVED — Walk-off games

Anthony, 2026-11-01: follow OBR 7.01(g), 5.08, 9.06(f)–(g) (EDSR-WO). Engine
work: D2 and D7 below.

### G3 → APPROVED IN PRINCIPLE — Run on a play ending with the third out (OBR 5.08(a))

**Rule:** no run scores on a play whose third out is the batter-runner put out
before reaching first, or a force out. A run **does** count when a trailing
runner makes a non-force third out after a preceding runner legally scored.
No blanket "the third out cancels every run".

**Engine audit — every path where a run and an out happen on one play:**

| Path | Third-out type | Engine | Correct? |
|---|---|---|---|
| Ground balls (`gbFinish`, core GB paths) | force or batter-runner | runs only if outs < 3; a GB with two out ends the inning with no run | ✓ |
| Extra-base / tag-up throw, trailing runner out for the 3rd out | non-force (Rulebook: lead attempt completes first) | lead run counts | ✓ (Rulebook §7 · Managerial Running Decisions) |
| Extra-base / tag-up throw, lead runner out for the 3rd out | — | trailing attempts stop | ✓ |
| Multiple steal, target out for the 3rd out | — | no other runner advances (Rulebook: "unless the runner being thrown at makes the third out") | ✓ — an explicit Elements rule, applied even where MLB timing might allow a run |
| Sacrifice bunt | — | never scores a run (bases-loaded bunts aren't offered; R3 holds with 1B + 3B) | ✓ |
| Squeeze 8–15, two out | runner out at home | no run | ✓ |
| **Squeeze 16–19, two out** | **batter-runner out at 1B** | **scores the run, then the out** | **✗ → fix (no run)** |
| Squeeze 20 | no out | run | ✓ |

So only squeeze 16–19 with two out violates 5.08(a).

### D6 → APPROVED — Walks advance forced runners only (Decision 1)

**Ruling (Anthony, 2026-11-01):** keep the engine. Chart walks and
intentional walks both award 1B and advance forced runners only; the
v1.3.73 correction is an intentional Elements clarification. The Rulebook
line is amended (plan A1). Not a discrepancy any more. Analysis that led to
the ruling, kept for history:

1. **Rulebook wording.**
   - Chart walk — Rulebook §7 · Managerial Running Decisions: "When a hitter
     reaches base via a BB, 1B, 1B+, 2B, 3B, or HR swing result, all existing
     runners automatically advance a specific amount of bases as outlined
     below." / "BB, 1B, & 1B+ swing results = All existing runners
     automatically advance 1 base."
   - Intentional walk — Rulebook §7 · Managerial Defensive Decisions: "the
     current hitter is automatically awarded 1B with all other **forced**
     runners advancing 1 base."
2. **Engine.** `coreGame.ts` `automaticHit` (BB): only forced runners
   advance; a runner on 2B or 3B with 1B open stays.
3. **The Rulebook does distinguish them:** chart walk = every runner +1;
   intentional walk = forced runners only. The engine treats both as forced
   only.
4. **History — a documented later change exists, but its source isn't
   preserved.** Before 2026-08-24 the engine followed the Rulebook (BB grouped
   with 1B). It was changed in commit 56e0cde (2026-08-24), listed as
   correction #7 of the **v1.3.73 "First Manual Playthrough Corrections"**
   (`CHANGELOG.md`: "Corrected BB force-only advancement") and verified in
   v1.3.74 (`FIRST_PLAYTHROUGH_FIX_VERIFICATION.md` #7: "BB advancement: only
   forced runners advance; runners without a continuous force hold"). The
   instruction that produced the correction list isn't in the repository or in
   the available session history, and the Rulebook text was never amended.
   **Only Anthony can say whether it was his ruling.**
5. **Effects of following the Rulebook text:**
   - **Runs:** a runner on 3B with 1B open scores on a walk; a runner on 2B
     with 1B open goes to 3B (more runs overall).
   - **RBI:** forced-in runs get an RBI as now; a non-forced run on a walk
     needs a rule — proposed RBI (EDSR-RBI), since the advance is the walk's
     prescribed result.
   - **Inherited runners:** such a run is charged to the runner's responsible
     pitcher; an inherited runner scoring ends the Shutout Bonus (Option B).
   - **Fatigue:** each run charged adds to that pitcher's earned-run ladder
     (after phase F; today, to whoever is pitching).
   - **Walk-offs:** a runner on 3B with 1B open would end the game on a walk.
   - Showdown statistics unchanged (a walk is a walk).
6. **Recommendation.** If Anthony **did** make the v1.3.73 correction: keep
   the engine, record it as Approved Digital Gameplay Behavior, and amend the
   Rulebook line to "BB swing results = the hitter is awarded 1B with all
   forced runners advancing 1 base; 1B & 1B+ = all existing runners advance 1
   base." If he **didn't**: follow the Rulebook text (every runner +1 on a
   chart walk, intentional walks unchanged) as a gameplay correction with
   regression scenarios. Either way the decision is his.

### G5 → APPROVED (Option B, Decision 2) — Infield In whenever runners are on with < 2 out

**Correction to v2:** the Rulebook **does** define a ground-ball outcome for
1B only and 1B + 2B ("When there is a runner on 1B or runners on both 1B & 2B
only & the swing is a GB result, the lead runner is automatically out with
all other runners advancing 1 base & the runner heading to 1B is safe at 1B
on a fielder's choice result" — the last item under Infield In). Every base
state is therefore defined. Full state matrix, interactions and the open
rulings U1 (1B + 3B "unless forced"), U2 (DP toward home), U3 (state changes
after declaration) and U5 (approve the new-state mechanics) are in
`IMPLEMENTATION_PLAN.md` §3. Engine change required (availability). The v2
analysis below is superseded:

**The contradiction.**

| | Text / behaviour |
|---|---|
| Rulebook §7 · Managerial Defensive Decisions | "When there are **runners on base** with less than 2 out, the defensive GM may opt to declare 'infield-in' prior to any die rolls in an at bat" |
| Ground-ball outcomes it defines | bases loaded (lead runner out at home); "a runner on 2B, a runner on 3B, runners on both 2B & 3B, or runners on both 1B & 3B" (runners hold unless forced; batter out) |
| Not defined | runner on 1B only; runners on 1B & 2B |
| Engine | offers Infield In only with a **runner on 3B** (3B, 1B+3B, 2B+3B, loaded) — so 2B-only (defined) and 1B / 1B+2B (undefined) are unavailable |
| Reference resolver `resolveAutoOut` (not live) | invents outcomes for 1B-only and 1B+2B |

**Proposed amended wording** (option a, matching the engine):

> When there is a runner on 3B with less than 2 out, the defensive GM may opt
> to declare "infield-in" prior to any die rolls in an at bat, which results
> in the following. … When there is a runner on 3B, runners on both 2B & 3B,
> or runners on both 1B & 3B, & the swing is a GB result, all existing runners
> "hold" at their base unless forced to advance 1 base, & the runner heading
> to 1B is out on a GB result.

(Only the opening condition and the removal of "a runner on 2B," change.)

Option b — keep the written availability and define 1B-only and 1B+2B — would
need new rules and an engine change. Recommendation: option a.

### G6 → APPROVED (Option A, Decision 3) — Rolls during an at-bat

Steal rolls don't block a later intentional walk or pinch hitter; pitch,
swing, bunt and squeeze rolls do, for the rest of that PA. D9 is an approved
fix. Open: U6 (does the same separation apply to pinch runners, defensive
substitutions, pitching changes, Infield In and sac bunts?) and U7 (reset when
squeeze 1–7 ends the inning). v2 analysis below:

**Anthony's preference:** a steal roll is a baserunning action, not a chart or
swing roll; by itself it doesn't block a later intentional walk or pinch
hitter in the same unfinished plate appearance. All other eligibility rules
remain.

**Rulebook wording.**
- Intentional walk (§7 · Managerial Defensive Decisions): "so long as **no die
  rolls have been made for the current at bat**."
- Pinch hitter / runner (§7 · Managerial Running Decisions): "When **no die
  rolls have been completed against the current hitter** …"

**Conflicts found.**
1. The intentional-walk wording, read literally, counts *any* roll during the
   at-bat, including a steal roll — it conflicts with the preference. The
   pinch-hitter wording ("against the current hitter") is compatible: a steal
   roll is against the runner.
2. **Squeeze 1–7.** The Rulebook calls the squeeze roll "a standard die roll
   for the swing". On 1–7 the runner is out and the at-bat continues. Under
   the preference, that roll *is* a swing roll, so it should block a later
   intentional walk or pinch hitter — but the engine offers both after it.
3. **Engine.** `getPrePitchActions` offers the intentional walk and pinch
   hitter at every pre-pitch point, including after any roll in the same PA.
   Other eligibility checks (bench availability, the game's first pitch, the
   three-batter mound lock) are in place. A pitch roll is always followed by
   the swing that ends the PA, so no pre-pitch window ever follows a pitch
   roll.

**Proposed rule:** an intentional walk or pinch hitter is available unless a
pitch, swing, bunt or squeeze roll has already been made in the current at-bat;
steal rolls (natural steal, second steal of home) don't count. **Engine change
needed:** block both after squeeze 1–7.

**Proposed amended wording:** intentional walk — "so long as no pitch, swing,
bunt or squeeze roll has been made for the current at bat (stolen base rolls
do not count)"; pinch hitter / runner — "When no pitch, swing, bunt or squeeze
roll has been completed against the current hitter …".

### R6 → APPROVED (Option A, Decision 4) — Distance fatigue at the card-IP out

Confirmed: the first −2 comes at the out that completes card IP (3 IP → 9th
out, 5 → 15th, 6 → 18th, 6.67 → 20th, 7 → 21st). Already implemented
(f025cd2) — **[APPROVED · IMPLEMENTED]**; Rulebook text and examples amended
(plan A7–A13). U9 confirms the same counting for the Shutout Bonus −1. New
engine defect D10 (Shutout Bonus recomputed from scratch) found while
reviewing the full progression — plan §6.1. v2 record below:

**Anthony's instruction (2026-10-30, after the first live game):**

> "Apply the Over IP fatigue penalty immediately when the pitcher reaches the
> applicable threshold. Since innings are measured in outs, 6.67 IP represents
> 20 recorded outs. The penalty must activate immediately after the 20th out
> is recorded, not after the 21st." Acceptance: "A pitcher with a 6.67 IP
> limit receives the appropriate fatigue penalty immediately upon recording
> their 20th out."

**The Rulebook** (§8 · In-Game Distance Fatigue Effects = Google Doc IX-C):
"For each out that all pitchers record pitching **beyond** their card IP
length, −2 …", example "0.2 IP past their card IP length … −4".

**What was done.** Implemented (commit f025cd2) so the first −2 comes at the
out that *reaches* card IP; the Rulebook example becomes −6. Recorded in
`GAMEPLAY_REFERENCE_NOTES.md` ruling 1 as a **Proposed Digital Gameplay
Update**, because it changes what the Rulebook text and example say.

**Was it approved?** Anthony explicitly requested the behaviour, so it is his
instruction. But it was never categorised as approved, and the Rulebook text
and example were never amended. It also sits beside ruling 7 ("relief distance
rest stays strictly *beyond* card IP — reaching it exactly does not count",
Official Rule, confirmed), which counts "beyond" the other way.

**To confirm:** (a) keep it — mark it Approved Digital Gameplay Behavior and
amend the Rulebook line to "for each out that all pitchers record at or beyond
their card IP length" with the example becoming −6; or (b) revert to the
written rule.

### R2–R5 — Rest modifiers

See `REST_SERVER_CORRECTION_PROPOSAL.md` (exact Rulebook wording, proposed
definitions, efficiency-bonus demonstrations).

### R1 — Shutout Bonus ended by an inherited runner [APPROVED]

Option B, documented as an explicit Elements digital rule clarification.

### L1 — League administration [OUT OF SCOPE]

Commissioner penalties, forfeits, playoff format, ad-hoc rules and "players
should agree" on rosters are discretionary by design and not part of automated
gameplay. Roster size and points cap come from the frozen season configuration
(approved digital behaviour).

No other Rulebook rule text contains subjective wording.

## 3. Engine discrepancy list

| ID | Discrepancy | Rule it violates | Fix | Status |
|---|---|---|---|---|
| D1 | Failed squeeze (1–7) for the third out marks a PA and advances the order (`SQUEEZE_BUNT_ROLL` → `finishPlateAppearance`) | Approved: no PA, same batter leads off; runner CS | Use `finishWithoutPlateAppearance` | [APPROVED] fix |
| D2 | Walk-off steal of home doesn't end the game; the PA resumes | EDSR-WO | End the game at the winning run, no PA | [APPROVED] fix |
| **D7** | **Walk-offs count every run on the play.** The walk-off check runs only after the whole play: a tied bases-loaded double scores 2–3, and the extra-base decision is still offered after the winning run | EDSR-WO | Check after every run in scoring order; stop at the winning run (except HR); skip later decisions | [APPROVED] fix (needs per-runner scoring from A2) |
| D8 | Squeeze 16–19 with two out scores the run although the batter-runner is the third out | OBR 5.08(a) (G3) | No run | [APPROVED] fix (Decision 12) |
| D3 | Two ground-ball implementations: the reference resolvers in `groundBallEngine.ts` (used by the GB harness, the boundary harness and the rule demos) disagree with live play — the triple play drops or duplicates the runner on 3B with the bases loaded; `gbLegalChoices` lacks the triple play's 2B ≥ +4 / 3B ≥ +2 fielding requirement and the combination cycle; `resolveAutoOut`'s Infield In 1B-only / 1B+2B branches follow the Rulebook's outcome in intent but **record the out while keeping every runner (phantom out)** — v2 wrongly said they invent outcomes; its contact-play availability omits the 2B-only state | One authoritative implementation | §4 below | [APPROVED] (Decision 12) |
| D4 | Server rest writer applies none of the three pitcher rest modifiers; no live code applies them | Rulebook §8 (IX-B / IX-C) | Rest proposal | [BLOCKER] |
| D6 | Chart walks advance only forced runners | — | Rulebook amended instead (A1) | [RESOLVED] — engine correct (Decision 1) |
| D9 | Intentional walk and pinch hitter offered after squeeze 1–7 in the same at-bat | Decision 3 | Block after a pitch / swing / bunt / squeeze roll (scope U6, reset U7) | [APPROVED] fix |
| **D10** | **Shutout Bonus recomputed from scratch:** for card IP < 5, accrued −2s are refunded at out 15 (card IP 3, Control 6: −5 at out 14 → 0 at out 15); a pitcher at negative Control when the bonus starts goes back up | Rulebook §8 IX-C ("going forward"; "does not see any reduction") | Freeze accrued reductions at bonus start/end (plan §6.1) | [DISCREPANCY] — rule is clear; fix in S1 |
| II | Infield In offered only with a runner on 3B | Decision 2 | Offer with any runner, < 2 out (U1–U5) | [APPROVED] change |
| IN-PU | Infield In PU/FB → 1B applies even after a steal/CS leaves 2 outs or empty bases | undefined (U3) | per U3 | [UNRESOLVED] |
| — | Pitcher with no completed PA has no appearance | Confirmed rest rule (ruling 8) — **not a discrepancy for rest**; statistics G is handled separately by EDSR-G | — | [RESOLVED] (was D5) |

## 4. One authoritative ground-ball implementation (D3) — proposal, not started

1. **Write the matrix first, against the live engine.** Drive the public
   decision API (as `scenarioHarness.ts` already does): every base state (8)
   × outs (0, 1) × every legal choice (automatic out, standard DP, 3B-to-1B DP,
   triple play, Infield In hold, contact play) × every roll band (1, 20, out,
   safe for each check). Expected results are written from the Rulebook tables
   by hand, never computed by the code under test. Triple play alone: R1+R2
   and loaded × 0 / 1 / 2 / 3 outs × roll 1 and 20 on checks 1 and 2.
2. **Make the live resolvers the shared module.** Move the live pure functions
   (`gbSingularResolve`, `gbStandardFinalize`, `gbThreeToOneFinalize`,
   `gbTripleFinalize`, `gbAllSafeAdvance`, `gbContactResolve`,
   `gbRunner2Resolve`, and the legal-choice logic from `GROUND_BALL_RESOLUTION`)
   into `groundBallEngine.ts`, replacing the reference versions, and have
   `decisionEngine.ts` call them. One implementation, same module name.
3. **Port the users.** `groundBallScenarioHarness.ts`,
   `gameBoundaryScenarioHarness.ts` and `gameplayDemoScenarios.ts` call the
   shared module or the decision API. Existing scenario IDs keep their IDs;
   any that encoded the reference's behaviour (none expected for live-correct
   cases) are listed and corrected deliberately.
4. **Delete the reference resolvers;** knip and lint confirm nothing else uses
   them. The verification page then reports live behaviour only.
5. **Guard:** a test fails if any ground-ball outcome is produced outside the
   shared module.

No gameplay behaviour changes in live play (it is already correct); only the
tests, demos and verification page change.
