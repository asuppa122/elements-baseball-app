import { useState, type ReactNode } from 'react'
import { battingSide } from '../gameBoundaryEngine'
import { threeBatterMinimum } from '../pitcherMound'
import { awaitingOffenseReady } from '../turnOrder'
import { availableFor, rosterSlot } from './availability'
import { CardArt } from './CardZoom'
import { batsLabel, throwsLabel } from './handedness'
import { hitterOnBaseFor, pitcherFatigueInputFor } from '../engine'
import { effectivePitcherControl } from '../fatigueEngine'
import GameLogPanel, { type LogEvent } from './GameLogPanel'
import { narrate } from './playNarration'
import { playOf } from './playRecord'

const playCount = (events: LogEvent[]) => events.filter((e) => playOf(e) || narrate(e)).length
import type { DecisionOption } from '../decisionEngine'
import type { GameCardSnapshot, GameSide, GameState } from '../types'

/**
 * The right rail's accordion: game log, bullpen, bench.
 *
 * Roster moves live where the roster lives. A row starts the move with that
 * player already chosen; the drawer footer starts the same move with nobody
 * chosen, which is also how to reach anyone the bullpen/bench split does not
 * place where you expect (a position player pitching, a pitcher pinch-hitting).
 * Either way the move lands on the decision board and is not made until it is
 * confirmed there.
 *
 * Which moves are legal is the engine's call (getPrePitchActions), including
 * that none are legal before the game's first pitch. This file only decides
 * whose they are: pinch hitter and pinch runner belong to the batting side,
 * the rest to the fielding side. An action it does not recognise is offered to
 * both rather than dropped, so a new engine action can never vanish.
 */

const OFFENCE_MOVES = new Set(['PINCH_HITTER', 'PINCH_RUNNER'])
const DEFENCE_MOVES = new Set(['DEFENSIVE_SUB', 'PITCHING_CHANGE', 'DOUBLE_SWITCH', 'POSITION_SWAP'])
const PEN_FOOTER = new Set(['PITCHING_CHANGE', 'DOUBLE_SWITCH', 'POSITION_SWAP'])
const BENCH_FOOTER = new Set(['PINCH_HITTER', 'PINCH_RUNNER', 'DEFENSIVE_SUB'])

const SHORT: Record<string, string> = {
  PINCH_HITTER: 'Pinch hit',
  PINCH_RUNNER: 'Pinch run',
  DEFENSIVE_SUB: 'Def sub',
  PITCHING_CHANGE: 'Pitching change',
  DOUBLE_SWITCH: 'Double switch',
  POSITION_SWAP: 'Fielder to mound',
}

type Drawer = 'log' | 'pen' | 'bench'
type Kind = 'pen' | 'bench'

const other = (side: GameSide): GameSide => (side === 'home' ? 'away' : 'home')

/**
 * A pitcher's Control as he would enter -- rest debt applied, through the
 * same pitcherFatigueInputFor the live roll uses -- with the card value and
 * the fatigue beside it whenever they differ. Will picked a "C5" reliever who
 * entered at C-5 in the first live game; this is what he should have seen.
 */
function PenRates({ state, side, card }: { state: GameState; side: GameSide; card: GameCardSnapshot }) {
  const input = pitcherFatigueInputFor(state, side, card.cardKey)
  const printed = card.pitcher.control
  const effective = input ? effectivePitcherControl(input) : printed
  const rest = input?.gamesFromRested ?? 0
  const tired = printed !== null && effective !== printed
  return (
    <span className="gp-drawer-rates s-num">
      <span className={`gp-drawer-ctrl${tired ? ' is-tired' : ''}`}>C{effective ?? '—'}</span>
      {tired && <span className="gp-drawer-was">card C{printed} · fatigue {(effective ?? 0) - (printed ?? 0)}</span>}
      <span>IP {card.pitcher.ip ?? '—'}</span>
      <span>{rest > 0 ? `${rest} game${rest === 1 ? '' : 's'} from rested` : 'Rested'}</span>
    </span>
  )
}

