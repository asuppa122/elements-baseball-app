import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { hasGameplayLabAccess, loadGameplayLabGame, loadGameplayLabGameVersion, type PersistedGameplayLabGame } from '../gameplay/gameRepository'
import { type LogEvent } from '../gameplay/presentation/GameLogPanel'
import GameplayScreenView from '../gameplay/presentation/GameplayScreenView'
import { buildHalfInningTransition, previousHalf } from '../gameplay/halfInningTransition'
import { useGameplayActions } from '../gameplay/presentation/useGameplayActions'
import { loadGameplayLabEvents } from '../gameplay/gameRepository'
import type { GameSide, GameState } from '../gameplay/types'

/**
 * The gameplay screen, loaded from and saved to Supabase.
 *
 * This file is the DATA half: access check, load, persistence, and the
 * half-inning bookkeeping that decides when a transition card is owed. The
 * layout lives in GameplayScreenView, which the sandbox renders too -- the
 * last time two surfaces each owned their own copy of a gameplay concern they
 * drifted, and four completed games ended up unable to produce a scoring play.
 *
 * This screen is INTERACTIVE. It shares one action layer with the shell --
 * useGameplayActions below -- so rolls, manager decisions, pause/resume and
 * persistence behave identically on both surfaces and cannot drift apart.
 *
 * LAYOUT: Type 2 proportional scaling. `.gp-screen` is a fixed, size-queried
 * stage and `.gp-stage` is the scaled composition inside it -- see the Type 2
 * block at the end of gameplay-screen.css for why the geometry is expressed
 * in --u rather than pixels.
 */

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

  // Re-read the whole game (state + log). Used when a poll sees a newer
  // version and when a save loses the race to the other manager's move.
  const refresh = useCallback(async () => {
    if (!gameId) return
    try {
      const loaded = await loadGameplayLabGame(gameId)
      setGame(loaded)
      try { setEvents(await loadGameplayLabEvents(gameId)) } catch { /* log is supplemental */ }
    } catch { /* a missed refresh is retried by the next poll */ }
  }, [gameId])

  // The other manager's moves arrive by polling the version, which costs one
  // tiny row read every couple of seconds and needs no Realtime setup. Only a
  // two-player game has another manager to wait for.
  const versionRef = useRef<number | null>(null)
  versionRef.current = game?.state_version ?? null
  const twoPlayer = game?.game_state?.turnHandshake === true
  const finished = game?.game_state?.status === 'complete'
  useEffect(() => {
    if (!gameId || !twoPlayer || finished) return
    let busy = false
    const timer = window.setInterval(async () => {
      if (busy || document.visibilityState === 'hidden') return
      busy = true
      try {
        const latest = await loadGameplayLabGameVersion(gameId)
        if (versionRef.current !== null && latest > versionRef.current) await refresh()
      } catch { /* transient; try again next tick */ } finally { busy = false }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [gameId, twoPlayer, finished, refresh])

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
  const actions = useGameplayActions({
    game, userId: user?.id, surface: 'screen',
    onSaved: setGame,
    onAfterSave: async (id) => { try { setEvents(await loadGameplayLabEvents(id)) } catch { /* log is supplemental */ } },
    onStale: refresh,
  })

  if (loading) return <main className="gp-screen"><div className="gp-panel gp-region">Loading…</div></main>
  if (!state || !game) return <main className="gp-screen"><div className="gp-panel gp-region">{loadError || 'Game not found.'}</div></main>

  /**
   * Which side the signed-in manager is acting as.
   *
   * This used to be hardcoded 'home' one level down, which is correct for
   * every lab game today -- GameplayLabPage always creates with
   * homeManager: { userId: user.id }, so the creator IS home, and opponent
   * access is still disabled. It stops being correct the moment an opponent
   * can open a game they did not create: they are away, and a board addressed
   * to 'home' renders every control dead for them. Deriving it from the state
   * is correct now and stays correct then.
   */
  const viewerSide: GameSide = user && state.managers.away.userId === user.id ? 'away' : 'home'

  const halfKey = `${state.inning}-${state.half}`
  const justEnded = lastHalfSeen !== null && lastHalfSeen !== halfKey ? previousHalf(state.inning, state.half) : null
  const transition = justEnded && transitionDismissed !== halfKey
    ? buildHalfInningTransition(state, events, justEnded)
    : null

  return (
    <GameplayScreenView
      state={state}
      events={events}
      actions={actions}
      transition={transition}
      onDismissTransition={() => setTransitionDismissed(halfKey)}
      onExit={() => navigate('/games')}
      viewerSide={viewerSide}
      banner={twoPlayer ? undefined : (
        <div className="gp-wip">
          <b>Building</b>
          <span>New gameplay screen, assembled region by region. The working shell is untouched at{' '}
            <a href={`/games/lab/${game.id}/play`} onClick={(e) => { e.preventDefault(); navigate(`/games/lab/${game.id}/play`) }}>/play</a>.
          </span>
        </div>
      )}
    />
  )
}
