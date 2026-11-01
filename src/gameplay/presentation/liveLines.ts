import { computeGameStats, hasPlayRecord, inningsDisplay } from '../stats/gameStats'
import type { GameSide, GameState } from '../types'

/** This game's line for the current batter and pitcher, from the play log; null for games without one. */
export function liveLinesFor(state: GameState): { batter: Array<[string, string]>; pitcher: Array<[string, string]> } | null {
  if (!hasPlayRecord(state)) return null
  const offense: GameSide = state.half === 'top' ? 'away' : 'home'
  const defense: GameSide = offense === 'home' ? 'away' : 'home'
  const stats = computeGameStats(state)
  const b = stats.batting[offense].find((l) => l.cardKey === state.plateAppearance.batterCardKey)
  const p = stats.pitching[defense].find((l) => l.cardKey === state.plateAppearance.pitcherCardKey)
  return {
    batter: [['AB', `${b?.AB ?? 0}`], ['H', `${b?.H ?? 0}`], ['R', `${b?.R ?? 0}`], ['RBI', `${b?.RBI ?? 0}`], ['HR', `${b?.HR ?? 0}`], ['BB', `${b?.BB ?? 0}`], ['SO', `${b?.SO ?? 0}`]],
    pitcher: [['IP', inningsDisplay(p?.outs ?? 0)], ['H', `${p?.H ?? 0}`], ['R', `${p?.R ?? 0}`], ['ER', `${p?.ER ?? 0}`], ['BB', `${p?.BB ?? 0}`], ['SO', `${p?.SO ?? 0}`]],
  }
}
