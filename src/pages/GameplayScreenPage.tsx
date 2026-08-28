import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { hasGameplayLabAccess, loadGameplayLabGame, type PersistedGameplayLabGame } from '../gameplay/gameRepository'
import { battingSide } from '../gameplay/gameBoundaryEngine'
import DefBar from '../gameplay/presentation/DefBar'
import GameField from '../gameplay/presentation/GameField'
import LineupRail from '../gameplay/presentation/LineupRail'
import AvailabilityPanel from '../gameplay/presentation/AvailabilityPanel'
import GameLogPanel, { type LogEvent } from '../gameplay/presentation/GameLogPanel'
import DecisionBoard from '../gameplay/presentation/DecisionBoard'
import { getDecisionView } from '../gameplay/decisionEngine'
import { loadGameplayLabEvents } from '../gameplay/gameRepository'
import type { GameSide, GameState } from '../gameplay/types'

/**
 * The gameplay screen -- the .design-mockup canvas built for real.
 *
 * Lives at its own route while it is assembled, so the working shell at
 * /play stays fully intact and playable until this reaches parity. Nothing
 * here writes: every engine and repository import is read-only, and the
 * resolution layer verified this week is not touched.
 *
 * Built region by region. Anything not yet implemented renders as an explicit
 * `gp-todo` block naming what will fill it and where its data comes from --
 * an unfinished region should never be mistakable for a broken one.
 */

function Scorebug({ state }: { state: GameState }) {
  const batting = battingSide(state.half)
  const side = (which: GameSide) => (
    <div className={`gp-scorebug-side${which === 'home' ? ' is-home' : ''}${batting === which ? ' is-batting' : ''}`}>
      {which === 'home' && <b className="gp-scorebug-runs s-num">{state.score.home}</b>}
      <span className="gp-scorebug-name">{state.managers[which].managerName}</span>
      {which === 'away' && <b className="gp-scorebug-runs s-num">{state.score.away}</b>}
    </div>
  )

  return (
    <header className="gp-panel gp-scorebug" aria-label="Score">
      {side('away')}
      <div className="gp-scorebug-centre">
        <span className="gp-scorebug-inning">
          {state.half === 'top' ? '▲' : '▼'} {state.inning}
        </span>
        <span className="gp-scorebug-outs" aria-label={`${state.outs} out`}>
          {[0, 1, 2].map((i) => <i key={i} className={`gp-out-dot${i < state.outs ? ' is-on' : ''}`} />)}
        </span>
      </div>
      {side('home')}
    </header>
  )
}

function Todo({ title, detail }: { title: string; detail: string }) {
  return <div className="gp-todo"><b>{title}</b><span>{detail}</span></div>
}

export default function GameplayScreenPage() {
  const { gameId = '' } = useParams()
  const { user, isDemo } = useAuth()
  const navigate = useNavigate()
  const [game, setGame] = useState<PersistedGameplayLabGame | null>(null)
  const [events, setEvents] = useState<LogEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!gameId || !user || isDemo) { setLoading(false); return }
    let cancelled = false
    async function load() {
      try {
        if (!await hasGameplayLabAccess()) throw new Error('Gameplay access is not enabled for this account.')
        const loaded = await loadGameplayLabGame(gameId)
        let loadedEvents: LogEvent[] = []
        try { loadedEvents = await loadGameplayLabEvents(gameId) } catch { /* log is supplemental */ }
        if (!cancelled) { setGame(loaded); setEvents(loadedEvents) }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this game.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [gameId, user?.id, isDemo])

  const state = game?.game_state as GameState | undefined
  const decision = state ? getDecisionView(state) : null

  if (loading) return <main className="gp-screen"><div className="gp-panel gp-region">Loading…</div></main>
  if (!state || !game) return <main className="gp-screen"><div className="gp-panel gp-region">{error || 'Game not found.'}</div></main>

  return (
    <main className="gp-screen">
      <div className="gp-wip">
        <b>Building</b>
        <span>New gameplay screen, assembled region by region. The working shell is untouched at{' '}
          <a href={`/games/lab/${game.id}/play`} onClick={(e) => { e.preventDefault(); navigate(`/games/lab/${game.id}/play`) }}>/play</a>.
        </span>
      </div>

      <div className="gp-layout">
        <section className="gp-panel gp-region gp-region-lineup" aria-label="Lineup">
          <LineupRail state={state} />
        </section>

        {/* Centre is a transparent stack, not a panel — matching the artboards,
            where only the two rails are panels and the scorebug sits at the
            centre column's width rather than spanning the page. */}
        <section className="gp-region-field" aria-label="Field">
          <Scorebug state={state} />
          <DefBar state={state} />
          <GameField state={state} />
          <Todo title="Matchup and roll" detail="Batter and pitcher with fatigue-adjusted OB/CTRL, then pitch → advantage → swing → result." />
        </section>

        <section className="gp-panel gp-region gp-region-rail" aria-label="Game rail">
          {/* The decision board is the one already built and verified against
              both saved awaiting_decision games — reused, not rewritten. */}
          {decision && (
            <DecisionBoard
              state={state}
              view={decision}
              selection={[]}
              viewerSide="home"
              onToggle={() => {}}
              onConfirm={() => {}}
              onRoll={() => {}}
              /* Read-only until the interactive pass: this screen renders the
                 decision, the working shell at /play still resolves it. */
              saving
            />
          )}
          <Todo title="Chart readout" detail="Hitter and pitcher chart, RTS, CTRL and the Shutout Bonus state — lands with the matchup, which reads the same card data." />
          <AvailabilityPanel state={state} />
          <GameLogPanel events={events} />
        </section>
      </div>
    </main>
  )
}
