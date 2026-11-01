import type { GameState } from '../types'
import { liveLinesFor } from './liveLines'

/**
 * Live statistics (STATS_SPEC §12, approved D2):
 * - beside the scoreboard, two stacked compact lines -- the current batter's
 *   game line (AB H R RBI HR BB SO) and the current pitcher's (IP H R ER BB
 *   SO; R = runs charged) -- following substitutions as they happen;
 * - under the player cards, the season strip: official Elements statistics
 *   only. None exist before launch, so it reads "No season stats yet" and an
 *   exhibition game's numbers are never shown as a season.
 */

function nameOf(state: GameState, role: 'batter' | 'pitcher'): string {
  const offense = state.half === 'top' ? 'away' : 'home'
  const side = role === 'batter' ? offense : offense === 'home' ? 'away' : 'home'
  const key = role === 'batter' ? state.plateAppearance.batterCardKey : state.plateAppearance.pitcherCardKey
  return (key && state.pregame[side].roster?.cards[key]?.playerName) || '—'
}

export default function LiveGameLines({ state }: { state: GameState }) {
  const lines = liveLinesFor(state)
  if (!lines) return null
  return (
    <div className="gp-live-lines" aria-label="This game">
      {(['batter', 'pitcher'] as const).map((role) => (
        <p key={role} className="gp-live-line">
          <b className="s-lbl">{role === 'batter' ? 'Bat' : 'Pit'}</b>
          <span className="gp-live-name">{nameOf(state, role)}</span>
          <span className="gp-live-stats s-num">
            {lines[role].map(([label, value]) => <span key={label}>{value}<i>{label}</i></span>)}
          </span>
        </p>
      ))}
    </div>
  )
}

export function SeasonStrip({ role }: { role: 'batter' | 'pitcher' }) {
  return (
    <p className="gp-season-strip">
      <b className="s-lbl">{role === 'batter' ? 'AVG · HR · RBI · OPS' : 'ERA · W-L · SO · WHIP'}</b>
      <span>No season stats yet</span>
    </p>
  )
}
