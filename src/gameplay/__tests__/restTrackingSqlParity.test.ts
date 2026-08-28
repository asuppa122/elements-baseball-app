import { describe, expect, it } from 'vitest'
// Loaded through Vite's ?raw rather than node:fs so this stays inside the app
// tsconfig's browser lib -- the point is only to read the migration's text.
import migrationSql from '../../../supabase/migrations/20260826_gameplay_rest_tracking_on_completion.sql?raw'
import { applyGameCompletionRest } from '../restTracking'
import type { RestMilestone } from '../seasonConfig'
import { countAssignments, evaluateSql, extractAssignment, normalizeJsonbAccessors } from './sqlExpression'

/**
 * Parity between the two implementations of the rest sequence.
 *
 * `restTracking.ts` is the reference; the SQL body of `save_gameplay_lab_state`
 * is what actually persists. They were written separately and nothing compared
 * them, so either could change alone and diverge silently -- and the only place
 * a manager would ever see the difference is the post-game screen, which reads
 * the TypeScript.
 *
 * The SQL side here is evaluated from the migration's own text (see
 * sqlExpression.ts). That is the whole point: a hand-written restatement of the
 * SQL would agree with whichever implementation it was copied from and prove
 * nothing.
 */

const sql = normalizeJsonbAccessors(migrationSql)

const HITTER_EXPR = extractAssignment(sql, 'v_new_hitter')
const PITCHER_EXPR = extractAssignment(sql, 'v_new_pitcher')

/** The migration's milestone `if` condition, read out of the file. */
function milestoneCondition(): { condition: string; index: number } {
  const marker = 'if milestone_gamesplayed > 0'
  const start = sql.indexOf(marker)
  if (start < 0) throw new Error('Migration no longer guards milestones the way this test expects')
  return { condition: sql.slice(start + 'if '.length, sql.indexOf(' then', start)).trim(), index: start }
}
const { condition: MILESTONE_CONDITION, index: MILESTONE_INDEX } = milestoneCondition()

// v_milestone_bonus is assigned twice -- the `:= 0` initializer and the
// accumulation inside the loop. Searching from the loop guard takes the
// accumulation; taking the first match instead silently pins the bonus at 0
// and makes every milestone case look like a divergence.
const MILESTONE_BONUS_EXPR = extractAssignment(sql, 'v_milestone_bonus', MILESTONE_INDEX)

/** Runs the SQL's own milestone loop over a season's tiers. */
function sqlMilestoneBonus(gmCompletedGames: number, milestones: RestMilestone[]): number {
  let bonus = 0
  for (const m of milestones) {
    const vars = {
      milestone_gamesplayed: m.gamesPlayed,
      milestone_bonusrestdays: m.bonusRestDays,
      v_gm_completed_games: gmCompletedGames,
      v_milestone_bonus: bonus,
    }
    if (evaluateSql(MILESTONE_CONDITION, vars)) bonus = evaluateSql(MILESTONE_BONUS_EXPR, vars) as number
  }
  return bonus
}

type Case = {
  priorHitter: number
  priorPitcher: number
  hitterFatigue: number | null
  pitcherFatigue: number | null
  hitterAppeared: boolean
  pitcherAppeared: boolean
  gmCompletedGames: number
  milestones: RestMilestone[]
}

function sqlResult(c: Case): { hitter: number; pitcher: number } {
  const bonus = sqlMilestoneBonus(c.gmCompletedGames, c.milestones)
  const vars = {
    v_prior_hitter: c.priorHitter,
    v_prior_pitcher: c.priorPitcher,
    v_hitter_fatigue: c.hitterFatigue,
    v_pitcher_fatigue: c.pitcherFatigue,
    v_hitter_appeared: c.hitterAppeared,
    v_pitcher_appeared: c.pitcherAppeared,
    v_milestone_bonus: bonus,
  }
  return {
    hitter: evaluateSql(HITTER_EXPR, vars) as number,
    pitcher: evaluateSql(PITCHER_EXPR, vars) as number,
  }
}

function tsResult(c: Case) {
  return applyGameCompletionRest({
    priorHitterGamesRemaining: c.priorHitter,
    priorPitcherGamesRemaining: c.priorPitcher,
    hitterFatigueScore: c.hitterFatigue,
    pitcherFatigueScore: c.pitcherFatigue,
    hitterAppeared: c.hitterAppeared,
    pitcherAppeared: c.pitcherAppeared,
    gmCompletedGamesThisSeason: c.gmCompletedGames,
    restMilestones: c.milestones,
  })
}

