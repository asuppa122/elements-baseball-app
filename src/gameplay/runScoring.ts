import { cardIpOuts } from './fatigueEngine'
import { creditRunsToInning } from './inningScore'
import { pitcherInstanceKey, readPitcherStateValue } from './pitcherStateKey'
import { currentPitcherKey, recordRun, recordWinningRun, startingBaseOf } from './playLog'
import { usesRulesV2 } from './rulesVersion'
import type { BaseRunnerState, GameSide, GameState } from './types'

/**
 * The one path every run takes. Both engines (coreGame, decisionEngine) call
 * it, in scoring order (lead runner first, EDSR-ORDER), with the runners that
 * crossed the plate.
 *
 * Rules v1 (games created before 2026-11-01) keeps the old behaviour exactly:
 * every run counts and is charged to whoever is pitching.
 *
 * Rules v2:
 * - Walk-off (OBR 7.01(g), 5.08): once the home team leads in the bottom of
 *   the 9th or later, later runs on the play don't count -- except on a home
 *   run, where every run counts (every Elements HR leaves the park).
 * - The run is charged to the runner's responsible pitcher (OBR 9.16), which
 *   drives that pitcher's earned-run fatigue ladder.
 * - A run charged to the pitcher on the mound while his Shutout Bonus applies
 *   breaks it (immediate -2, then -2 per out). An inherited runner scoring
 *   ends it instead (Option B: accrued reductions stay, no immediate -2).
 */

const other = (side: GameSide): GameSide => (side === 'home' ? 'away' : 'home')

export function walkoffWon(state: Pick<GameState, 'inning' | 'half' | 'score'>): boolean {
  return state.inning >= 9 && state.half === 'bottom' && state.score.home > state.score.away
}

function appearanceOuts(state: GameState, defense: GameSide, pitcherKey: string): number {
  const totalDefenseOuts = (state.inning - 1) * 3 + state.outs
  const entry = readPitcherStateValue(state.pitcherEntryDefenseOuts, defense, pitcherKey) ?? 0
  return Math.max(0, totalDefenseOuts - entry)
}

function shutoutBonusActive(state: GameState, defense: GameSide, pitcherKey: string): boolean {
  if ((readPitcherStateValue(state.pitcherRunsAllowed, defense, pitcherKey) ?? 0) !== 0) return false
  if (readPitcherStateValue(state.pitcherShutoutBonusBrokenAtOuts, defense, pitcherKey) !== undefined) return false
  if (readPitcherStateValue(state.pitcherShutoutBonusEndedAtOuts, defense, pitcherKey) !== undefined) return false
  if ((readPitcherStateValue(state.pitcherInheritedRunsScored, defense, pitcherKey) ?? 0) !== 0) return false
  const card = state.pregame[defense].roster?.cards[pitcherKey]
  const outs = appearanceOuts(state, defense, pitcherKey)
  return Boolean(card && outs >= 15 && outs >= cardIpOuts(card.pitcher.ip))
}

function bump(record: Record<string, number> | undefined, key: string, n = 1): Record<string, number> {
  return { ...(record ?? {}), [key]: (record?.[key] ?? 0) + n }
}

/** Rules v1: the pre-2026-11-01 scorer, byte-for-byte in behaviour. */
function scoreRunsV1(state: GameState, side: GameSide, count: number): GameState {
  const defense = other(side)
  const pitcherKey = state.plateAppearance.pitcherCardKey ?? state.pregame[defense].defensiveAlignment.P ?? state.pregame[defense].startingPitcherCardKey
  const scoped = pitcherKey ? pitcherInstanceKey(defense, pitcherKey) : null
  let broken = state.pitcherShutoutBonusBrokenAtOuts
  if (pitcherKey && scoped && (readPitcherStateValue(state.pitcherRunsAllowed, defense, pitcherKey) ?? 0) === 0 && readPitcherStateValue(state.pitcherShutoutBonusBrokenAtOuts, defense, pitcherKey) === undefined) {
    const card = state.pregame[defense].roster?.cards[pitcherKey]
    const outs = appearanceOuts(state, defense, pitcherKey)
    if (card && outs >= 15 && outs >= cardIpOuts(card.pitcher.ip)) broken = { ...(state.pitcherShutoutBonusBrokenAtOuts ?? {}), [scoped]: outs }
  }
  const pitcherRunsAllowed = pitcherKey && scoped ? { ...(state.pitcherRunsAllowed ?? {}), [scoped]: (readPitcherStateValue(state.pitcherRunsAllowed, defense, pitcherKey) ?? 0) + count } : state.pitcherRunsAllowed
  return {
    ...state,
    score: { ...state.score, [side]: state.score[side] + count },
    runsByInning: creditRunsToInning(state.runsByInning, side, state.inning, count),
    pitcherRunsAllowed,
    pitcherShutoutBonusBrokenAtOuts: broken,
  }
}

