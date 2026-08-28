import { battingSide } from '../gameBoundaryEngine'
import type { GameSide, GameState } from '../types'

/**
 * How big this moment is.
 *
 * A read-only classifier over state the engine already holds -- inning, score
 * margin, outs, who is on base. It decides nothing about baseball and is never
 * consulted by resolution; it exists so presentation can escalate (a bigger
 * reveal, a takeover) proportionally instead of treating a walk-off chance and
 * a routine first-inning grounder the same way.
 *
 * Kept deliberately conservative: 'peak' should feel rare, so it is reserved
 * for a run that would actually end the game.
 */

export type MomentTier = 'routine' | 'notable' | 'high' | 'peak'

export type Moment = {
  tier: MomentTier
  /** Every reason that fired, for display and for debugging a surprising tier. */
  reasons: string[]
  runnersInScoringPosition: number
  margin: number
  /** The batting side can tie or take the lead with one swing. */
  tyingOrLeadRunAtPlate: boolean
}

const LATE_INNING = 7

function runnersOn(state: GameState): number {
  return [state.bases.first, state.bases.second, state.bases.third].filter(Boolean).length
}

function inScoringPosition(state: GameState): number {
  return [state.bases.second, state.bases.third].filter(Boolean).length
}

export function classifyMoment(state: GameState): Moment {
  const batting: GameSide = battingSide(state.half)
  const fielding: GameSide = batting === 'home' ? 'away' : 'home'
  const margin = state.score[fielding] - state.score[batting]
  const risp = inScoringPosition(state)
  const reasons: string[] = []

  // The batting side is behind (or level) by no more than the runners already
  // on plus the batter -- i.e. one swing can tie it or take the lead.
  const tyingOrLeadRunAtPlate = margin >= 0 && margin <= runnersOn(state) + 1

  // A run here ends the game: home batting, ninth or later, trailing by no
  // more than what is on base. That is the only thing that earns 'peak'.
  // `batting === 'home'` already means the bottom half -- battingSide() derives
  // one from the other -- so no half check belongs here. A mutation run caught
  // the redundant condition: removing it failed nothing, because it could
  // never be false when the first clause was true.
  const walkOffChance = batting === 'home'
    && state.inning >= 9
    && margin >= 0
    && margin <= runnersOn(state) + 1

  if (walkOffChance) reasons.push('WALK_OFF_CHANCE')
  if (state.inning >= LATE_INNING) reasons.push('LATE_INNING')
  if (risp > 0) reasons.push('RUNNERS_IN_SCORING_POSITION')
  if (state.outs === 2 && risp > 0) reasons.push('TWO_OUT_RISP')
  if (Math.abs(margin) <= 1) reasons.push('ONE_RUN_GAME')
  if (tyingOrLeadRunAtPlate) reasons.push('TYING_OR_LEAD_RUN_AT_PLATE')

  let tier: MomentTier = 'routine'
  if (risp > 0 || Math.abs(margin) <= 1) tier = 'notable'
  if (state.inning >= LATE_INNING && (risp > 0 || Math.abs(margin) <= 2)) tier = 'high'
  if (walkOffChance && (risp > 0 || state.outs === 2 || Math.abs(margin) <= 1)) tier = 'peak'

  // A finished game is never a live moment, whatever the state says.
  if (state.status === 'complete') return {
    tier: 'routine', reasons: ['GAME_COMPLETE'], runnersInScoringPosition: risp, margin, tyingOrLeadRunAtPlate: false,
  }

  return { tier, reasons, runnersInScoringPosition: risp, margin, tyingOrLeadRunAtPlate }
}