const MILESTONE_SETS: RestMilestone[][] = [
  [],
  [{ gamesPlayed: 8, bonusRestDays: 1 }],
  [{ gamesPlayed: 4, bonusRestDays: 1 }, { gamesPlayed: 6, bonusRestDays: 2 }],
]

function buildMatrix(): Case[] {
  const cases: Case[] = []
  for (const priorHitter of [0, 1, 2, 5, 9]) {
    for (const hitterFatigue of [null, 0, 1, 3, 5]) {
      for (const hitterAppeared of [true, false]) {
        for (const gmCompletedGames of [1, 3, 4, 6, 8, 12, 24]) {
          for (const milestones of MILESTONE_SETS) {
            cases.push({
              priorHitter,
              // vary the pitcher track independently so a formula that only
              // reads the hitter variables cannot pass by symmetry
              priorPitcher: (priorHitter + 3) % 10,
              hitterFatigue,
              pitcherFatigue: hitterFatigue === null ? 4 : null,
              hitterAppeared,
              pitcherAppeared: !hitterAppeared,
              gmCompletedGames,
              milestones,
            })
          }
        }
      }
    }
  }
  return cases
}

describe('restTracking.ts vs the SQL that actually persists', () => {
  const matrix = buildMatrix()

  it('covers a matrix wide enough for the comparison to mean something', () => {
    expect(matrix.length).toBeGreaterThan(1000)
  })

  it('agrees on every case across the realistic input domain', () => {
    const divergences = matrix
      .map((c) => ({ c, ts: tsResult(c), sql: sqlResult(c) }))
      .filter(({ ts, sql: s }) => ts.hitterGamesRemaining !== s.hitter || ts.pitcherGamesRemaining !== s.pitcher)
      .slice(0, 5)
      .map(({ c, ts, sql: s }) =>
        `prior ${c.priorHitter}/${c.priorPitcher} ftg ${c.hitterFatigue}/${c.pitcherFatigue} ` +
        `appeared ${c.hitterAppeared}/${c.pitcherAppeared} games ${c.gmCompletedGames} ` +
        `milestones ${JSON.stringify(c.milestones)} -> ts ${ts.hitterGamesRemaining}/${ts.pitcherGamesRemaining} ` +
        `vs sql ${s.hitter}/${s.pitcher}`)

    expect(divergences).toEqual([])
  })

  it('reads the SQL from the migration rather than a restatement of the TypeScript', () => {
    // If this ever stops being true the whole suite is theatre.
    expect(HITTER_EXPR).toContain('v_prior_hitter')
    expect(HITTER_EXPR).toContain('greatest')
    expect(HITTER_EXPR).toContain('v_milestone_bonus')
    expect(PITCHER_EXPR).toContain('v_prior_pitcher')
    expect(MILESTONE_CONDITION).toContain('%')
  })

  it('pins how many times the migration assigns each variable it extracts', () => {
    // Extraction takes the FIRST match from its search point. If a third
    // assignment to v_milestone_bonus appears, or v_new_hitter gains a second,
    // the extracted expression may no longer be the one that decides the
    // result -- and the parity test would pass while comparing the wrong
    // thing. That already happened once during development.
    expect(countAssignments(sql, 'v_milestone_bonus')).toBe(2)
    expect(countAssignments(sql, 'v_new_hitter')).toBe(1)
    expect(countAssignments(sql, 'v_new_pitcher')).toBe(1)
  })

  it('fails loudly if the migration changes shape rather than silently skipping', () => {
    expect(() => extractAssignment(sql, 'v_no_such_variable')).toThrow(/must be revisited/)
    expect(() => evaluateSql('array_agg(x)', {})).toThrow()
  })
})

describe('the appearance flag is the caller contract, not part of either formula', () => {
  /**
   * The SQL folds the default-attributes exemption INTO its appeared flag:
   *   v_hitter_appeared := appeared_keys ? card and not (default_batter_keys ? card)
   * The TypeScript takes `hitterAppeared` as given. So the two agree only if
   * every TypeScript caller applies the exemption itself before calling. That
   * makes it a contract on callers, and it is asserted on postGameSummary in
   * postGameSummary.test.ts.
   */
  it('is exactly the predicate the migration uses, so callers can be checked against it', () => {
    expect(sql).toContain("v_hitter_appeared := v_hitter_appeared_keys ? v_card_key")
    expect(sql).toContain("not (v_default_batter_keys ? v_card_key)")
    expect(sql).toContain("v_pitcher_appeared := v_pitcher_appeared_keys ? v_card_key")
    expect(sql).toContain("not (v_default_pitcher_keys ? v_card_key)")
  })
})
