import type { GameSide, GameState } from '../types'
import { availableFor } from './availability'
import type { LogEvent } from './GameLogPanel'
import { narrate } from './playNarration'
import { playOf } from './playRecord'

/**
 * The manager's tools as a 56px strip (Elements 2.0). What used to be a
 * permanent right-hand column -- decision board, log, bullpen, bench -- opens
 * on demand in the panel over the matchup column (ManagerPanel), so the field
 * and the cards never move to make room for it.
 *
 * The Call button only appears when a decision exists: lit when it is yours,
 * muted with "waiting" when it belongs to the other manager.
 */

export type ManagerTool = 'call' | 'log' | 'pen' | 'bench' | 'final'

function Icon({ name }: { name: ManagerTool }) {
  const common = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (name) {
    case 'call': return <svg {...common}><path d="M5 17V3l10 4-10 4" /></svg>
    case 'log': return <svg {...common}><path d="M5 4h10M5 8h10M5 12h10M5 16h6" /></svg>
    case 'pen': return <svg {...common}><circle cx="10" cy="10" r="7" /><path d="M5.5 5.5c2 1.5 2 7.5 0 9M14.5 5.5c-2 1.5-2 7.5 0 9" /></svg>
    case 'bench': return <svg {...common}><path d="M3 9h14M5 9v6M15 9v6M4 13h12" /></svg>
    case 'final': return <svg {...common}><path d="M4 4h12v12H4zM4 9h12M9 4v12" /></svg>
  }
}

export default function ManagerToolbar({
  state, events, open, onOpen, decisionPending, decisionMine, viewerSide, actingSides,
}: {
  state: GameState
  events: LogEvent[]
  /** The tool the panel is showing, if any. */
  open: ManagerTool | null
  onOpen: (tool: ManagerTool) => void
  decisionPending: boolean
  decisionMine: boolean
  viewerSide: GameSide
  actingSides: GameSide[]
}) {
  const batting: GameSide = state.half === 'top' ? 'away' : 'home'
  const fielding: GameSide = batting === 'home' ? 'away' : 'home'
  // Counts for the team whose moves these are: yours in a league game, and in
  // a one-screen game the side that would use them right now.
  const penSide = actingSides.length > 1 ? fielding : viewerSide
  const benchSide = actingSides.length > 1 ? batting : viewerSide
  const plays = events.filter((e) => playOf(e) || narrate(e)).length

  const button = (tool: ManagerTool, label: string, count?: string, tone?: 'hot' | 'muted') => (
    <button key={tool} type="button" aria-pressed={open === tool}
      className={`gp-tool${open === tool ? ' is-open' : ''}${tone ? ` is-${tone}` : ''}`}
      onClick={() => onOpen(tool)} title={label}>
      <Icon name={tool} />
      <span className="gp-tool-label">{label}</span>
      {count !== undefined && <span className="gp-tool-count s-num">{count}</span>}
    </button>
  )

  return (
    <nav className="gp-toolbar" aria-label="Manager tools">
      {decisionPending && button('call', decisionMine ? 'Call' : 'Waiting', decisionMine ? '!' : undefined, decisionMine ? 'hot' : 'muted')}
      {button('log', 'Log', String(plays))}
      {button('pen', 'Pen', String(availableFor(state, penSide).bullpen.length))}
      {button('bench', 'Bench', String(availableFor(state, benchSide).bench.length))}
      {state.status === 'complete' && button('final', 'Final')}
    </nav>
  )
}
