# Proposal: authoritative server-side rest calculation — v3 (2026-11-01)

> **Status 2026-11-01 (implementation):** **implemented locally, not applied:** `supabase/migrations/20261101_gameplay_stats_and_rest_v2.sql` adds the three adjustments to the writer for rules-v2 games, with efficiency = BF ≥ 1 and BF ≤ outs (audit decision 7, resolving U8) and back-to-back from `last_pitcher_appearance_game_index`; `src/gameplay/restRules.ts` is the TypeScript twin, parity-tested on PGlite (`statsV2Sql.test.ts`). The full move-validation trust model (§5 item 2) still depends on launch blocker 1.

Status: **adjustments APPROVED (Decisions 5, 6 and Part 3, 2026-11-01);
implementation is part of the consolidated scope (`IMPLEMENTATION_PLAN.md`
§6.2, phase S6). Nothing changed; no database modified; the migration will be
written and tested locally and applied only with separate authorisation.** A separate, reviewed change. **[BLOCKER]** before official
tracking is activated: all three adjustments must be resolved and tested.

---

## 1. The discrepancy (confirmed)

**Live server writer** (`save_gameplay_lab_state`, migration
`20261031_gameplay_one_active_game.sql`), run when an `official` game first
becomes `complete` while official tracking is on, per rostered card and track:

1. appeared → + printed card fatigue; did not appear → −1 (floor 0);
2. − milestone bonus on milestone games (floor 0).

"Appeared" = the client-written marker of a completed plate appearance
(`hitterPlateAppearanceCardKeys` / `pitcherAppearanceCardKeys`), excluding
default-attributes cards.

**Missing — three Rulebook rules on the pitcher track.** They exist only in
the TypeScript reference `postGameRestGames` (`src/gameplay/fatigueEngine.ts`),
exercised by the fatigue harness and **used by no live code** — neither the
app nor the server applies them today.

**Effect so far: none** — official tracking has never been on.

## 2. Exact Rulebook wording

Rulebook §8 Player Fatigue & Effects (Google Doc Section IX):

| Rule | Sub-heading | Text |
|---|---|---|
| Efficiency bonus | Pre-Game Fatigue Effects (IX-B) | "Pitchers who retire the minimum number of batters faced in an appearance & are not appearing in back-to-back games having no rest days in between appearances are awarded an efficiency bonus +1 to their post game fatigue score." Example: "A pitcher with a fatigue score of 1 who did not pitch in the previous game enters a game and retires 3 straight batters. After the game the pitcher normally would need 1 day of rest in order to appear in his next game at no fatigue, but since he retired the minimum amount of batters, he can appear in the next game with no fatigue effects in place." |
| Relief distance | In-Game Distance Fatigue Effects (IX-C) | "For each appearance that relief pitchers make pitching beyond their card IP length that also goes beyond 1.0 IP in total length, 1 additional game is added to the total number of games needed to reset their fatigue score at the end of the game." Example: card IP 1.0, fatigue 6, 2 games from rested, pitches 2.0 IP → 9 games (2 + 1 + 6) |
| Negative-Control exit | In-Game Distance Fatigue Effects (IX-C) | "Pitchers who start a game with Control 1 or higher & exit a game after having thrown a pitch to a hitter while having Control -1 or lower receive an additional 1 game added to their fatigue score, regardless of if they are a starting pitcher or relief pitcher." |

The efficiency bonus "+1 to their post game fatigue score" means **one game
less** to rest, per its example.

## 3. Definitions [PROPOSED unless marked]

| Term | Definition | Status |
|---|---|---|
| **Rest appearance** (pitcher) | A completed plate appearance against him. A reliever whose only event is an out on the bases incurs no rest | **[APPROVED]** — ruling 8, confirmed by Anthony ("the CS-only reliever not getting appearance credit is accurate"). Statistics G is separate (EDSR-G) |
| Starter / reliever | Starter = his side's first pitcher in the game; everyone else is a reliever | proposed (needed for relief distance) |
| **Relief distance +1** | Reliever **and** outs > 3 **and** outs > card-IP outs | **[APPROVED]** threshold — ruling 7: strictly *beyond* card IP; reaching it exactly doesn't count; matches `reliefDistanceRestPenalty` |
| Control at start | His effective Control at his first pitch roll of the game = printed Control − pre-game rest penalty (no in-game effect exists before his first pitch) | proposed |
| Pitched at −1 or lower | At least one pitch roll in the game at effective Control ≤ −1. Control only falls during a game, so this equals "his last pitch was at ≤ −1". Dropping to −1 on the out that ends his outing, with no further pitch, does not count ("after having thrown a pitch … while having Control −1 or lower") | proposed |
| **Negative-Control +1** | Control at start ≥ 1 **and** pitched at −1 or lower | proposed |
| **Efficiency −1** | BF ≥ 1 and BF = outs (integer), not back-to-back | **[APPROVED]** — Decision 5, reading A. Open: U8 (BF ≤ outs for DP / CS outings) |
| Back-to-back | He also made a rest appearance as a pitcher in this GM's immediately preceding completed official game of the season ("no rest days in between") | proposed |
| Default attributes | No accrual, no modifiers (as today) | existing |
| **Order** (pitcher track, appeared) | prior + card fatigue + relief distance → efficiency (−1, floor 0) → negative-Control (+1) → milestone (−bonus, floor 0). `postGameRestGames`' tested order; another order differs only when the total before efficiency is 0 | proposed |
| Not appeared / hitter track | Unchanged | existing |

