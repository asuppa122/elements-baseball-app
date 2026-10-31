import type { DefensivePosition, GameCardSnapshot } from './types'

/**
 * Elements defensive assignment rule:
 * - Any rostered card may play C/1B/2B/3B/SS/LF/CF/RF.
 * - A listed position uses the card's printed fielding rating.
 * - An unlisted non-pitching position is legal at -10.
 * - P requires a valid pitcher chart.
 * - DH requires a valid hitter side.
 */
export function canAssignDefensivePosition(card: GameCardSnapshot, position: DefensivePosition): boolean {
  if (position === 'P') return card.pitcher.control !== null
  if (position === 'DH') return card.hitter.onBase !== null
  return true
}

export function getFieldingRating(card: GameCardSnapshot, position: DefensivePosition): number | null {
  if (position === 'P' || position === 'DH') return null
  return card.defense[position] ?? -10
}

/**
 * Where a player may START a game (Rulebook V): only at a position with an
 * on-card fielding score, or DH with a hitter side, or P with a pitcher card.
 * The -10 for an unlisted position is an in-game allowance only, once the
 * game's first plate appearance is complete -- canAssignDefensivePosition
 * above is that in-game rule. (P: any pitcher card, two-way players
 * included -- Anthony's ruling, 2026-10-30.)
 */
export function canStartAtPosition(card: GameCardSnapshot, position: DefensivePosition): boolean {
  if (position === 'P' || position === 'DH') return canAssignDefensivePosition(card, position)
  return typeof card.defense[position] === 'number'
}
