# Session notes — 28 August 2026

Paste-ready summary of the autonomous stretch, for the roadmap sheet.

## Built and committed

| Commit | What |
|---|---|
| `8cf6777` | Gameplay screen step 1 — responsive three-column shell at `/games/lab/:gameId/screen` |
| `fc6f798` | Step 2 — field, nine fielders with live DEF, runners |
| `115ad12` | Step 3 — lineup rail with real card art |
| `06dc57d` | Step 4 — right rail: decision board reused, availability, log |
| `d765acc` | Step 5 — matchup, roll readout, chart readout; all regions real |
| `9cec94c` | Game log narrated from recorded events only |
| `cefb721` | Substitution scenarios: no re-entry, relief fatigue baseline |
| `2706fdf` | Moment-intensity classifier (nothing consumes it yet) |
| `c74871d` | Plan doc brought in line with reality |

Tests went 421 → 444. Build, lint and types green at every commit.

## Boundaries held

- **No engine, fatigue, persistence or dice change.** `decisionEngine.ts` was temporarily mutated
  twice to prove the new substitution scenarios bite, then restored byte-for-byte (verified with
  `git diff`). Nothing else under `src/gameplay/` outside `presentation/` was modified except
  `scenarioHarness.ts`, which gained three scenarios and no behaviour.
- **`/play` untouched.** The new screen is a separate route and a separate stylesheet; its tokens
  are scoped to `.gp-screen` so it cannot restyle the existing surfaces.
- **No production writes, no migrations, no deploys.** The only database writes all session were
  into the isolated synthetic season `10.1-VERIFY-20260828`, already approved. Live season 10.1 was
  read but never written; its seven rest rows still carry their original 2026-08-26 timestamp.

## Decisions waiting on you

1. **Make the new screen playable?** It renders; `/play` still resolves. Doing it means either
   duplicating the shell's action layer or refactoring the shell to share it. The second is
   cleaner and touches the working shell, which is why it was not done unattended.
2. **Export `benchCards` from `decisionEngine`?** `presentation/availability.ts` currently restates
   that rule from public state. It is a second copy that could drift. One-line engine export fixes
   it — an engine change, so left alone.
3. **Season game count for the rest projection.** Not the small job it was listed as: RLS scopes
   rest rows to their owner and games to the home side, so a client-side count is potentially wrong
   for the opponent. Options written up in the plan doc.
4. **`confirmationSummary`** is empty in all 27 decision types. Filling it is an engine change.
5. **`dice.ts`** is still flagged unused by knip. Keep or remove is a testing-model call.
6. **Moment takeover treatment.** The classifier exists and is tested; what it should look like is
   a design decision.
7. **Default-attributes rules reading** — still outstanding from earlier, still yours.

## Known-unavailable, by design

Per-batter stat lines (AB/H untracked) · play-by-play for pre-28-August events (their payloads
recorded the dice, not the play) · the result rule headline · resign/forfeit · designed mobile
layout for the rails beyond the responsive stack.
