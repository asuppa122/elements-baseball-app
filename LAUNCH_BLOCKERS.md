# Launch blockers

Elements Baseball is in pre-launch: nothing played counts toward official
progression until Anthony runs `activate_official_tracking` (see
`supabase/ROLLOUT_STAGE3.md`). Every item below must be done, and signed off by
Anthony, **before** that switch is turned on. The switch itself enforces only
item 2; the rest are on this list because nothing else stops them.

## 1. Server-side move validation — MANDATORY (decided 2026-10-31)

**Today:** the browser runs the game engine and submits the whole next game
state. The server (`save_gameplay_lab_state`) checks who is saving, that it is
their turn, that they did not touch the other team, that a server-issued die
was used for pitches, swings and decision rolls, and that the version is
current. It does **not** check that the submitted state is what the rules
produce from the previous state. A modified client could submit any score,
any outs, any runner positions, or a finished game.

**Before launch:** the server must validate each move against the
authoritative rules — given the previous state, the submitted action and the
server's own die, the resulting state must be exactly what the engine
produces (or the server computes it itself and ignores the client's). Pregame
submissions must be validated the same way (roster legality, lineup,
alignment).

**Acceptance:** a test suite in which tampered states (changed score, outs,
bases, fatigue, lineup, a forged completion, a forged decision outcome) are all
refused, run against the same deterministic scenario harnesses that prove the
engine today; the existing two-player full-game tests still pass.

**Not part of Stage 3**, and not an engine rewrite: the likely shape is
running the existing TypeScript engine server-side (an Edge Function or a small
service) as the only writer of game state.

## 2. Clean slate — ENFORCED BY THE SWITCH

All pre-launch persistent rest must be archived
(`supabase/data-fixes/20261031_prelaunch_rest_archive.sql`).
`activate_official_tracking` refuses while any row remains in
`player_rest_state`.

## 3. Real two-account game — REQUIRED

A complete two-player game between two real accounts (Anthony and Will) on
the deployed site: creation, pregame, alternating turns, decisions,
completion, leaving and resuming — with no official game count, milestone
progress or persistent rest recorded (they are pre-launch games).
