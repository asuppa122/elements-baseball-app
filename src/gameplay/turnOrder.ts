import type { GameSide, GameState } from './types'

/**
 * Whose move it is, in a game played by two people.
 *
 * Before each pitch both managers may make calls. With two real people at two
 * screens that is a race -- the defence could roll the pitch before the
 * offence has decided to steal or bunt. Elements resolves it the way ERA does
 * (Anthony, 2026-10-29): the batting manager makes any calls and declares
 * ready; only then may the fielding manager make its calls and pitch. Any
 * decision that returns play to the pitch re-opens the offence, so a pitching
 * change can still be answered with a pinch hitter.
 *
 * This applies only to a game created as two-player (`turnHandshake`). The lab,
 * the sandbox and every scenario fixture are one person playing both sides, so
 * they are untouched.
 *
 * `save_gameplay_lab_state` mirrors `sideToAct` in SQL to decide which manager
 * may submit the next state. Change one, change both.
 */

const offense = (state: GameState): GameSide => (state.half === 'top' ? 'away' : 'home')
const defense = (state: GameState): GameSide => (state.half === 'top' ? 'home' : 'away')

/** Offence calls that belong before the batting manager declares ready. */
export const OFFENSE_PRE_PITCH_ACTIONS = new Set(['NATURAL_STEAL', 'SAC_BUNT', 'SQUEEZE_BUNT', 'PINCH_HITTER', 'PINCH_RUNNER'])

export function awaitingOffenseReady(state: GameState): boolean {
  return state.turnHandshake === true
    && state.status === 'in_progress'
    && state.waitingFor === 'PITCH_ROLL'
    && !state.pendingDecision
    && state.plateAppearance.offenseReady !== true
}

/**
 * The side that must act next, or null when nobody is waited on (pregame,
 * complete, paused). A pending decision always names its own acting side.
 */
export function sideToAct(state: GameState): GameSide | null {
  if (state.status !== 'in_progress' && state.status !== 'awaiting_decision' && state.status !== 'inning_transition') return null
  if (state.pendingDecision) return state.pendingDecision.actingSide
  if (state.waitingFor === 'PITCH_ROLL') return awaitingOffenseReady(state) ? offense(state) : defense(state)
  if (state.waitingFor === 'SWING_ROLL') return offense(state)
  return state.nextActor
}
