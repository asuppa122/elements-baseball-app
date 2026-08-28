import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { hasGameplayLabAccess, loadGameplayLabGame, type PersistedGameplayLabGame } from '../gameplay/gameRepository'
import { battingSide } from '../gameplay/gameBoundaryEngine'
import DefBar from '../gameplay/presentation/DefBar'
import GameField from '../gameplay/presentation/GameField'
import LineupRail from '../gameplay/presentation/LineupRail'
import AvailabilityPanel from '../gameplay/presentation/AvailabilityPanel'
import RollControls from '../gameplay/presentation/RollControls'
import GameMenu from '../gameplay/presentation/GameMenu'
import GameLogPanel, { type LogEvent } from '../gameplay/presentation/GameLogPanel'
import HalfInningTransition from '../gameplay/presentation/HalfInningTransition'
import PostGameBoard from '../gameplay/presentation/PostGameBoard'
import { buildHalfInningTransition, previousHalf } from '../gameplay/halfInningTransition'
import DecisionBoard from '../gameplay/presentation/DecisionBoard'
import { getPrePitchActions } from '../gameplay/decisionEngine'
import { useGameplayActions } from '../gameplay/presentation/useGameplayActions'
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
 * Every region is now implemented. What remains unavailable -- per-batter stat
 * lines, play-by-play narration -- is stated on the surface by the component
 * that owns it, so a gap is never mistakable for a bug.
 *
 * Still read-only: this screen renders the game, the working shell at /play
 * resolves it. Interactivity is the last step, after parity is confirmed.
 */

function basesLabel(state: GameState): string {
  const on = [state.bases.first && '1st', state.bases.second && '2nd', state.bases.third && '3rd'].filter(Boolean)
  return on.length ? `Runners on ${on.join(', ')}` : 'Bases empty'
}

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
        {/* Bases at a glance. The runners themselves are pills on a 600px
            field, which is great for detail and poor for a quick read of
            "who's on" -- this is the quick read. */}
        <span className="gp-bases" aria-label={basesLabel(state)}>
          <i className={`gp-base is-second${state.bases.second ? ' is-on' : ''}`} />
          <i className={`gp-base is-third${state.bases.third ? ' is-on' : ''}`} />
          <i className={`gp-base is-first${state.bases.first ? ' is-on' : ''}`} />
        </span>
        <span className="gp-scorebug-outs" aria-label={`${state.outs} out`}>
          {[0, 1, 2].map((i) => <i key={i} className={`gp-out-dot${i < state.outs ? ' is-on' : ''}`} />)}
        </span>
      </div>
      {side('home')}
    </header>
  )
}

