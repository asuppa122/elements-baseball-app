import { availableFor } from './availability'
import type { GameCardSnapshot, GameSide, GameState } from '../types'

/**
 * The fielding side's remaining bullpen and bench. Shown for the defence,
 * because that is the manager who can act on it -- a pitching change or a
 * defensive substitution.
 */

function Row({ card }: { card: GameCardSnapshot }) {
  const isPitcher = card.pitcher.control !== null
  return (
    <li className="gp-avail-row">
      <span className="gp-avail-name">{card.playerName}</span>
      <span className="gp-avail-rates s-num">
        {isPitcher
          ? <>CTRL {card.pitcher.control} · IP {card.pitcher.ip ?? '—'}</>
          : <>OB {card.hitter.onBase ?? '—'} · BSR {card.hitter.baserunning ?? '—'}</>}
      </span>
    </li>
  )
}

/* Collapsible: the rail carries a lot, and who is left in the bullpen only
 * matters when a manager is about to use them. Open by default would push the
 * log and the roll controls off the rail on a short screen. */
function Group({ label, cards }: { label: string; cards: GameCardSnapshot[] }) {
  return (
    <details className="gp-avail-group">
      <summary>
        <b className="s-lbl">{label}</b>
        <span className="s-sub s-num">{cards.length}</span>
      </summary>
      {cards.length === 0
        ? <p className="gp-avail-empty">None remaining.</p>
        : <ul className="gp-avail-list">{cards.map((c) => <Row key={c.cardKey} card={c} />)}</ul>}
    </details>
  )
}

export default function AvailabilityPanel({ state }: { state: GameState }) {
  const fielding: GameSide = state.half === 'top' ? 'home' : 'away'
  const { bullpen, bench } = availableFor(state, fielding)

  return (
    <section className="gp-avail" aria-label="Available players">
      <Group label={`Bullpen · ${state.managers[fielding].managerName}`} cards={bullpen} />
      <Group label={`Bench · ${state.managers[fielding].managerName}`} cards={bench} />
    </section>
  )
}
