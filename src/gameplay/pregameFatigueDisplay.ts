import { effectiveHitterOnBase, effectivePitcherControl } from './fatigueEngine'
import type { GameCardSnapshot } from './types'

/**
 * Fatigue-adjusted rating for pregame display only -- before any game has
 * actually started, so no in-game distance/performance penalties apply yet,
 * just the persistent pre-game Ftg/Rm debt (fatigueEngine.ts's own formulas,
 * untouched). Returns null when there's no rest debt at all, so callers can
 * skip rendering anything extra for a fully rested player.
 */
export function pregameEffectiveOnBase(
  card: GameCardSnapshot,
  restState: Record<string, { hitterGamesRemaining: number }>,
): number | null {
  if (card.hitter.onBase === null) return null
  const gamesFromRested = restState[card.cardKey]?.hitterGamesRemaining ?? 0
  if (gamesFromRested === 0) return null
  return effectiveHitterOnBase(card.hitter.onBase, gamesFromRested, false)
}

export function pregameEffectiveControl(
  card: GameCardSnapshot,
  restState: Record<string, { pitcherGamesRemaining: number }>,
): number | null {
  if (card.pitcher.control === null) return null
  const gamesFromRested = restState[card.cardKey]?.pitcherGamesRemaining ?? 0
  if (gamesFromRested === 0) return null
  return effectivePitcherControl({ printedControl: card.pitcher.control, gamesFromRested, cardIp: card.pitcher.ip, outsRecorded: 0, earnedRunsAllowed: 0 })
}
