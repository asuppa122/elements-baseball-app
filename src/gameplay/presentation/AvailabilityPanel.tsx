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

function Group({ label, cards }: { label: string; cards: GameCardSnapshot[] }) {
  return (
    <div className="gp-avail-group">
      <header><b className="s-lbl">{label}</b><span className="s-sub s-num">{cards.length}</span></header>
      {cards.length === 0
        ? <p className="gp-avail-empty">None remaining.</p>
        : <ul className="gp-avail-list">{cards.map((c) => <Row key={c.cardKey} card={c} />)}</ul>}
    </div>
  )
}

export default function AvailabilityPanel({ state }: { state: GameState }) {
  const fielding: GameSide = state.half === 'top' ? 'home' : 'away'
  const { bullpen, bench } = availableFor(state, fielding)

  return (
    <section className="gp-avail" aria-label="Available players">
      <header className="gp-avail-head">
        <b className="s-lbl">Available</b>
        <span className="s-sub">{state.managers[fielding].managerName}</span>
      </header>
      <Group label="Bullpen" cards={bullpen} />
      <Group label="Bench" cards={bench} />
    </section>
  )
}
