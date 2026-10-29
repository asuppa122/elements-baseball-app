import { useState, type ReactNode } from 'react'
import { battingSide } from '../gameBoundaryEngine'
import { availableFor } from './availability'
import GameLogPanel, { type LogEvent } from './GameLogPanel'
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
const DEFENCE_MOVES = new Set(['DEFENSIVE_SUB', 'PITCHING_CHANGE', 'DOUBLE_SWITCH'])
const PEN_FOOTER = new Set(['PITCHING_CHANGE', 'DOUBLE_SWITCH'])
const BENCH_FOOTER = new Set(['PINCH_HITTER', 'PINCH_RUNNER', 'DEFENSIVE_SUB'])

const SHORT: Record<string, string> = {
  PINCH_HITTER: 'Pinch hit',
  PINCH_RUNNER: 'Pinch run',
  DEFENSIVE_SUB: 'Def sub',
  PITCHING_CHANGE: 'Pitching change',
  DOUBLE_SWITCH: 'Double switch',
}

type Drawer = 'log' | 'pen' | 'bench'
type Kind = 'pen' | 'bench'

const other = (side: GameSide): GameSide => (side === 'home' ? 'away' : 'home')

function rates(card: GameCardSnapshot, kind: Kind): string {
  if (kind === 'pen') return `Ctrl ${card.pitcher.control ?? '—'} · IP ${card.pitcher.ip ?? '—'}`
  const field = Object.entries(card.defense)
    .filter(([, v]) => typeof v === 'number')
    .map(([pos, v]) => `${pos} ${(v as number) >= 0 ? '+' : ''}${v}`)
  return [`OB ${card.hitter.onBase ?? '—'}`, `BsR ${card.hitter.baserunning ?? '—'}`, ...field].join(' · ')
}

function Row({ card, kind, actions }: { card: GameCardSnapshot; kind: Kind; actions?: ReactNode }) {
  return (
    <li className="gp-drawer-row">
      <span className="gp-drawer-art">
        {card.imageUrl ? <img src={card.imageUrl} alt="" loading="lazy" /> : <i aria-hidden="true" />}
      </span>
      <span className="gp-drawer-who">
        <b>{card.playerName}</b>
        <span className="s-num">{rates(card, kind)}</span>
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
  state, events, viewerSide, actingSides, rosterActions, disabled, onStart,
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
}) {
  const [open, setOpen] = useState<Drawer | null>('log')
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
    const reason = moves.length === 0 ? why(kind, side) : null
    return (
      <>
        {cards.length === 0
          ? <p className="gp-avail-empty">{kind === 'pen' ? 'No arms left.' : 'Nobody left on the bench.'}</p>
          : (
            <ul className="gp-drawer-list">
              {cards.map((c) => (
                <Row key={c.cardKey} card={c} kind={kind} actions={rowMoves.length > 0 && (
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
      <Section id="log" label="Game log" count={`${events.length}`} open={open === 'log'} onToggle={toggle}>
        <GameLogPanel events={events} />
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