export default function GameplayScreenPage() {
  const { gameId = '' } = useParams()
  const { user, isDemo } = useAuth()
  const navigate = useNavigate()
  const [game, setGame] = useState<PersistedGameplayLabGame | null>(null)
  const [events, setEvents] = useState<LogEvent[]>([])
  // The engine never sets `inning_transition`, so showing the card is a
  // presentation decision: notice the half changed, offer it for the half that
  // just ended, and stop offering it once dismissed.
  const [lastHalfSeen, setLastHalfSeen] = useState<string | null>(null)
  const [transitionDismissed, setTransitionDismissed] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

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
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load this game.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [gameId, user?.id, isDemo])

  const state = game?.game_state as GameState | undefined
  const currentHalfKey = state ? `${state.inning}-${state.half}` : null
  // Opening a game mid-inning must not announce a half the viewer never saw.
  useEffect(() => {
    if (currentHalfKey !== null) setLastHalfSeen((seen) => (seen === null ? currentHalfKey : seen))
  }, [currentHalfKey])
  useEffect(() => {
    if (currentHalfKey !== null && transitionDismissed === currentHalfKey) setLastHalfSeen(currentHalfKey)
  }, [transitionDismissed, currentHalfKey])

  // The same hook the shell uses -- one action layer, so the two screens
  // cannot drift apart.
  const {
    saving, error, notice, selection, toggleSelection, decision, editablePrePitchDecision,
    noPitch, rollPitch, rollSwing, startAction, changeAction, confirmDecision, rollDecision, togglePause,
  } = useGameplayActions({
    game, userId: user?.id, surface: 'screen',
    onSaved: setGame,
    onAfterSave: async (id) => { try { setEvents(await loadGameplayLabEvents(id)) } catch { /* log is supplemental */ } },
  })
  const prePitchActions = state ? getPrePitchActions(state) : []

  if (loading) return <main className={`gp-screen${decision ? ' has-decision' : ''}`}><div className="gp-panel gp-region">Loading…</div></main>
  if (!state || !game) return <main className={`gp-screen${decision ? ' has-decision' : ''}`}><div className="gp-panel gp-region">{loadError || 'Game not found.'}</div></main>

  const halfKey = `${state.inning}-${state.half}`
  const justEnded = lastHalfSeen !== null && lastHalfSeen !== halfKey ? previousHalf(state.inning, state.half) : null
  const transition = justEnded && transitionDismissed !== halfKey
    ? buildHalfInningTransition(state, events, justEnded)
    : null

  return (
    <main className={`gp-screen${decision ? ' has-decision' : ''}`}>
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
        {/* Centre is strictly the game: score, the field, the defence. The
            matchup is the batter at the plate against the pitcher on the
            mound, so it needs no panel of its own. */}
        <section className="gp-region-field" aria-label="Field">
          <Scorebug state={state} />
          <GameField state={state} />
          <DefBar state={state} />
        </section>

        <section className="gp-panel gp-region gp-region-rail" aria-label="Game rail">
          <GameMenu
            state={state}
            saving={saving}
            onTogglePause={() => void togglePause()}
            onExit={() => navigate('/games')}
          />

          <GameLogPanel events={events} />

          {/* The decision board is the one already built and verified against
              both saved awaiting_decision games -- reused, not rewritten. */}
          <div className={`gp-decision-dock${decision ? ' is-open' : ''}`}>
            {decision && <i className="gp-sheet-grip" aria-hidden="true" />}
            {decision && (
              <DecisionBoard
                state={state}
                view={decision}
                selection={selection}
                /* The lab game is RLS-scoped to its home manager. */
                viewerSide="home"
                onToggle={(id) => toggleSelection(id, decision.mode === 'single')}
                onConfirm={() => void confirmDecision()}
                onRoll={() => void rollDecision()}
                saving={saving}
              />
            )}
            {decision && editablePrePitchDecision && (
              <button className="gp-action gp-action-secondary" disabled={saving} onClick={() => void changeAction()}>
                Change action
              </button>
            )}
          </div>

          <RollControls
            state={state}
            saving={saving}
            hasDecision={Boolean(decision)}
            onRollPitch={() => void rollPitch()}
            onRollSwing={() => void rollSwing()}
            onNoPitch={() => void noPitch()}
          />

          {!decision && state.status !== 'complete' && prePitchActions.length > 0 && (
            <section className="gp-manager-actions" aria-label="Manager actions">
              <b className="s-lbl">Manager actions</b>
              <div className="gp-action-list">
                {prePitchActions.map((a) => (
                  <button key={a.id} className="gp-action gp-action-secondary" disabled={saving}
                    title={a.detail} onClick={() => void startAction(a.id)}>{a.label}</button>
                ))}
              </div>
            </section>
          )}

          <AvailabilityPanel state={state} />

          {error && <p className="gp-actions-msg is-error">{error}</p>}
          {notice && !error && <p className="gp-actions-msg">{notice}</p>}

          {transition && !decision && (
            <HalfInningTransition
              transition={transition}
              managers={{ away: state.managers.away.managerName, home: state.managers.home.managerName }}
              onDismiss={() => setTransitionDismissed(halfKey)}
            />
          )}

          {!decision && state.status === 'complete' && <PostGameBoard state={state} />}
        </section>

      </div>
    </main>
  )
}
