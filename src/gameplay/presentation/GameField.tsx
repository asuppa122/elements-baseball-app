import { getFieldingRating } from '../defense'
import { FIELDER_PAINT_ORDER, FIELDER_POINTS, RUNNER_POINTS, formatDef } from './fieldGeometry'
import type { BaseRunnerState, DefensivePosition, GameSide, GameState } from '../types'

/**
 * The field: nine fielders at their true positions with live DEF, and whoever
 * is on base.
 *
 * Replaces the developer shell's `Diamond` -- three base markers and the word
 * HOME. Everything here is read from public game state: the defensive
 * alignment (which follows substitutions on its own), the frozen card
 * snapshots, and `state.bases`. No engine call, no writes.
 */

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return full
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

function Fielder({ state, side, position }: { state: GameState; side: GameSide; position: DefensivePosition }) {
  const cardKey = state.pregame[side].defensiveAlignment[position]
  const card = cardKey ? state.pregame[side].roster?.cards[cardKey] : null
  const point = FIELDER_POINTS[position as Exclude<DefensivePosition, 'DH'>]
  if (!point) return null

  // The pitcher has no fielding rating in Elements, so the chip shows the
  // position alone rather than a fabricated "+0".
  const rating = card ? getFieldingRating(card, position) : null

  return (
    <div
      className={`gp-fielder${position === 'P' ? ' is-pitcher' : ''}${card ? '' : ' is-empty'}`}
      style={{ left: `${point.left}%`, top: `${point.top}%` }}
    >
      <span className="gp-fielder-pos">{position}</span>
      <span className="gp-fielder-name">{card ? shortName(card.playerName) : '—'}</span>
      {rating !== null && (
        <span className={`gp-fielder-def s-num${rating < 0 ? ' is-negative' : ''}`}>{formatDef(rating)}</span>
      )}
    </div>
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
      {bases.map(([base, runner]) => (runner ? <Runner key={base} base={base} runner={runner} /> : null))}
    </div>
  )
}
