import PlayerStatBlock from './LiveStatLines'
import { CardArt } from './CardZoom'
import { batsLabel, throwsLabel } from './handedness'
import type { GameCardSnapshot, GameSide, GameState } from '../types'

/**
 * The confrontation: who is batting, who is pitching, and their statistics.
 * The printed ratings are on the cards themselves, and the live
 * (fatigue-adjusted) Control and On Base are on the field, under the pitcher
 * and the batter -- so neither is repeated here. The rolls are the At-bat
 * card's.
 */

function Card({ card, role, hand }: { card: GameCardSnapshot | null; role: string; hand: string | null }) {
  return (
    <div className="gp-matchup-card">
      <CardArt card={card} className="gp-matchup-art" />
      <span className="gp-matchup-who">
        <b className="s-lbl">{role}</b>
        {/* Handedness at a glance -- no enlarging the card to find it. */}
        <strong>{card?.playerName ?? '—'}{hand && <> <span className="gp-hand">{hand}</span></>}</strong>
      </span>
    </div>
  )
}

export default function MatchupPanel({ state }: { state: GameState }) {
  const offense: GameSide = state.half === 'top' ? 'away' : 'home'
  const defense: GameSide = offense === 'home' ? 'away' : 'home'
  const pa = state.plateAppearance
  const batter = pa.batterCardKey ? state.pregame[offense].roster?.cards[pa.batterCardKey] ?? null : null
  const pitcher = pa.pitcherCardKey ? state.pregame[defense].roster?.cards[pa.pitcherCardKey] ?? null : null

  return (
    <section className="gp-panel gp-matchup" aria-label="Matchup">
      <div className="gp-matchup-sides">
        <div className="gp-matchup-side">
          <Card card={batter} role="Hitter" hand={batsLabel(batter?.hitter.bats)} />
          <PlayerStatBlock state={state} role="batter" />
        </div>

        <div className="gp-matchup-vs" aria-hidden="true">vs</div>

        <div className="gp-matchup-side">
          <Card card={pitcher} role="Pitcher" hand={throwsLabel(pitcher?.pitcher.arm)} />
          <PlayerStatBlock state={state} role="pitcher" />
        </div>
      </div>
    </section>
  )
}
