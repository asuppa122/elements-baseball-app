import { effectiveCurrentHitterOnBase, effectiveCurrentPitcherControl } from '../engine'
import type { GameSide, GameState } from '../types'
import { liveLinesFor } from './liveLines'

/**
 * Live statistics (STATS_SPEC §12, approved D2), under each player card -- the
 * one place the eye already is when it reads who is batting and pitching:
 * - "Game": the current batter's line (AB H R RBI HR BB SO) or the current
 *   pitcher's (IP H R ER BB SO; R = runs charged), following substitutions as
 *   they happen. A game without a play log has no line to show and says so.
 * - "Season": official Elements statistics only. None exist before launch, so
 *   it reads "No stats yet" and an exhibition game's numbers are never shown
 *   as a season.
 * - The live rating, at the end of the season row: the batter's On Base and
 *   the pitcher's Control as they stand now, fatigue included, with the
 *   printed number when they differ (the same reading as the field labels).
 */

function CurrentRating({ state, role }: { state: GameState; role: 'batter' | 'pitcher' }) {
  const offense: GameSide = state.half === 'top' ? 'away' : 'home'
  const side: GameSide = role === 'batter' ? offense : offense === 'home' ? 'away' : 'home'
  const key = role === 'batter' ? state.plateAppearance.batterCardKey : state.plateAppearance.pitcherCardKey
  const card = key ? state.pregame[side].roster?.cards[key] : null
  if (!card) return null
  const printed = role === 'batter' ? card.hitter.onBase : card.pitcher.control
  const now = role === 'batter' ? effectiveCurrentHitterOnBase(state) : effectiveCurrentPitcherControl(state)
  const label = role === 'batter' ? 'OB' : 'C'
  return (
    <span className="gp-pstats-now s-num" title={role === 'batter' ? 'Current On Base' : 'Current Control'}>
      {label} <strong className={printed !== null && now !== printed ? 'is-changed' : undefined}>{now}</strong>
      {printed !== null && now !== printed && <small> (card {printed})</small>}
    </span>
  )
}

export default function PlayerStatBlock({ state, role }: { state: GameState; role: 'batter' | 'pitcher' }) {
  const lines = liveLinesFor(state)
  return (
    <div className="gp-pstats" aria-label={role === 'batter' ? 'Batter statistics' : 'Pitcher statistics'}>
      <div className="gp-pstats-row">
        <b className="s-lbl">Game</b>
        {lines
          ? <span className="gp-pstats-cells s-num">
              {lines[role].map(([label, value]) => <span key={label}><strong>{value}</strong><i>{label}</i></span>)}
            </span>
          : <span className="gp-pstats-none">Not recorded</span>}
      </div>
      <div className="gp-pstats-row is-season">
        <b className="s-lbl">Season</b>
        <span className="gp-pstats-none">No stats yet</span>
        <CurrentRating state={state} role={role} />
      </div>
    </div>
  )
}
