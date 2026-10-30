import { CardArt } from './CardZoom'
import { battingSide } from '../gameBoundaryEngine'
import type { DefensivePosition, GameSide, GameState } from '../types'

/**
 * The batting side's order, down the left rail.
 *
 * Row anatomy is the one recorded in .design-mockup/_rail.txt:
 *   [3px state bar][order][card][name / position / stat line]
 * with active carrying the gold bar, tinted ground and bright name, and on
 * deck carrying a muted bar and no ground.
 *
 * Card art is real -- every card in a frozen roster snapshot carries an
 * imageUrl, so this shows the actual card rather than the artboard's gradient
 * placeholder. Read-only: batting order, lineup cursor and alignment are all
 * public state.
 */

function positionOf(state: GameState, side: GameSide, cardKey: string): DefensivePosition | null {
  const alignment = state.pregame[side].defensiveAlignment
  const found = (Object.keys(alignment) as DefensivePosition[]).find((p) => alignment[p] === cardKey)
  return found ?? null
}

export default function LineupRail({ state }: { state: GameState }) {
  const side = battingSide(state.half)
  const order = state.pregame[side].battingOrderCardKeys
  const roster = state.pregame[side].roster
  // The cursor is the next batter due up; it wraps every nine.
  const activeIndex = order.length ? state.lineupCursor[side] % order.length : -1
  const onDeckIndex = order.length ? (activeIndex + 1) % order.length : -1
  const live = state.status !== 'complete'

  return (
    <div className="gp-lineup">
      <header className="gp-lineup-head">
        <strong>{state.managers[side].managerName}</strong>
        <span className="s-sub">{live ? 'Batting' : 'Final'}</span>
      </header>

      <ol className="gp-lineup-list">
        {order.map((cardKey, index) => {
          const card = roster?.cards[cardKey]
          const position = positionOf(state, side, cardKey)
          const isActive = live && index === activeIndex
          const isOnDeck = live && index === onDeckIndex
          return (
            <li
              key={`${cardKey}-${index}`}
              className={`gp-lineup-row${isActive ? ' is-active' : ''}${isOnDeck ? ' is-ondeck' : ''}`}
            >
              <i className="gp-lineup-bar" aria-hidden="true" />
              <span className="gp-lineup-order s-num">{index + 1}</span>
              {card?.imageUrl
                ? <CardArt card={card} className="gp-lineup-card" />
                : <span className="gp-lineup-card"><i className="gp-lineup-card-empty" aria-hidden="true" /></span>}
              <span className="gp-lineup-who">
                <b>{card?.playerName ?? cardKey}</b>
                <small>
                  {position ?? '—'}
                  {card?.hitter.onBase !== null && card?.hitter.onBase !== undefined && (
                    <> · OB {card.hitter.onBase}</>
                  )}
                </small>
              </span>
              {/* Per-batter AB/H are not tracked by the engine. An em-dash holds
                  the column so the row is honest about what is coming rather
                  than silently omitting it -- see GAMEPLAY_PRESENTATION_PLAN.md. */}
              <span className="gp-lineup-line s-num" title="Per-batter stat lines are not tracked yet">—</span>
            </li>
          )
        })}
      </ol>

      <p className="gp-lineup-note">Batting lines are not tracked by the engine yet.</p>
    </div>
  )
}