function BenchRates({ state, side, card }: { state: GameState; side: GameSide; card: GameCardSnapshot }) {
  const ob = hitterOnBaseFor(state, side, card.cardKey)
  const tired = ob && ob.printed !== null && ob.effective !== ob.printed
  const field = Object.entries(card.defense)
    .filter(([, v]) => typeof v === 'number')
    .map(([pos, v]) => `${pos} ${(v as number) >= 0 ? '+' : ''}${v}`)
  return (
    <span className="gp-drawer-rates s-num">
      <span className={`gp-drawer-ctrl${tired ? ' is-tired' : ''}`}>OB {ob?.effective ?? card.hitter.onBase ?? '—'}</span>
      {tired && <span className="gp-drawer-was">card {ob!.printed} · fatigue {ob!.effective - ob!.printed!}</span>}
      <span>BsR {card.hitter.baserunning ?? '—'}</span>
      {field.length > 0 && <span>{field.join(' · ')}</span>}
    </span>
  )
}

function Row({ state, side, card, kind, actions }: { state: GameState; side: GameSide; card: GameCardSnapshot; kind: Kind; actions?: ReactNode }) {
  const slot = rosterSlot(state, side, card.cardKey).label
  const hand = kind === 'pen' ? throwsLabel(card.pitcher.arm) : batsLabel(card.hitter.bats)
  return (
    <li className="gp-drawer-row">
      <CardArt card={card} className="gp-drawer-art" />
      <span className="gp-drawer-who">
        <b>{card.playerName}</b>
        <span className="gp-drawer-tags">
          {slot && <span className="gp-tag">{slot}</span>}
          {hand && <span className="gp-tag is-hand">{hand}</span>}
        </span>
        {kind === 'pen' ? <PenRates state={state} side={side} card={card} /> : <BenchRates state={state} side={side} card={card} />}
      </span>
      {actions && <span className="gp-drawer-row-acts">{actions}</span>}
    </li>
  )
}

function Section({ id, label, count, open, onToggle, children }: {
  id: Drawer
  label: string
  count: string
  open: boolean
  onToggle: (id: Drawer) => void
  children: ReactNode
}) {
  const bodyId = `gp-drawer-${id}`
  return (
    <section className={`gp-drawer${open ? ' is-open' : ''}`}>
      <button type="button" className="gp-drawer-head" aria-expanded={open} aria-controls={bodyId}
        onClick={() => onToggle(id)}>
        <span className="gp-drawer-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <b>{label}</b>
        <span className="s-num">{count}</span>
      </button>
      <div id={bodyId} className="gp-drawer-body" hidden={!open}>{children}</div>
    </section>
  )
}

