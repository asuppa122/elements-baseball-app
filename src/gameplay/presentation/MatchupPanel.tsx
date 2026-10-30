import { effectiveCurrentHitterOnBase, effectiveCurrentPitcherControl } from '../engine'
import { currentHitterOnBaseAdjustment, currentPitcherControlAdjustment } from './inGameFatigueDisplay'
import RatingReadout from './RatingReadout'
import { CardArt } from './CardZoom'
import { batsLabel, throwsLabel } from './handedness'
import type { GameCardSnapshot, GameSide, GameState } from '../types'

/**
 * The confrontation: who is batting, who is pitching, and the roll so far.
 *
 * The fatigue-adjusted ratings come from the display layer already built and
 * verified this week (RatingReadout + inGameFatigueDisplay), so printed ->
 * effective and its cause tags behave identically to the working shell rather
 * than being re-derived here.
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

function Roll({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="gp-roll-cell">
      <b className="s-lbl">{label}</b>
      <strong className={`s-num${tone ? ` ${tone}` : ''}`}>{value}</strong>
    </div>
  )
}

export default function MatchupPanel({ state }: { state: GameState }) {
  const offense: GameSide = state.half === 'top' ? 'away' : 'home'
  const defense: GameSide = offense === 'home' ? 'away' : 'home'
  const pa = state.plateAppearance
  const batter = pa.batterCardKey ? state.pregame[offense].roster?.cards[pa.batterCardKey] ?? null : null
  const pitcher = pa.pitcherCardKey ? state.pregame[defense].roster?.cards[pa.pitcherCardKey] ?? null : null

  const advantage = pa.advantage
  const advantageTone = advantage === 'hitter' ? 'is-hitter' : advantage === 'pitcher' ? 'is-pitcher' : undefined

  return (
    <section className="gp-panel gp-matchup" aria-label="Matchup">
      <div className="gp-matchup-sides">
        <div className="gp-matchup-side">
          <Card card={batter} role="Hitter" hand={batsLabel(batter?.hitter.bats)} />
          <div className="gp-matchup-rates">
            <RatingReadout label="OB" effective={effectiveCurrentHitterOnBase(state)} adjustment={currentHitterOnBaseAdjustment(state)} />
            <span className="s-sub s-num">BSR {batter?.hitter.baserunning ?? '—'}</span>
          </div>
        </div>

        <div className="gp-matchup-vs" aria-hidden="true">vs</div>

        <div className="gp-matchup-side">
          <Card card={pitcher} role="Pitcher" hand={throwsLabel(pitcher?.pitcher.arm)} />
          <div className="gp-matchup-rates">
            <RatingReadout label="CTRL" effective={effectiveCurrentPitcherControl(state)} adjustment={currentPitcherControlAdjustment(state)} />
            <span className="s-sub s-num">IP {pitcher?.pitcher.ip ?? '—'}</span>
          </div>
        </div>
      </div>

      <div className="gp-roll">
        <Roll label="Pitch" value={pa.pitchRoll !== null ? String(pa.pitchRoll) : '—'} />
        <Roll label="Advantage" value={advantage ? advantage.toUpperCase() : '—'} tone={advantageTone} />
        <Roll label="Swing" value={pa.swingRoll !== null ? String(pa.swingRoll) : '—'} />
        <Roll label="Result" value={pa.chartResult ?? '—'} />
      </div>
    </section>
  )
}
