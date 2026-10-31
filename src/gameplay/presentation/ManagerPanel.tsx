import type { ReactNode } from 'react'
import { effectiveCurrentHitterOnBase, effectiveCurrentPitcherControl } from '../engine'
import type { GameSide, GameState } from '../types'
import { batsLabel, throwsLabel } from './handedness'

/**
 * The one place manager tools open (Elements 2.0): a panel laid over the
 * matchup column, never over the field, so runners and fielders stay in view
 * while a decision is made. Covering the cards costs the matchup, so the
 * panel leads with a compact summary of it -- who is batting and pitching,
 * their live ratings, and the situation -- and the panel body scrolls under
 * it while anything pinned at the bottom (Confirm) stays put.
 *
 * On a tablet or phone the same panel is a bottom sheet (gameplay-screen.css).
 */

function Situation({ state }: { state: GameState }) {
  const offense: GameSide = state.half === 'top' ? 'away' : 'home'
  const defense: GameSide = offense === 'home' ? 'away' : 'home'
  const batter = state.plateAppearance.batterCardKey ? state.pregame[offense].roster?.cards[state.plateAppearance.batterCardKey] : null
  const pitcher = state.plateAppearance.pitcherCardKey ? state.pregame[defense].roster?.cards[state.plateAppearance.pitcherCardKey] : null
  const on = [state.bases.first && '1st', state.bases.second && '2nd', state.bases.third && '3rd'].filter(Boolean)
  const hand = (h: string | null) => (h ? ` ${h}` : '')
  return (
    <div className="gp-mp-summary" aria-label="Matchup summary">
      <p className="gp-mp-matchup">
        <span><b>{batter?.playerName ?? '—'}</b><small>{hand(batsLabel(batter?.hitter.bats))} · OB {effectiveCurrentHitterOnBase(state)}</small></span>
        <i>vs</i>
        <span><b>{pitcher?.playerName ?? '—'}</b><small>{hand(throwsLabel(pitcher?.pitcher.arm))} · CTRL {effectiveCurrentPitcherControl(state)}</small></span>
      </p>
      <p className="gp-mp-situation s-num">
        {state.half === 'top' ? '▲' : '▼'}{state.inning} · {state.outs} out · {on.length ? `Runners on ${on.join(', ')}` : 'Bases empty'}
        {' · '}{state.managers.away.managerName} {state.score.away}, {state.managers.home.managerName} {state.score.home}
      </p>
    </div>
  )
}

export default function ManagerPanel({ state, title, onClose, children, footer, overCards }: {
  state: GameState
  title: string
  /** Absent while a decision is pending: it is closed by resolving it. */
  onClose?: () => void
  children: ReactNode
  /** Pinned under the scrolling body. */
  footer?: ReactNode
  /** Cover only the cards row, leaving Roll, the calls and the order usable:
   * for a panel that opens on its own (the half-inning summary). */
  overCards?: boolean
}) {
  return (
    <aside className={`gp-mp${overCards ? ' is-over-cards' : ''}`} aria-label={title}>
      <header className="gp-mp-head">
        <Situation state={state} />
        {onClose && <button type="button" className="gp-mp-close" onClick={onClose} aria-label={`Close ${title}`}>×</button>}
      </header>
      <div className="gp-mp-body">{children}</div>
      {footer && <div className="gp-mp-foot">{footer}</div>}
    </aside>
  )
}
