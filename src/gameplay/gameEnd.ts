import type { GameState } from './types'

/**
 * How a game ended, and whether it can still be cancelled -- the client's
 * reading of the rules the database enforces (20261031_gameplay_one_active_game.sql).
 * The server decides; these only choose what to show.
 */

export type GameEnd = 'complete' | 'cancelled' | 'terminated'

export function gameEnded(status: string | undefined): status is GameEnd {
  return status === 'complete' || status === 'cancelled' || status === 'terminated'
}

/**
 * Before the first pitch: still in pregame, or started with no pitch rolled
 * and no plate appearance finished (a leadoff intentional walk counts as the
 * first pitch -- the engine sets firstPitchThrown). The server also checks
 * its own record of dice and rolls, which this cannot see.
 */
export function canCancelBeforeFirstPitch(state: GameState): boolean {
  if (gameEnded(state.status)) return false
  if (state.status === 'setup' || state.status === 'pregame' || state.status === 'ready') return true
  return state.firstPitchThrown === false
    && state.plateAppearance.pitchRoll === null
    && state.plateAppearance.swingRoll === null
}

/** One line for an ended game, or null while it is unfinished. */
export function endedLabel(status: string | undefined, endReason?: string | null): string | null {
  if (status === 'cancelled') return 'Cancelled before the first pitch — no result'
  if (status === 'terminated') return endReason === 'practice_cleanup'
    ? 'Practice game closed — no result'
    : 'Ended by an admin — no result'
  return null
}
