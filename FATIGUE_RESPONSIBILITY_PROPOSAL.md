# Proposal: charge runs to the responsible pitcher in the fatigue rules

> **Status 2026-11-01 (implementation):** **implemented locally** for games created under rules v2 (`runScoring.ts`: runs charged to the runner's responsible pitcher; inherited runs end the Shutout Bonus Option-B style; `fatigueEngine.ts` `distanceControlPenaltyV2` walks the penalty out by out so nothing is refunded). Games created before keep v1 (requirement 7). The per-runner bookkeeping lives in the engine (S1c), not in the play records.

Status: **rules interpretation APPROVED (Anthony, 2026-11-01); Decision 4
(same day) re-confirmed Option B and the card-IP-out distance counting.
Implementation is part of the consolidated scope in `IMPLEMENTATION_PLAN.md`
(phase S1c–d), which awaits one approval. Not implemented.** A gameplay
rules correction, separate from the statistics work (`STATS_SPEC.md`), built
after phase A2 and before any official launch.

## 0. Anthony's implementation requirements, and how this proposal meets them

| # | Requirement | Where |
|---|---|---|
| 1 | Developed separately from the statistical UI | §8 — its own change, phase F |
| 2 | Reuses the structured responsible-pitcher bookkeeping | §5.1–5.3 — the A2 bookkeeping, already tested by then |
| 3 | Identifies all affected run-scoring paths | §2.1 — all 15 call sites |
| 4 | Preserves unrelated dice and chart resolution | §5.8 |
| 5 | Preserves the existing rest architecture | §5.8 (rest is a separate proposal) |
| 6 | Regression tests for inherited runners and returning pitchers | §7 |
| 7 | No mid-game behaviour change for games in progress | §5.6 — rules version frozen at game creation |
| 8 | Explicit approval before implementation | this status |

Decision being implemented (Anthony, 2026-11-01): the earned-run fatigue
ladder and the Shutout Bonus's "allows an earned run" −2 use **runs charged
to the responsible pitcher**, not runs that score while a pitcher is on the
mound. The Shutout Bonus keeps its separate inherited-runner condition (ended
per Option B, §6.1). The ordinary distance penalty (−2 per out beyond card
IP) never depended on runs and is unchanged. Statistics use runs
charged regardless of this proposal.

---

## 1. What the Rulebook says

- **Earned-run ladder:** "Pitchers are immediately subject to the following
  fatigue effects after allowing a specific amount of earned runs … 4 or more
  earned runs = −1 … 7 = −3 … 8 = −6 … 9 = −10 … 10 or more = −15 from their
  Control score for the remainder of the current game."
- **Distance:** "For each out that all pitchers record pitching beyond their
  card IP length, −2 is subtracted from their current Control score in the
  current game until the pitcher is removed." Runs play no part in it.
- **Earned run under the Shutout Bonus:** "If the current pitcher is over
  their card IP length & then allows an earned run, immediately subtract −2
  from the current Control of the pitcher & then subtract −2 for each
  subsequent out recorded until the pitcher is removed from the game." It sits
  in the Shutout Bonus subsection, and its example is a bonus holder giving up
  a HR; the engine applies it only to a pitcher holding the bonus (the
  "broken" branch). For everyone else over IP, the ordinary −2 per out
  already applies.
- **Shutout Bonus:** "For pitchers who have recorded at least 15 outs, allowed
  0 earned runs & 0 inherited runners to score in the current game, they
  receive a 'Shutout Bonus' & only −1 is subtracted from their Control score
  for each out … beyond their card IP length …"

The Shutout Bonus naming "0 earned runs" *and* "0 inherited runners to score"
separately only makes sense if an inherited runner scoring is not one of the
reliever's earned runs — the traditional meaning, which Anthony has now
confirmed.

## 2. Every place the engine touches these numbers today

| Location | What it does now |
|---|---|
| `types.ts` `GameState.pitcherRunsAllowed` | One count per pitcher instance. |
| `coreGame.ts` `scoreRunner(state, side, count)` (8 call sites: hits, walks, GB branches) | Adds `count` runs to the **pitcher currently on the mound**; if his count was 0, the Shutout Bonus was in effect (≥ 15 outs, at/over card IP) and it is not yet broken, records `pitcherShutoutBonusBrokenAtOuts` = his outs now. Doesn't know *which* runners scored. |
| `decisionEngine.ts` `score(state, side, n)` (9 call sites: tag-ups, extra bases, steals of home, squeeze, sac bunts, ground-ball decisions) | Same as `scoreRunner`, same pitcher choice, same break logic. |
| `groundBallEngine.ts` (`dpFinal` and siblings) | Return a run **count** (`runs++`), no runner identity; the decision engine passes it to `score`. |
| `pitcherMound.ts` `changePitcher` | Sets a new pitcher's count to 0; **a returning pitcher keeps his count** (returns after a position swap are supported). |
| `engine.ts` `pitcherFatigueInputFor` | Builds the fatigue input: `earnedRunsAllowed = pitcherRunsAllowed[pitcher]`; `shutoutBonusBrokenAtOuts` from state; **never sets `inheritedRunnersScored`** (so it is always 0). |
| `fatigueEngine.ts` `performanceControlPenalty(earnedRuns)` | The ladder: 4→1, 7→3, 8→6, 9→10, 10+→15. |
| `fatigueEngine.ts` `shutoutBonusApplies` | Bonus if ≥ 15 outs **and** `earnedRunsAllowed = 0` **and** `inheritedRunnersScored = 0` **and** not broken, and at/over card IP. |
| `fatigueEngine.ts` `distanceControlPenalty` | Over-IP: −2 per out at/beyond card IP; bonus branch −1 per out (never below 0 by itself); broken branch keeps the accrued −1s, then −2 immediately, then −2 per later out. |
| `fatigueEngine.ts` `effectivePitcherControl` | Printed − rest − ladder − distance, floored at −5. |
| `presentation/inGameFatigueDisplay.ts` | Shows the causes (PERFORMANCE, SHUTOUT_BONUS, DISTANCE) from the same input. |
| `pregameFatigueDisplay.ts` | `earnedRunsAllowed: 0` before a game — unaffected. |
| `postGameSummary.ts` / `PostGameBoard.tsx` | Shows `pitcherRunsAllowed` as each pitcher's R. |
| `fatigueEngine.ts` `postGameRestGames` (negative-Control extra rest) | Reference implementation only; the live rest writer (SQL) uses appearances, not runs or Control — **unaffected**. |
| Harnesses (`fatigueScenarioHarness`, `scenarioHarness`, `gameplayDemoScenarios`, `rulebookCoverage`) | Feed or assert `earnedRunsAllowed` / `pitcherRunsAllowed` directly. |

### 2.1 Every run-scoring path (all must pass the scoring runners, not a count)

`coreGame.ts` `scoreRunner` — 7 call sites: chart walk (bases loaded), 1B /
1B+ (runner from 3B), 2B, 3B, HR, and the core ground-ball paths.

`decisionEngine.ts` `score` — 8 call sites:

1. forced advance on a walk-type award (intentional walk, bases loaded);
2. `advanceForcedOne` (sacrifice bunts, squeeze 8–15 / 20 forced runners);
3. `moveSuccessfulAttempts` (extra bases and tag-ups);
4. `moveSteals` (steals of home);
5. `gbFinish` (every ground-ball resolution: RFO, double plays, triple play,
   contact play, all-safe);
6. second steal of home;
7. squeeze 16–19;
8. squeeze 20.

`groundBallEngine.ts` reference resolvers return a run count only; they feed
harnesses, not live play (and disagree with live play on the triple play —
`RULES_AUDIT.md` D3), and are aligned or retired in the same effort.

**In short:** today every run that scores while a pitcher is pitching counts
as one of his earned runs — including inherited runners — and the separate
inherited-runner input is never used, because those runs are already in his
count.

## 3. Today vs the Rulebook (as now ruled)

| Rule | Today | Corrected |
|---|---|---|
| ER ladder | counts inherited runners against the reliever | counts only runs charged to him |
| Shutout Bonus holder, own (charged) run | broken: accrued −1s kept, −2 now, −2 per out | unchanged |
| Shutout Bonus holder, inherited runner scores | broken as if earned: −2 now, then −2 per out (and the run also counts on his ladder) | **ended (Option B):** accrued −1s kept, no −2 now, −2 per later out; nothing on his ladder |
| Ordinary distance (no bonus) | −2 per out beyond card IP | unchanged — runs never affect it |
| Runs charged to a pitcher after he leaves (his runners scoring off the reliever) | not counted to him | counted to him — **matters only if he returns to the mound** |

## 4. Scenarios where the game would play differently

1. **Reliever enters with runners on; an inherited runner scores.** Today the
   reliever's count goes up; corrected it doesn't. If that run is what takes
   him to 4 (or 7, 8, 9, 10), today he loses Control for the rest of the game;
   corrected he doesn't. Subsequent pitch rolls (pitch + Control vs On Base)
   change, and so can every later result.
2. **Reliever over his card IP, no Shutout Bonus, when an inherited runner
   scores.** Distance is unchanged (−2 per out either way); only the ladder
   differs, as in 1.
3. **Reliever with the Shutout Bonus active when an inherited runner scores.**
   The bonus ends (Rulebook: "0 inherited runners to score"), but no earned run
   was charged, so the Rulebook's "allows an earned run → immediately −2"
   doesn't literally apply. **Ruled: Option B (§6.1)** — the bonus ends, the
   accrued effects stay, no immediate −2, ordinary over-IP rules from then on.
4. **A pitcher swapped to the field and later returned to the mound** whose
   runners scored while he was off it: today those runs aren't his;
   corrected they are, and count toward his ladder on return (**ruled yes,
   §6.2**).
5. **Pinch runner for a runner a previous pitcher allowed**, and **a batter who
   reaches on a fielder's choice that retires an inherited runner** (OBR
   9.16(g)): today charged to whoever is pitching when they score; corrected
   to the original pitcher.