export default function RosterDrawers({
  state, events, viewerSide, actingSides, rosterActions, disabled, onStart, initialOpen = 'log',
}: {
  state: GameState
  events: LogEvent[]
  /** The team this screen is managed from; its roster is listed first. */
  viewerSide: GameSide
  /** Teams the viewer may make moves for: their own in a league game, both in the sandbox. */
  actingSides: GameSide[]
  /** The roster moves legal right now, from getPrePitchActions (no side tag). */
  rosterActions: DecisionOption[]
  /** Saving, or a decision already open: nothing new can start. */
  disabled: boolean
  onStart: (actionId: string, preferOptionId?: string) => void
  /** The section open when the drawers are shown (the toolbar tool chosen). */
  initialOpen?: Drawer
}) {
  const [open, setOpen] = useState<Drawer | null>(initialOpen)
  const toggle = (id: Drawer) => setOpen((current) => (current === id ? null : id))

  const batting = battingSide(state.half)
  const movesFor = (side: GameSide): DecisionOption[] => {
    if (!actingSides.includes(side)) return []
    return rosterActions.filter((a) => (side === batting ? !DEFENCE_MOVES.has(a.id) : !OFFENCE_MOVES.has(a.id)))
  }

  const button = (a: DecisionOption, label: string, prefer?: string) => (
    <button key={`${a.id}-${prefer ?? 'any'}`} type="button" className="gp-drawer-act" disabled={disabled}
      title={a.detail} onClick={() => onStart(a.id, prefer)}>{label}</button>
  )

  /** Why a drawer has no buttons, when the answer is not obvious. */
  const why = (kind: Kind, side: GameSide): string | null => {
    if (!actingSides.includes(side) || state.status === 'complete') return null
    if (state.firstPitchThrown === false) return 'Moves open once the first pitch is thrown.'
    if (state.waitingFor !== 'PITCH_ROLL' || state.pendingDecision) return 'Moves are made before a pitch.'
    if (state.turnHandshake === true) {
      if (side === batting && !awaitingOffenseReady(state)) return 'You are ready — moves reopen before the next pitch.'
      if (side !== batting && awaitingOffenseReady(state)) return 'Moves open once the batting manager is ready.'
    }
    if (kind === 'pen' && side === batting) return 'Pitching changes are made while this team is in the field.'
    return null
  }

  const list = (side: GameSide, kind: Kind) => {
    const cards = kind === 'pen' ? availableFor(state, side).bullpen : availableFor(state, side).bench
    const moves = movesFor(side)
    const rowMoves = moves.filter((a) => (kind === 'pen' ? a.id === 'PITCHING_CHANGE' : BENCH_FOOTER.has(a.id)))
    const footMoves = moves.filter((a) =>
      kind === 'pen' ? PEN_FOOTER.has(a.id) || !(OFFENCE_MOVES.has(a.id) || DEFENCE_MOVES.has(a.id))
        : BENCH_FOOTER.has(a.id) || !(OFFENCE_MOVES.has(a.id) || DEFENCE_MOVES.has(a.id)))
    // MLB 5.10(g): say why the pen is shut even when other moves are open.
    const minimum = kind === 'pen' && side !== batting && actingSides.includes(side) && state.status !== 'complete'
      ? threeBatterMinimum(state, side) : null
    const reason = minimum
      ? `${minimum.playerName} must face ${minimum.remaining} more batter${minimum.remaining === 1 ? '' : 's'} (three-batter minimum) before a pitching change.`
      : moves.length === 0 ? why(kind, side) : null
    return (
      <>
        {cards.length === 0
          ? <p className="gp-avail-empty">{kind === 'pen' ? 'No arms left.' : 'Nobody left on the bench.'}</p>
          : (
            <ul className="gp-drawer-list">
              {cards.map((c) => (
                <Row key={c.cardKey} state={state} side={side} card={c} kind={kind} actions={rowMoves.length > 0 && (
                  <>{rowMoves.map((a) => button(a, a.id === 'PITCHING_CHANGE' ? 'Bring in' : SHORT[a.id], c.cardKey))}</>
                )} />
              ))}
            </ul>
          )}
        {footMoves.length > 0 && (
          <div className="gp-drawer-foot">{footMoves.map((a) => button(a, SHORT[a.id] ?? a.label))}</div>
        )}
        {reason && <p className="gp-drawer-why">{reason}</p>}
      </>
    )
  }

  /** The team listed first in a drawer: yours, or in the sandbox the team whose drawer it is. */
  const primary = (kind: Kind): GameSide => {
    if (actingSides.length < 2) return viewerSide
    return kind === 'pen' ? other(batting) : batting
  }

  const drawer = (kind: Kind) => {
    const first = primary(kind)
    const second = other(first)
    const count = (side: GameSide) => {
      const a = availableFor(state, side)
      return (kind === 'pen' ? a.bullpen : a.bench).length
    }
    return (
      <>
        {actingSides.length > 1 && <p className="gp-drawer-team">{state.managers[first].managerName}</p>}
        {list(first, kind)}
        <details className="gp-drawer-theirs">
          <summary>
            <span>{state.managers[second].managerName}</span>
            <span className="s-num">{count(second)} left</span>
          </summary>
          {list(second, kind)}
        </details>
      </>
    )
  }

  const mine = availableFor(state, primary('pen'))
  const mineBench = availableFor(state, primary('bench'))

  return (
    <div className="gp-drawers">
      <Section id="log" label="Game log" count={`${playCount(events)} plays`} open={open === 'log'} onToggle={toggle}>
        <GameLogPanel events={events} managers={{ away: state.managers.away.managerName, home: state.managers.home.managerName }} />
      </Section>
      <Section id="pen" label="Bullpen" count={`${mine.bullpen.length} available`} open={open === 'pen'} onToggle={toggle}>
        {drawer('pen')}
      </Section>
      <Section id="bench" label="Bench" count={`${mineBench.bench.length} available`} open={open === 'bench'} onToggle={toggle}>
        {drawer('bench')}
      </Section>
    </div>
  )
}
