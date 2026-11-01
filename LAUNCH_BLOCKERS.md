# Launch blockers

> **Status 2026-11-01:** the gameplay, statistics, box-score, live-UI and
> rest/official-writer work (items 4–11 below) is **implemented locally** on
> branch `stats-and-gameplay-v2` — not pushed, not deployed, migration not
> applied (`IMPLEMENTATION_PLAN.md` §0). What still blocks launch is listed in
> the new section at the end, "Remaining before launch (2026-11-01)".

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

## 4. Fatigue corrections — REQUIRED (rules approved 2026-11-01)

Earned-run fatigue from runs charged to the responsible pitcher; Option B;
returning pitchers (`FATIGUE_RESPONSIBILITY_PROPOSAL.md`), plus D10 (Shutout
Bonus refunds accrued reductions). Part of the consolidated scope
(`IMPLEMENTATION_PLAN.md`, phase S1), which awaits Anthony's single approval.

## 5. Server-side rest corrections — REQUIRED

All three pitcher rest adjustments (negative-Control +1, relief distance +1,
efficiency −1 — approved 2026-11-01, U8 open) implemented and tested, with the trusted server
calculation authoritative (`REST_SERVER_CORRECTION_PROPOSAL.md`). After item 1.

## 6. Approved deterministic scoring rules — REQUIRED

Approved 2026-11-01: W (approach), SV, GIDP, RBI, TP/DBP, G. Still to approve:
L, HLD, BSV, ORDER, RESP, SB, LOB, PA and the walk-off adaptations (U10–U12 in
`IMPLEMENTATION_PLAN.md`). No decision is computed before its rule is
approved.

## 7. Engine discrepancy corrections — REQUIRED

`RULES_AUDIT.md` §3: D1 squeeze PA, D2 / D7 walk-off, D8 squeeze two-out run,
D3 one ground-ball implementation, D9 eligibility after rolls, D10 Shutout
Bonus, Infield In expansion (Decision 2; U1–U5) — implemented with regression
scenarios. D6 and R6 are resolved (engine already correct); the Rulebook
amendments A1–A17 are published on the website and in the Google Doc.

## 8. Structured play records from the first official pitch — REQUIRED

Phase A2 running before launch, so every official game is fully recorded.

## 9. Trusted official statistics writer — REQUIRED

Phase E: server-side, once per game, corrections replace. After item 1.

## 10. Persistent box scores — REQUIRED

Phase B: every completed game, every classification.

## 11. Eligibility and idempotency protections — REQUIRED

Tested on real Postgres: only official + complete + tracking-on games
contribute; pre-launch games never become eligible; duplicate saves,
reopening and corrections never double-count; no app write access; activation
requires empty official tables.

---

# Blockers for starting development (separate from launch)

Superseded on 2026-11-01 by Anthony's request for one consolidated approval
(`IMPLEMENTATION_PLAN.md` §8, §11). Development of phases S1–S6 may begin
when:

1. Anthony approves the consolidated scope; and
2. the open rulings in `IMPLEMENTATION_PLAN.md` §3 are answered (any not yet
   answered stay unbuilt).

Proposed (U13, to confirm): the Will game is played on the **current**
production build and must be complete before anything from this work is
deployed. Server-side move validation (item 1) is recommended as its own
scope after this one. Deploying, applying migrations and activating tracking
each still need Anthony's separate authorisation.

# Operational recommendations (not gameplay; no changes without approval)

See `OPERATIONS.md` § Backups: current limitations, Free-plan risks, a
recommended `pg_dump` schedule, restore testing, and the billing warning. No
service upgrade or billing change is made without Anthony's approval.


# Remaining before launch (2026-11-01)

Each needs Anthony's action or separate authorization; none is done.

1. **Baseline two-account game with Will on the current production build** —
   before any new deployment (audit decision 12).
2. **Push and deploy** the `stats-and-gameplay-v2` branch (preview first) —
   separate authorization.
3. **Apply `20261101_gameplay_stats_and_rest_v2.sql`** to the live database —
   separate authorization; read-only snapshot first; procedure in
   `OPERATIONS.md` § "Applying the 20261101 migration".
4. **Second two-account verification on the updated build**, both screens, a
   full game; any synchronisation, state-authority or rules-validation defect
   fixed before launch approval.
5. **Server-side move validation** (item 1 above) — still not built; the
   official writer and the authoritative rest are only as trustworthy as the
   states the server accepts. Needs a hosting decision (e.g. a Supabase Edge
   Function running the engine).
6. **Google Doc amendments** matching the approved-amendment markers
   (`IMPLEMENTATION_PLAN.md` §2), then the website's official text updated.
7. **Clean slate and activation:** archive pre-launch rest, then
   `activate_official_tracking`, then (separately) turn on
   `official_stats_writer_enabled` and connect the trusted server that calls
   `gameplay_write_official_stats`.
8. **Exhibition cleanup** (optional) — only by separate authorization, preview
   first.
9. **Backups / Supabase plan** — `OPERATIONS.md`.