Nothing changes for a pitcher who never inherits runners and never returns:
his own runners scoring while he pitches are charged to him in both versions.
Most games will be identical; the difference appears only around mid-inning
pitching changes and returns.

## 5. Proposed code changes (not made)

1. **State (bookkeeping, no new rule):** each base runner carries
   `responsiblePitcher` (the pitcher instance key he reached against).
   `GameState` gains `pitcherRunsCharged` and `pitcherInheritedRunsScored`
   per pitcher instance. `pitcherRunsAllowed` keeps its meaning ("runs while
   pitching") for history and the Elements stats view.
2. **Setting responsibility:** every place a batter becomes a runner stamps
   the current pitcher; a pinch runner copies the replaced runner's; a batter
   reaching on a fielder's choice that retires a runner left by a preceding
   pitcher takes that runner's (9.16(g)).
3. **Scoring:** `scoreRunner` and `score` take the scoring runners (not a
   count), all 17 call sites updated, and the ground-ball engine returns who
   scored, not how many. Each run: `pitcherRunsCharged[responsible] += 1`;
   if responsible ≠ current pitcher, `pitcherInheritedRunsScored[current] +=
   1`; `pitcherRunsAllowed[current] += 1` as today.
4. **Shutout Bonus break:** a charged run to the current pitcher while the
   bonus applies → the existing broken branch (accrued −1s, −2 now, −2 per
   out). An inherited runner scoring while the bonus applies → Option B: a new
   "ended" state recorded at that out (`pitcherShutoutBonusEndedAtOuts`); the
   −1s already accrued stay, no immediate −2, and each later out beyond card
   IP costs the ordinary −2. With the bonus gone, a later charged run affects
   only his ladder, like any pitcher without the bonus.
5. **Fatigue input:** `earnedRunsAllowed = pitcherRunsCharged`,
   `inheritedRunnersScored = pitcherInheritedRunsScored` — the existing,
   so-far-unused input.
6. **Games already in progress when this ships:** the fatigue rules version
   is **frozen into each game at creation** (like the season configuration).
   A game created before the change finishes entirely under today's rules; a
   game created after uses the corrected rules from its first pitch. Nothing
   changes mid-game. (Pre-launch, so no official effect either way.)
7. **Displays:** the in-game fatigue causes read the corrected input; the
   Final panel's R becomes runs charged, with "runs while pitching" in the
   Elements view where different.
8. **Not touched:** dice, chart resolution, advantage, rest tracking (SQL),
   the distance rules themselves, defaults, the pregame display.

## 6. Rulings (Anthony, 2026-11-01)

1. **Shutout Bonus ended by an inherited runner — Option B.** The bonus
   stops; the Control effects already accrued under it (the −1s, and the floor
   reached) stay; **no immediate −2**; from then on the ordinary distance rule
   applies (−2 per out beyond card IP).

   **Verified against the Rulebook — this fills a gap, it doesn't follow from
   the text:**
   - The immediate −2 is defined only for a pitcher who "allows an earned
     run". An inherited runner scoring is not his earned run (§1), so the −2
     cannot be read out of the text; Option B correctly does not apply it.
   - The bonus's eligibility names "0 inherited runners to score", so an
     inherited runner scoring ends eligibility.
   - But the floor sentence says the Control score "remains until the pitcher
     is removed or allows an earned run", and the negative-Control sentence
     the same — neither names an inherited runner. Read literally, an
     inherited run ends eligibility for the bonus but the text never says
     what happens to a pitcher already holding it.
   - **Record as an explicit Elements digital rule clarification** — never
     presented as existing Rulebook language — and propose the Rulebook
     wording be amended to "…until the pitcher is removed, allows an
     earned run, or an inherited runner scores (no immediate −2 in that
     case)".
2. **Returning pitcher — yes.** Runs charged to a pitcher while he was in the
   field (his runners scoring off a reliever) count toward his earned-run
   ladder when he returns to the mound. Responsibility follows the pitcher,
   not his position.

Separate finding, **not part of this change:** the Rulebook's "Pitchers who
start a game with Control 1 or higher & exit … having thrown a pitch … while
having Control −1 or lower receive an additional 1 game added to their
fatigue score" is **not applied by the live rest writer** (SQL, Stage 3
migration), which counts appearances only. It exists only in the TypeScript
reference `postGameRestGames`. Pre-launch it has no effect (no rest is
recorded), but it is a **launch blocker candidate**: rest computed on the
server must include it before official tracking starts. This proposal makes
it easier (the exit Control is computed from the corrected inputs), but it
needs its own reviewed SQL change.

