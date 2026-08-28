import { getFieldingRating } from '../defense'
import { formatDef } from './fieldGeometry'
import type { DefensivePosition, GameSide, GameState } from '../types'

/**
 * The defensive readout above the field: C / INF / OF, for whichever side is
 * currently fielding.
 *
 * Ratings come from `getFieldingRating`, the shared exported helper in
 * defense.ts that the engine itself uses -- not from a second copy of the
 * rule. This reads public state only; nothing in the engine is touched.
 */

const INFIELD: DefensivePosition[] = ['1B', '2B', '3B', 'SS']
const OUTFIELD: DefensivePosition[] = ['LF', 'CF', 'RF']

function ratingAt(state: GameState, side: GameSide, position: DefensivePosition): number | null {
  const cardKey = state.pregame[side].defensiveAlignment[position]
  const card = cardKey ? state.pregame[side].roster?.cards[cardKey] : null
  return card ? getFieldingRating(card, position) : null
}

function Group({ label, items }: { label: string; items: Array<[string, number | null]> }) {
  return (
    <div className="gp-defbar-group">
      <b className="s-lbl">{label}</b>
      {items.map(([position, value]) => (
        <span className="gp-defbar-item" key={position}>
          <small>{position}</small>
          <strong className={`s-num${value !== null && value < 0 ? ' is-negative' : ''}`}>{formatDef(value)}</strong>
        </span>
      ))}
    </div>
  )
}

export default function DefBar({ state }: { state: GameState }) {
  const fielding: GameSide = state.half === 'top' ? 'home' : 'away'
  const at = (position: DefensivePosition): [string, number | null] => [position, ratingAt(state, fielding, position)]

  return (
    <div className="gp-panel gp-defbar" aria-label={`${state.managers[fielding].managerName} defense`}>
      <Group label="C Def" items={[at('C')]} />
      <i className="gp-defbar-divider" aria-hidden="true" />
      <Group label="Inf Def" items={INFIELD.map(at)} />
      <i className="gp-defbar-divider" aria-hidden="true" />
      <Group label="Of Def" items={OUTFIELD.map(at)} />
    </div>
  )
}
