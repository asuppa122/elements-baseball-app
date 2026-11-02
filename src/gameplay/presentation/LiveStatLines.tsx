import type { GameState } from '../types'
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
 */

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
      </div>
    </div>
  )
}
