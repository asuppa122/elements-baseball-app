# Elements Gameplay Scenario Test Library

## Update 1 foundation

The private Scenario Runner deliberately constructs gameplay states and calls the same production gameplay resolvers used by manager gameplay. It does not write scenario results to Supabase and it is not a user-facing game simulation feature.

Every deterministic scenario reports an ID, category, description, expected Rulebook result, and PASS/FAIL result. Randomized full-game Rules Bot simulations remain a separate integration/stress layer.

### Rulebook assertion priorities

1. Apply the base player/card attribute.
2. Apply only modifiers explicitly legal for that mechanic.
3. Resolve natural-roll overrides where the Rulebook defines them.
4. Apply the ordinary comparison, including equality behavior.
5. Resolve runners, outs, scoring, decision state, and next action.
6. Assert state integrity (no duplicate runners, impossible outs, illegal decisions, or dead ends).

### Hit extra-base BsR

- 1B -> 3B: no ordinary +3 hit-advancement bonus.
- Other qualifying hit advancements: +3 BsR.
- With two outs: an additional +3 BsR applies to hit extra-base attempts.
- Therefore 1B -> 3B with two outs is +3 total; 2B -> HOME with two outs is +6 total.
- These hit-advancement BsR bonuses never apply to tag ups.

### Tag ups

- Tag toward HOME: RTS succeeds on 11-20.
- Tag toward 3B (and special 1B -> 2B path): RTS succeeds on 16-20.
- 1B -> 2B tag: +10 to the selected OF fielding check.
- Tag ups use base BsR and do not inherit hit-advancement BsR bonuses.

### Natural d20 overrides

Natural 1/20 behavior is attached to the Rulebook mechanic that defines it; it is not a global dice shortcut. Fielding/steal checks in Update 1 explicitly test natural 1, ordinary comparisons/equality, and natural 20.

## Update 1 deterministic coverage

The in-app `Run Non-GB Scenario Matrix` currently covers:

- Rule modifier arithmetic and natural overrides
- Legal/illegal pre-pitch manager-action availability
- Core K/PU/FB/1B/1B+/2B/3B/HR transitions
- Extra-base runner dependency rules
- Extra-base RTS pass/fail and two-out throw-home RTS skip
- Hit-advancement BsR bonuses and exceptions
- Outfield fielding natural 1/20 behavior
- Tag-up RTS boundaries and modifier isolation
- Natural stolen-base catcher checks and steal-home +15
- Negative-catcher unlimited natural-steal behavior
- Mandatory 1B+ stolen-base behavior
- Sacrifice bunt standard table boundaries
- Wheel-play boundaries
- Squeeze-bunt boundaries
- Intentional-walk forced advancement
- INF IN declaration behavior
- Pinch hitter / pinch runner / defensive sub / pitching-change decision plumbing
- Default/card entry mode persistence
- Outfield throw-use rotation
- Base-state identity integrity

Ground Ball / Force / DBP, fatigue, full game/season boundaries, and multi-mechanic certification are intentionally reserved for Updates 2-5 of the approved five-update plan.

## Update 2 — Ground Ball / Force / DBP
Adds a dedicated deterministic Rulebook resolver and scenario matrix for GB states, automatic-out RFO boundaries, standard DBP, 3B→1B DBP, triple-play eligibility/resolution, natural 1/20 overrides, equality-safe fielding checks, INF IN ground-ball behavior, contact play, and negative/illegal-action tests. Existing Update 1 non-GB scenarios remain unchanged and must continue to pass.

## Update 4 — Game / Season / Multi-Mechanic Integration
The fourth consolidated checkpoint adds deterministic boundary tests for inning transitions, regulation endings, walk-offs, third-out scoring order, active-season/timeline boundaries, and regression chains that intentionally cross previously certified mechanic families. These tests complement—not replace—the 72 Non-GB, 41 GB/Force/DBP, and 36 Fatigue/Pitching scenarios.
