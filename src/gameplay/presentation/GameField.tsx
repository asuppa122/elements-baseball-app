import { CardArt } from './CardZoom'
import { batsLabel } from './handedness'
import { effectiveCurrentHitterOnBase, effectiveCurrentPitcherControl } from '../engine'
import { BATTER_BOX, FIELDER_PAINT_ORDER, FIELDER_POINTS, RUNNER_POINTS } from './fieldGeometry'
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

/**
 * A positional fielder: card art for identity, crisp text for the facts.
 *
 * The text is not redundant with the art. The card images are 820x1150 and
 * render here around 58px wide -- a 7% scale, at which the printed name and
 * ratings are well under a pixel and unreadable at any size that fits nine on
 * the field. The artboard solved this by having no art at all: every player was
 * a placeholder div with real HTML text. This is that text, with real art
 * behind it, which is why it can be both legible and small.
 *
 * DEF is deliberately absent -- the strip below the field owns it, and printing
 * it here as well would be the duplication we removed.
 */
function Fielder({ state, side, position }: { state: GameState; side: GameSide; position: DefensivePosition }) {
  const cardKey = state.pregame[side].defensiveAlignment[position]
  const card = cardKey ? state.pregame[side].roster?.cards[cardKey] : null
  const point = FIELDER_POINTS[position as Exclude<DefensivePosition, 'DH'>]
  if (!point) return null

  return (
    <div
      className={`gp-fc gp-fc-fielder${position === 'C' ? ' is-catcher' : ''}${card ? '' : ' is-empty'}`}
      style={{ left: `${point.left}%`, top: `${point.top}%` }}
      title={card ? `${position} · ${card.playerName}` : position}
    >
      <CardArt card={card} className="gp-fc-art" />
      <span className="gp-fc-meta">
        <b className="gp-fc-pos">{position}</b>
        {/* Dropped by container query on a narrow field -- two characters of
            position always survive, the name is what gives way. */}
        <span className="gp-fc-name">{card ? shortName(card.playerName) : '—'}</span>
      </span>
    </div>
  )
}

/**
 * The pitcher keeps a label, because CTRL is LIVE state -- fatigue-adjusted and
 * changing as he tires -- which printed card art can never show.
 */
function Pitcher({ state, side }: { state: GameState; side: GameSide }) {
  const cardKey = state.pregame[side].defensiveAlignment.P
  const card = cardKey ? state.pregame[side].roster?.cards[cardKey] : null
  const point = FIELDER_POINTS.P
  if (!card) return null

  const printed = card.pitcher.control
  const effective = effectiveCurrentPitcherControl(state)
  const adjusted = printed !== null && effective !== printed

  return (
    <div className="gp-fc gp-fc-pitcher" style={{ left: `${point.left}%`, top: `${point.top}%` }}>
      <CardArt card={card} className="gp-fc-art" />
      <span className="gp-fc-meta">
        <span className="gp-fc-live s-num">
          CTRL {printed ?? '—'}{adjusted && <em> → {effective}</em>}
        </span>
      </span>
    </div>
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

  // The batter keeps his label too: handedness and the fatigue-adjusted On
  // Base are live state, not printed facts.
  const printed = card.hitter.onBase
  const effective = effectiveCurrentHitterOnBase(state)
  const adjusted = printed !== null && effective !== printed

  return (
    <div className="gp-fc gp-fc-batter" style={{ left: `${point.left}%`, top: `${point.top}%` }}>
      <CardArt card={card} className="gp-fc-art" />
      <span className="gp-fc-meta">
        <b>
          {/* "At bat" is dropped on a narrow field -- the gold border already
              says it, and three wrapped lines pushed the label past the field's
              bottom edge, where overflow:hidden clipped the OB value. */}
          <span className="gp-fc-atbat">At bat · </span>{batsLabel(card.hitter.bats) ?? 'Bats ?'}
        </b>
        <span className="gp-fc-live s-num">
          OB {printed ?? '—'}{adjusted && <> <em>→ {effective}</em></>}
        </span>
      </span>
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
      {FIELDER_PAINT_ORDER.filter((p) => p !== 'P').map((position) => (
        <Fielder key={position} state={state} side={fielding} position={position} />
      ))}
      <Pitcher state={state} side={fielding} />
      <Batter state={state} />
      {bases.map(([base, runner]) => (runner ? <Runner key={base} base={base} runner={runner} /> : null))}
    </div>
  )
}
