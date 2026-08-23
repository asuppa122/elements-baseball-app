# Elements Baseball Gameplay Engine — Phase 1 Foundation

This folder begins the gameplay engine without exposing a public gameplay screen.

## Source-of-truth principles

- The Elements League Rulebook remains authoritative for gameplay rules.
- Approved digital behavior may change *how* a manual rule is performed in the app, but does not silently rewrite the official rule.
- Active Elements season configuration is frozen into each game when it is created.
- Saved Team Builder rosters are validated, then snapshotted. An in-progress game never reads a mutable Team Builder roster as its live roster state.
- All production dice rolls will occur inside the app. `QueuedTestDiceProvider` exists only for deterministic development/scenario testing and is not exposed to normal users.
- Every meaningful game action will eventually advance an authoritative `stateVersion` so stale/double actions can be rejected.
- Pause/resume is foundational: the persisted game state must be sufficient to resume later from the exact same state.

## Rule condition taxonomy

- **RC1_VISIBLE_STATE** — immediately known/calculated game information.
- **RC2_LOCKED_MANAGER_DECISION** — manager declaration/choice that becomes immutable once submitted.
- **RC3_MLB_TIMELINE** — MLB rules that depend on the game rule year.
- **RC4_ACTIVE_SEASON_CONFIGURATION** — Elements season roster/setup configuration.
- **RC5_CONDITIONAL_GAME_STATE** — a rule activated by the current state plus the event that just occurred (GB/DBP, RTS, fatigue threshold, inning transition, etc.).

## Phase 1 acceptance target

Create a Season 10.1 game, validate/select eligible 1925 saved rosters, freeze both roster snapshots, record starting pitchers and game-only default-batter declarations, lock both managers' pregame selections, start at Top 1 / 0 outs / 0–0, persist it, pause it, and resume the exact state later.

Pitch → Advantage → Swing → Chart Result is intentionally Phase 2.

## Phase 1A — Private Create Game
`/games/lab` is intentionally unlinked and protected by the `gameplay_feature_access` database allowlist. The first tester is Anthony. This slice proves saved-roster validation, frozen home roster snapshots, game creation, and persistence/reload. Opponents are referenced in the private test record but do not yet receive access to it.

## Phase 1B private pregame

The private lab can now open a persisted test game and configure the tester's frozen pregame state. Starting pitcher and game-only Default Batter declarations may be saved, refreshed, and then locked. The persistence RPC requires the caller's expected state version, so stale browser state cannot silently overwrite a newer saved version. Opponent pregame remains intentionally disabled until the true two-manager test slice.


## Phase 1D
Private state test initializes Top 1st through the real engine, persists inning/half/outs/score/bases/lineup cursors/current matchup/waiting-for/next-actor, and verifies pause/resume. Until opponent access is enabled, the away baseball setup is an explicit development fixture cloned from the tester's validated locked setup; production multiplayer must never use that helper.


## Phase 2A
Implements the Elements Rulebook pitch roll: defensive d20 + pitcher Control compared with hitter On Base. Greater = pitcher advantage, lower = hitter advantage, and an equal total is resolved by the Rulebook platoon rules. A pregame Default Batter uses On Base 5. The resolved pitch is persisted as a PITCH_ROLLED event and moves the authoritative state to SWING_ROLL without rerolling on refresh.


## v1.3.46 — Playable Core Game Prototype
Adds frozen hitter/pitcher charts to new game roster snapshots, swing resolution, pitcher-chart negative-infield conversion, automatic K/PU/BB/3B/HR and basic hit advancement, lineup cycling, half-inning transitions, regulation/extra-inning continuation, walk-off/game-ending checks, persisted swing/result events, and the RC5 decision gateway. Optional extra bases/tag-ups can be declined in Build 1; advanced GB, 1B+, RTS/DBP and other conditional branches intentionally stop for Build 2. A private local seeded harness stress-tests the same core state transitions without exposing simulation as manager gameplay.

## v1.3.47 — Build 1 validation correction
Hardens frozen chart-range parsing, validates that every participating hitter/pitcher chart covers d20 rolls 1–20 exactly once before the local stress harness runs, and surfaces the exact frozen chart when coverage fails. The private validation control now reports Running/Failed inline so a harness error cannot look like an unresponsive button.


## v1.3.52 — Build 2 Decision Engine Foundation
Introduces one shared manager-decision presentation/resolution layer with Select → Confirm → Locked semantics. Extra-base and tag-up gateways now advance into explicit multi-runner selection states; extra-base attempts then advance to the defensive throw-target state, while tag-up attempts advance to the RTS state. Legal runner choices are derived from frozen game state and base-path occupancy. No Rulebook roll or fielding outcome is invented: unresolved RTS/GB/fielding branches remain explicit decision gateways for later Build 2 resolvers.


### v1.3.53
Build 2 resolver activates extra-base/tag-up RTS, throw-target/outfielder selection, fielding checks, OF usage rotation, and the approved 1B→2B tag-up +10 DEF-check modifier.