## 7. Regression tests (deterministic, written before the change)

- Inherited runner scores off the reliever: reliever ladder unchanged,
  starter charged; at 3 own + 1 inherited the reliever stays at no penalty
  (today −1).
- Each threshold 4 / 7 / 8 / 9 / 10 crossed by own runs; not crossed when the
  extra run is inherited.
- Over IP without the bonus: distance −2 per out is identical whether a run
  is own or inherited; only the ladder differs.
- Shutout Bonus: kept with no runs; broken by own run (existing branch:
  accrued −1s, −2 now, −2 per out); **ended by an inherited runner (Option
  B): accrued −1s kept, no immediate −2, then −2 per later out beyond card
  IP**; after it ends, a charged run changes only the ladder (no extra −2); a
  pitcher holding a negative Control under the bonus when an inherited runner
  scores keeps it and then loses −2 per out; not available once an inherited
  runner has scored (a pitcher reaching 15 outs after one scored never gets
  it); an inherited runner scoring before he is over card IP removes the
  bonus before it ever applies.
- Two and three pitching changes in one inning with runners from each pitcher;
  each run charged correctly; each pitcher's Control as expected.
- Fielder's choice retiring an inherited runner (9.16(g)); pinch runner for an
  inherited runner; responsibility through extra-base throws, tag-ups and
  steals; GB double play with a run scoring.