## 4. Efficiency bonus — readings and demonstrations [RULED: A — Decision 5; U8 open]

"Retire the minimum number of batters faced in an appearance" can be read
three ways:

- **A — "faced the minimum" (my earlier proposal):** batters faced = outs
  recorded, with **at least one batter faced**. A runner erased by a double
  play or caught stealing still counts as the minimum (baseball's usual
  meaning of "faced the minimum").
- **B — retired every batter he faced:** no hit or walk allowed, at least one
  batter faced.
- **C — the three-batter minimum:** faced exactly three batters (the MLB
  5.10(g) minimum, adopted 2026-10-30) and retired all three. The Rulebook
  itself contains no three-batter rule, so this reading relies on MLB's.

| Appearance | BF | Outs | A | B | C |
|---|---|---|---|---|---|
| **Zero outs:** walk, single, removed | 2 | 0 | no | no | no |
| **Zero outs:** enters, runner caught stealing to end the inning, replaced next inning | 0 | 1 | no rest appearance at all (ruling 8) — bonus moot | | |
| **One out:** enters with two out, retires one batter | 1 | 1 | **yes** | **yes** | no |
| **One inning:** three up, three down | 3 | 3 | yes | yes | yes |
| One inning: single, double play, groundout | 3 | 3 | **yes** | no | no |
| One inning: walk, caught stealing, two outs | 3 | 3 | **yes** | no | no |
| One inning: single, three outs | 4 | 3 | no | no | no |
| **Multi-inning:** two perfect innings | 6 | 6 | **yes** | **yes** | no |
| Multi-inning: starter, 9 perfect innings | 27 | 27 | yes | yes | no |

**Recommendation: A** — it is the standard meaning of "faced the minimum",
fits the Rulebook example, and is defined for every appearance length. Note
that A and B give the bonus to a starter who faces the minimum over a long
outing; C limits it to three-batter outings. Anthony to choose.

## 5. Required change — the server is authoritative

1. **One rest module.** Merge `restTracking.ts` (the live mirror) and
   `postGameRestGames` (the reference) into one TypeScript module — the only
   definition of rest.
2. **The trusted server runs it.** Rest is computed by the server-side engine
   from validated moves (launch blocker 1) and play records (phase A2): per
   pitcher — rest appearance, starter, outs, batters faced, card-IP outs,
   Control at start, pitched at −1 or lower, previous-game appearance. Nothing
   the client submits is trusted.
3. **The client never computes rest itself.** It displays what the server
   wrote (`player_rest_state`). Any pre-game or post-game preview calls the
   same module on the same inputs, labelled as a preview; a parity test fails
   if the two ever differ.
4. **New migration** (never an edit of an existing one):
   - `player_rest_state`: add `last_pitcher_appearance_game_index int` (the
     GM's completed-official-game count at the card's last rest appearance)
     for the back-to-back test;
   - move the rest write into a function callable only by the trusted server
     role (no app role), keeping the existing gates;
   - a matching rollback file.
5. **Parity test:** SQL and TypeScript produce identical rest on every
   fixture in §7.

## 6. Interaction with Stage 3 protections (all unchanged)

- Rest is written only on the transition into `complete`, only for
  `progression = 'official'`, only while `gameplay_official_tracking_enabled()`.
- `gameplay_rest_write_guard` still refuses app writes while tracking is off.
- `activate_official_tracking` still requires `player_rest_state` to be empty.
- Pre-launch, practice, friendly and untracked games never write rest; an
  official game can't complete during a suspension; nothing pre-launch becomes
  eligible.

## 7. Tests

- **Control thresholds:** start 1, pitches at −1 → +1; start 1, lowest pitch
  at 0 → no; start 0, pitches at −3 → no; start 1, reaches −1 on his final out
  without another pitch → no; start 5, earned-run ladder and distance take him
  to −2 and he then throws a pitch → +1; default attributes → no.
- **Relief distance:** card IP 1.0, 4 outs → +1; card IP 1.0, 3 outs → no;
  card IP 2.0, 5 outs → no; card IP 2.0, 7 outs → +1; starter over card IP →
  no.
- **Efficiency:** every row of the §4 table under the chosen reading;
  back-to-back blocks it; floor at 0.
- **Combinations and order:** relief + negative + efficiency together; the
  zero-total case.
- **Appearance:** CS-only reliever → no rest (ruling 8), statistics G 1.
- **Protections (real Postgres):** pre-launch game completes → 0 rows;
  practice / friendly / untracked → 0; tracking off → guard refuses; suspension
  → final move refused; duplicate completion save → no second write;
  activation refuses with rows present.
- **Parity:** SQL = TypeScript; client display = server value.

## 8. Shipping

Its own reviewed change, after server-side move validation and play records,
before `activate_official_tracking`: preview, local rehearsal on a snapshot,
fresh backup, apply, rollout record.

## 9. v3 additions

- Four-way comparison (written rule / reference / live server / proposed):
  `IMPLEMENTATION_PLAN.md` §6.2. Note: the reference `postGameRestGames`
  leaves a non-appearing card's rest unchanged and has no milestone step; the
  live server's −1 decay and milestone are the approved base and are kept.
- Zero-BF appearance (Decision 6): pitching G 1 for statistics; for rest it is
  a non-appearance (ruling 8), so the card decays −1 like any non-appearing
  card.
- U8: Decision 5 says BF = outs; a reliever who gets a GIDP on his only batter
  (BF 1, outs 2) would not qualify. Anthony to confirm equality or BF ≤ outs.
