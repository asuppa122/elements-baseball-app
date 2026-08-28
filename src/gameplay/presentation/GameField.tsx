import { getFieldingRating } from '../defense'
import { BATTER_BOX, FIELDER_PAINT_ORDER, FIELDER_POINTS, RUNNER_POINTS, formatDef } from './fieldGeometry'
import type { BaseRunnerState, DefensivePosition, GameSide, GameState } from '../types'

/**
 * The field: nine fielders as cards at their true positions, the batter at the
 * plate on the side he actually bats from, and whoever is on base.
 *
 * The batter being here is why there is no separate matchup panel -- the
 * confrontation IS the card at the plate against the card on the mound, which
 * is how it reads on a real board.
 *
 * Everything is public game state: the defensive alignment (which follows
 * substitutions on its own), the frozen card snapshots, and state.bases. No
 * engine call, no writes.
 */

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return full
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

function CardChip({ imageUrl, label, name, rating, className, style }: {
  imageUrl: string | null
  label: string
  name: string
  rating: string | null
  className: string
  style: React.CSSProperties
}) {
  return (
    <div className={className} style={style}>
      <span className="gp-fc-art">
        {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <i aria-hidden="true" />}
      </span>
      <span className="gp-fc-meta">
        <b>{label}</b>
        <span className="gp-fc-name">{name}</span>
        {rating && <span className="gp-fc-rating s-num">{rating}</span>}
      </span>
    </div>
  )
}

function Fielder({ state, side, position }: { state: GameState; side: GameSide; position: DefensivePosition }) {
  const cardKey = state.pregame[side].defensiveAlignment[position]
  const card = cardKey ? state.pregame[side].roster?.cards[cardKey] : null
  const point = FIELDER_POINTS[position as Exclude<DefensivePosition, 'DH'>]
  if (!point) return null

  // Pitchers carry no fielding rating in Elements, so the pitcher shows his
  // Control instead of a fabricated "+0".
  const rating = position === 'P'
    ? (card?.pitcher.control !== null && card?.pitcher.control !== undefined ? `CTRL ${card.pitcher.control}` : null)
    : (card ? formatDef(getFieldingRating(card, position)) : null)

  return (
    <CardChip
      className={`gp-fc gp-fc-fielder${position === 'P' ? ' is-pitcher' : ''}`}
      style={{ left: `${point.left}%`, top: `${point.top}%` }}
      imageUrl={card?.imageUrl ?? null}
      label={position}
      name={card ? shortName(card.playerName) : '—'}
      rating={rating}
    />
  )
}

function Batter({ state }: { state: GameState }) {
  const offense: GameSide = state.half === 'top' ? 'away' : 'home'
  const key = state.plateAppearance.batterCardKey
  const card = key ? state.pregame[offense].roster?.cards[key] : null
  if (!card) return null

  // Only an explicit L bats from the left box; switch hitters and unrecorded
  // handedness stand in the right-handed box rather than being guessed at.
  const bats = card.hitter.bats === 'L' ? 'L' : 'R'
  const point = BATTER_BOX[bats]

  return (
    <CardChip
      className="gp-fc gp-fc-batter"
      style={{ left: `${point.left}%`, top: `${point.top}%` }}
      imageUrl={card.imageUrl}
      label={`AT BAT · ${card.hitter.bats ?? '?'}`}
      name={shortName(card.playerName)}
      rating={card.hitter.onBase !== null ? `OB ${card.hitter.onBase}` : null}
    />
  )
}

function Runner({ base, runner }: { base: 'first' | 'second' | 'third'; runner: BaseRunnerState }) {
  const point = RUNNER_POINTS[base]
  return (
    <div className="gp-runner" style={{ left: `${point.left}%`, top: `${point.top}%` }}>
      <span className="gp-runner-name">{shortName(runner.playerName)}</span>
      <span className="gp-runner-rates s-num">
        <i>BsR {runner.baserunning ?? '—'}</i>
        {runner.stolenBase !== null && <i>SB {runner.stolenBase}</i>}
      </span>
    </div>
  )
}

export default function GameField({ state }: { state: GameState }) {
  const fielding: GameSide = state.half === 'top' ? 'home' : 'away'
  const bases: Array<['first' | 'second' | 'third', BaseRunnerState | null]> = [
    ['third', state.bases.third],
    ['second', state.bases.second],
    ['first', state.bases.first],
  ]

  return (
    <div className="gp-field" aria-label="Field">
      <img className="gp-field-img" src="/gameplay-field.webp" alt="" />
      {FIELDER_PAINT_ORDER.map((position) => (
        <Fielder key={position} state={state} side={fielding} position={position} />
      ))}
      <Batter state={state} />
      {bases.map(([base, runner]) => (runner ? <Runner key={base} base={base} runner={runner} /> : null))}
    </div>
  )
}