/**
 * Scores `runners` for the batting side, lead runner first. `count` covers v1
 * callers that only know how many scored (the runners list may then be empty).
 */
export function scoreRunners(state: GameState, side: GameSide, runners: BaseRunnerState[], options: { homeRun?: boolean; count?: number } = {}): GameState {
  const count = options.count ?? runners.length
  if (count <= 0) return state
  if (!usesRulesV2(state)) return scoreRunsV1(state, side, count)

  const defense = other(side)
  let next = state
  for (const runner of runners) {
    const from = startingBaseOf(next, runner.cardKey)
    const onMound = currentPitcherKey(next)
    const responsible = runner.responsiblePitcherKey ?? onMound
    if (walkoffWon(next) && !options.homeRun) {
      next = recordRun(next, { cardKey: runner.cardKey, from, responsiblePitcherKey: responsible, pitcherOnMoundKey: onMound, counted: false, scoreAfter: null })
      continue
    }
    const wasTiedOrBehind = next.score.home <= next.score.away
    let update: Partial<GameState> = {
      score: { ...next.score, [side]: next.score[side] + 1 },
      runsByInning: creditRunsToInning(next.runsByInning, side, next.inning, 1),
    }
    if (responsible) {
      const chargedKey = pitcherInstanceKey(defense, responsible)
      if (responsible === onMound) {
        if (shutoutBonusActive(next, defense, responsible)) {
          update = { ...update, pitcherShutoutBonusBrokenAtOuts: { ...(next.pitcherShutoutBonusBrokenAtOuts ?? {}), [chargedKey]: appearanceOuts(next, defense, responsible) } }
        }
      } else if (onMound) {
        const moundKey = pitcherInstanceKey(defense, onMound)
        if (shutoutBonusActive(next, defense, onMound)) {
          update = { ...update, pitcherShutoutBonusEndedAtOuts: { ...(next.pitcherShutoutBonusEndedAtOuts ?? {}), [moundKey]: appearanceOuts(next, defense, onMound) } }
        }
        update = { ...update, pitcherInheritedRunsScored: bump(next.pitcherInheritedRunsScored, moundKey) }
      }
      update = { ...update, pitcherRunsAllowed: bump(next.pitcherRunsAllowed, chargedKey) }
    }
    next = { ...next, ...update }
    next = recordRun(next, { cardKey: runner.cardKey, from, responsiblePitcherKey: responsible, pitcherOnMoundKey: onMound, counted: true, scoreAfter: { ...next.score } })
    if (side === 'home' && wasTiedOrBehind && walkoffWon(next)) next = recordWinningRun(next, { cardKey: runner.cardKey, from })
  }
  return next
}

/** The pitcher a new batter-runner is charged to: whoever is pitching to him. */
export function withResponsibility(state: GameState, runner: BaseRunnerState): BaseRunnerState {
  if (!usesRulesV2(state)) return runner
  if (runner.responsiblePitcherKey) return runner
  const key = currentPitcherKey(state)
  return key ? { ...runner, responsiblePitcherKey: key } : runner
}

/**
 * OBR 9.16(g) / EDSR-RESP: a batter who reaches on a fielder's choice that
 * retires runners takes the responsibility of the most advanced runner retired.
 * `retired` is ordered most advanced first.
 */
export function transferResponsibility(state: GameState, batter: BaseRunnerState, retired: Array<BaseRunnerState | null | undefined>): BaseRunnerState {
  if (!usesRulesV2(state)) return batter
  const lead = retired.find((runner): runner is BaseRunnerState => Boolean(runner))
  if (!lead?.responsiblePitcherKey) return batter
  return { ...batter, responsiblePitcherKey: lead.responsiblePitcherKey }
}
