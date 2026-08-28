import { pitcherAdvantageIsAutomatic } from '../engine'
import type { GameState } from '../types'

/**
 * The roll: what has happened this plate appearance, and the button that
 * advances it. Lives in the rail so the centre column is nothing but the game.
 */

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="gp-roll-cell">
      <b className="s-lbl">{label}</b>
      <strong className={`s-num${tone ? ` ${tone}` : ''}`}>{value}</strong>
    </div>
  )
}

export default function RollControls({ state, saving, hasDecision, onRollPitch, onRollSwing, onNoPitch }: {
  state: GameState
  saving: boolean
  hasDecision: boolean
  onRollPitch: () => void
  onRollSwing: () => void
  onNoPitch: () => void
}) {
  const pa = state.plateAppearance
  const advantage = pa.advantage
  const tone = advantage === 'hitter' ? 'is-hitter' : advantage === 'pitcher' ? 'is-pitcher' : undefined
  const live = state.status !== 'complete' && !hasDecision

  return (
    <section className="gp-rollbox" aria-label="Roll">
      <div className="gp-roll">
        <Cell label="Pitch" value={pa.pitchRoll !== null ? String(pa.pitchRoll) : '—'} />
        <Cell label="Adv" value={advantage ? advantage.toUpperCase() : '—'} tone={tone} />
        <Cell label="Swing" value={pa.swingRoll !== null ? String(pa.swingRoll) : '—'} />
        <Cell label="Result" value={pa.chartResult ?? '—'} />
      </div>

      {state.status === 'complete' && <p className="gp-actions-msg">This game is final.</p>}

      {live && state.waitingFor === 'PITCH_ROLL' && (
        pitcherAdvantageIsAutomatic(state)
          ? <button className="gp-action" disabled={saving} onClick={onNoPitch}>No pitch — pitcher advantage</button>
          : <button className="gp-action" disabled={saving} onClick={onRollPitch}>Roll pitch</button>
      )}
      {live && state.waitingFor === 'SWING_ROLL' && (
        <button className="gp-action" disabled={saving} onClick={onRollSwing}>Roll swing</button>
      )}
    </section>
  )
}