- Returning pitcher (§6.2): his runners score while he is in the field →
  charged to him; on return his ladder includes them (e.g. 3 before leaving
  + 1 while away = 4 → −1 on return); a returning pitcher with no runs while
  away is unchanged; responsibility survives the position swap both ways.
- A game created before the change (old rules version), resumed after it:
  identical to today for the rest of the game, including an inherited run
  that would be treated differently under the new rules.
- **Unchanged-behaviour guard:** the full existing fatigue, ground-ball,
  non-GB, boundary and two-player suites pass unchanged except the scenarios
  that involve inherited runners, each of which is listed and updated
  deliberately; thousands of simulated games with no mid-inning pitching
  change produce identical results before and after.
- Invariant: Σ runs charged = runs scored; Σ inherited-runs-scored ≤ runs
  while pitching.

## 8. How it would ship

Only after the two-account Stage 3 game with Will and Anthony's go-ahead.
Its own change, its own review, after the statistics play-record work (which
already records responsibility for statistics, so the bookkeeping exists and
is tested before the engine starts using it). A CHANGELOG entry and a
Rulebook-category marker ("Approved Digital Gameplay Behavior" or a rules
clarification, as you prefer) recording both rulings, and a proposed
Rulebook wording for Option B (§6.1).

## 9. Interactions recorded 2026-11-01 (no change to the rulings)

- **Walk-offs (EDSR-WO, approved):** only runs that legally count are charged
  and feed the ladder; runs after the winning run never existed. Same for a
  run cancelled by a 5.08(a) third out (squeeze 16–19 with two out).
- **Order of work:** F needs A2's per-runner scoring (who scored, in which
  order, charged to whom) — the same reason the walk-off fix comes after A2.
- **Rest is not part of this change:** the server rest correction is its own
  proposal (`REST_SERVER_CORRECTION_PROPOSAL.md`), and pitcher rest
  appearances keep ruling 8 (a completed plate appearance).
- **Distance threshold:** this proposal doesn't touch distance fatigue; the
  2026-10-30 "reaches card IP" ruling awaits confirmation separately
  (`RULES_AUDIT.md` R6).

## 10. Decision 4 and D10 (2026-11-01)

- Distance −2 from the out completing card IP: already implemented; unchanged
  here.
- Inherited run while the Shutout Bonus applies: bonus ends, accrued
  reductions remain, no immediate −2, −2 per later out (Option B, unchanged).
- **D10**, found while tabulating the full progression: the engine recomputes
  the bonus reduction from scratch, refunding accrued −2s for card IP < 5 and
  raising negative Control at bonus start. The fix freezes accrued reductions
  when the bonus starts or ends and lands with this correction (plan §6.1).
- The per-runner responsibility bookkeeping moves into gameplay phase S1c
  (plan §8) instead of waiting for play records.
