import { pitcherAdvantageIsAutomatic } from '../engine'
import { endedLabel, gameEnded } from '../gameEnd'
import { awaitingOffenseReady } from '../turnOrder'
import type { GameState } from '../types'

/**
 * The button that advances the plate appearance, or why there is none (the
 * other manager's turn, the game is over). Drawn inside the At-bat card, which
 * shows the rolls themselves.
 */

export default function RollControls({
  state, saving, hasDecision, canAct = true, waitingOn = null, onReady, onRollPitch, onRollSwing, onNoPitch,
}: {
  state: GameState
  saving: boolean
  hasDecision: boolean
  /** Two-player games: false while it is the other manager's move. */
  canAct?: boolean
  /** Two-player games: the manager being waited on, for the message. */
  waitingOn?: string | null
  onReady?: () => void
  onRollPitch: () => void
  onRollSwing: () => void
  onNoPitch: () => void
}) {
  const ended = gameEnded(state.status)
  const live = !ended && state.status !== 'paused' && !hasDecision && canAct
  const readyUp = live && awaitingOffenseReady(state)

  return (
    <div className="gp-atbat-roll" aria-label="Roll">

      {state.status === 'complete' && <p className="gp-actions-msg">This game is final.</p>}
      {ended && state.status !== 'complete' && <p className="gp-actions-msg">{endedLabel(state.status)}.</p>}

      {readyUp && onReady && (
        <>
          <p className="gp-roll-hint">Make any calls first — steal, bunt, pinch hitter — then ready up.</p>
          <button className="gp-action" disabled={saving} onClick={onReady}>Ready</button>
        </>
      )}
      {!readyUp && live && state.waitingFor === 'PITCH_ROLL' && (
        pitcherAdvantageIsAutomatic(state)
          ? <button className="gp-action" disabled={saving} onClick={onNoPitch}>No pitch — pitcher advantage</button>
          : <button className="gp-action" disabled={saving} onClick={onRollPitch}>Roll pitch</button>
      )}
      {live && state.waitingFor === 'SWING_ROLL' && (
        <button className="gp-action" disabled={saving} onClick={onRollSwing}>Roll swing</button>
      )}
      {waitingOn && !hasDecision && !ended && (
        <p className="gp-roll-wait" role="status">Waiting on {waitingOn}…</p>
      )}
    </div>
  )
}
