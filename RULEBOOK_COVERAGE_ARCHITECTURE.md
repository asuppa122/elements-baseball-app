# Rulebook Coverage Architecture — v1.3.77

The testing goal is meaningful Rulebook coverage, not arbitrary simulation volume.

## Evidence layers
1. Deterministic branch tests — exact state/roll/choice assertions.
2. Interaction/regression tests — multiple proven mechanics chained together.
3. Interactive verification — manager-facing step-by-step demos.
4. Rules demos — the same approved examples used to teach new managers.
5. Complete-game simulation — integration/fuzz evidence only after targeted checks pass.
6. Statistical validation — large samples only for frequency/balance questions.

## Current registry
`src/gameplay/rulebookCoverage.ts` aggregates the currently fixture-independent executable suites:
- gameplay demo assertions
- Ground Ball / Force / DBP matrix
- Fatigue / Pitching matrix
- Game / Boundary / Regression matrix

The private `/games/lab/verification` page reports branch counts by mechanic and displays exact failures. The existing non-GB live-fixture matrix remains on the developer game-state page because it depends on a frozen roster/game fixture.

## Regression rule
Whenever a manual game or complete-game simulation discovers a bug:
1. reproduce the exact state deterministically;
2. add a stable scenario ID;
3. make the scenario fail before the fix when practical;
4. repair the production resolver;
5. keep the scenario permanently.

Complete-game counts do not replace deterministic Rulebook proof.
