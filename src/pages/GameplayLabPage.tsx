import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { attachPregameRoster, createInitialGameState } from '../gameplay/engine'
import {
  ActiveGameConflict,
  cancelGameplayGame,
  createGameplayLabGame,
  hasGameplayLabAccess,
  loadGameplayPermissions,
  loadGameplayLabGames,
  loadGameplayOpponents,
  loadMyActiveGame,
  terminateGameplayGame,
  type ActiveGame,
  type GameplayLabOpponent,
  type GameplayPermissions,
  type PersistedGameplayLabGame,
} from '../gameplay/gameRepository'
import { canCancelBeforeFirstPitch, endedLabel, gameEnded } from '../gameplay/gameEnd'
import { loadLineupChoices, rosterIssueSummary, snapshotFor, type LineupChoice } from '../gameplay/lineupChoice'
import { ACTIVE_SEASON_CONFIG } from '../gameplay/seasonConfig'
import { sideToAct } from '../gameplay/turnOrder'
import type { GameSide, GameState } from '../gameplay/types'

/** Where a game should open for this manager right now. */
function gameLink(game: PersistedGameplayLabGame): { to: string; label: string } {
  const s = game.game_state
  const twoPlayer = s?.turnHandshake === true
  if (s?.status === 'setup' || s?.status === 'pregame' || s?.status === 'ready') {
    return { to: `/games/lab/${game.id}/pregame`, label: 'Open Pregame' }
  }
  if (gameEnded(s?.status)) return { to: `/games/lab/${game.id}/screen`, label: s.status === 'complete' ? 'View Final' : 'View Game' }
  if (twoPlayer) return { to: `/games/lab/${game.id}/screen`, label: 'Play' }
  return { to: `/games/lab/${game.id}/screen`, label: 'Open Game' }
}

function GameSummary({ game, userId, active, canTerminate, busy, onCancel, onTerminate }: {
  game: PersistedGameplayLabGame
  userId: string
  /** This is the manager's one active competitive game. */
  active: boolean
  canTerminate: boolean
  busy: boolean
  onCancel: (game: PersistedGameplayLabGame) => void
  onTerminate: (game: PersistedGameplayLabGame) => void
}) {
  const s = game.game_state as GameState
  const mySide: GameSide = s?.managers?.away?.userId === userId ? 'away' : 'home'
  const opponentSide: GameSide = mySide === 'home' ? 'away' : 'home'
  const opponent = s?.managers?.[opponentSide]?.managerName ?? 'Opponent'
  const twoPlayer = s?.turnHandshake === true
  const toAct = s ? sideToAct(s) : null
  const ended = endedLabel(s?.status, game.end_reason)
  const turn = ended ?? (!twoPlayer ? 'One-screen test'
    : s.status === 'complete' ? `Final ${s.score.away}–${s.score.home}`
    : s.status === 'pregame' ? (s.pregame[mySide].locked ? `Waiting on ${opponent}'s pregame` : 'Your pregame')
    : s.status === 'ready' ? 'Ready to start'
    : toAct === mySide ? 'Your move' : `Waiting on ${opponent}`)
  const link = gameLink(game)
  // Who may cancel is who may save it: either manager of a two-player game,
  // the home tester of a one-screen game. The server checks the first pitch.
  const cancellable = Boolean(s) && canCancelBeforeFirstPitch(s) && (twoPlayer || mySide === 'home')
  const terminable = canTerminate && Boolean(s) && !gameEnded(s.status)

  return (
    <article className={`gameplay-lab-saved-game${active ? ' is-active' : ''}${ended ? ' is-ended' : ''}`}>
      <div>
        <span>{active && <b className="gameplay-lab-active-tag">Active game</b>}{game.season_id} · You are {mySide}</span>
        <strong>vs. {opponent}</strong>
        <small>{turn}</small>
      </div>
      <div className="gameplay-lab-saved-actions">
        <dl>
          <div><dt>Status</dt><dd>{game.status.replaceAll('_', ' ')}</dd></div>
          <div><dt>State</dt><dd>v{game.state_version}</dd></div>
          <div><dt>Created</dt><dd>{new Date(game.created_at).toLocaleString()}</dd></div>
        </dl>
        <div className="gameplay-lab-saved-buttons">
          <Link className="gameplay-lab-open-button" to={link.to}>{link.label}</Link>
          {cancellable && (
            <button type="button" className="gameplay-lab-secondary-button" disabled={busy} onClick={() => onCancel(game)}>Cancel game</button>
          )}
          {terminable && !cancellable && (
            <button type="button" className="gameplay-lab-secondary-button" disabled={busy} onClick={() => onTerminate(game)}>End without result</button>
          )}
        </div>
      </div>
    </article>
  )
}

export default function GameplayLabPage() {
  const { user, profile, isDemo } = useAuth()
  const [accessChecked, setAccessChecked] = useState(false)
  const [hasAccess, setHasAccess] = useState(false)
  const [opponents, setOpponents] = useState<GameplayLabOpponent[]>([])
  const [choices, setChoices] = useState<LineupChoice[]>([])
  const [savedGames, setSavedGames] = useState<PersistedGameplayLabGame[]>([])
  const [selectedOpponentId, setSelectedOpponentId] = useState('')
  const [selectedLineupId, setSelectedLineupId] = useState('')
  const [twoPlayer, setTwoPlayer] = useState(true)
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null)
  const [permissions, setPermissions] = useState<GameplayPermissions>({ can_create_test_games: false, can_terminate_games: false, official_tracking_enabled: false })
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (isDemo || !user) {
      setAccessChecked(true)
      setHasAccess(false)
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadLab() {
      setLoading(true)
      setError('')
      try {
        const allowed = await hasGameplayLabAccess()
        if (cancelled) return
        setHasAccess(allowed)
        setAccessChecked(true)
        if (!allowed) return

        const [nextOpponents, nextChoices, nextGames, nextActive, nextPermissions] = await Promise.all([
          loadGameplayOpponents(),
          loadLineupChoices(),
          loadGameplayLabGames(),
          loadMyActiveGame(),
          loadGameplayPermissions(),
        ])
        if (cancelled) return

        setActiveGame(nextActive)
        setPermissions(nextPermissions)
        // One-screen test games are for approved testers only (the server refuses them otherwise).
        if (!nextPermissions.can_create_test_games) setTwoPlayer(true)

        setOpponents(nextOpponents)
        setChoices(nextChoices)
        setSavedGames(nextGames)
        setSelectedOpponentId((current) => current || nextOpponents[0]?.user_id || '')
        setSelectedLineupId((current) => current || nextChoices.find((c) => c.eligibility.eligible)?.lineup.id || nextChoices[0]?.lineup.id || '')
      } catch (loadError) {
        if (!cancelled) setError(errorText(loadError, 'Could not load gameplay lab.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadLab()
    return () => { cancelled = true }
  }, [user?.id, isDemo])

  const selectedOpponent = opponents.find((opponent) => opponent.user_id === selectedOpponentId) ?? null
  const selected = choices.find((c) => c.lineup.id === selectedLineupId) ?? null

  async function createGame() {
    if (!user || !profile || !selectedOpponent || !selected?.eligibility.eligible) return

    setCreating(true)
    setError('')
    setSuccess('')

    try {
      const initial = createInitialGameState({
        gameId: crypto.randomUUID(),
        configuration: ACTIVE_SEASON_CONFIG,
        homeManager: { userId: user.id, managerName: profile.manager_name },
        awayManager: { userId: selectedOpponent.user_id, managerName: selectedOpponent.manager_name },
      })
      // A two-player game is managed from two screens: each manager sets their
      // own pregame and makes their own moves, in turn (turnOrder.ts). A
      // one-screen game is the old lab flow, where you play both sides.
      if (twoPlayer) initial.turnHandshake = true

      const created = await createGameplayLabGame(attachPregameRoster(initial, 'home', snapshotFor(selected)))
      setSavedGames((current) => [created, ...current])
      if (twoPlayer) setActiveGame(await loadMyActiveGame())
      setSuccess(twoPlayer
        ? `Game created: ${profile.manager_name} (home) vs. ${selectedOpponent.manager_name} (away). Set your pregame; ${selectedOpponent.manager_name} will see it in their games list.`
        : `One-screen test game created vs. ${selectedOpponent.manager_name}.`)
    } catch (createError) {
      setError(errorText(createError, 'Could not create the game.'))
      // The server knows best: show the game that is blocking, if it is ours.
      if (createError instanceof ActiveGameConflict && createError.who === 'you') {
        try { setActiveGame(await loadMyActiveGame()) } catch { /* the message already says it */ }
      }
    } finally {
      setCreating(false)
    }
  }

  /** Replaces a game in the list with what the server returned. */
  function updateGame(saved: PersistedGameplayLabGame) {
    setSavedGames((current) => current.map((g) => (g.id === saved.id ? { ...g, ...saved } : g)))
  }

  async function cancelGame(game: PersistedGameplayLabGame) {
    const opponent = game.home_user_id === user?.id ? game.game_state?.managers?.away?.managerName : game.game_state?.managers?.home?.managerName
    if (!window.confirm(`Cancel this game against ${opponent ?? 'your opponent'}?\n\nIt has not started, so no result is recorded and you are both free to start another game. This cannot be undone. (To just leave a game and come back later, use Exit instead.)`)) return
    setBusy(true); setError(''); setSuccess('')
    try {
      updateGame(await cancelGameplayGame(game.id))
      setActiveGame(await loadMyActiveGame())
      setSuccess('Game cancelled before the first pitch. No result was recorded.')
    } catch (e) {
      setError(errorText(e, 'Could not cancel the game.'))
    } finally {
      setBusy(false)
    }
  }

  async function terminateGame(game: PersistedGameplayLabGame) {
    const reason = window.prompt('End this game without a result.\n\nNo win, loss or forfeit is recorded and rest tracking is not applied; both managers are released. The reason is saved with the game.\n\nReason:')
    if (reason === null) return
    setBusy(true); setError(''); setSuccess('')
    try {
      updateGame(await terminateGameplayGame(game.id, reason))
      setActiveGame(await loadMyActiveGame())
      setSuccess('Game ended without a result.')
    } catch (e) {
      setError(errorText(e, 'Could not end the game.'))
    } finally {
      setBusy(false)
    }
  }

  const blocked = twoPlayer && activeGame !== null
  const activeRow = activeGame ? savedGames.find((g) => g.id === activeGame.game_id) ?? null : null

  if (loading || !accessChecked) {
    return <main className="gameplay-lab-page"><section className="gameplay-lab-panel">Loading gameplay…</section></main>
  }

  if (!hasAccess) {
    return (
      <main className="gameplay-lab-page">
        <section className="gameplay-lab-panel gameplay-lab-locked">
          <span>Private Development</span>
          <h1>Gameplay</h1>
          <p>Gameplay testing is not enabled for this account.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="gameplay-lab-page">
      <section className="gameplay-lab-hero">
        <div>
          <span>Private Testing</span>
          <h1>Play a game</h1>
          <p>Challenge another manager. You are home; they set their own pregame and manage their own team from their own screen.</p>
        </div>
        <div className="gameplay-lab-season-card">
          <Link className="gameplay-lab-open-button" to="/games/lab/verification">Targeted Verification</Link>
          <small>Active Configuration</small>
          <strong>{ACTIVE_SEASON_CONFIG.seasonLabel} · {ACTIVE_SEASON_CONFIG.blueprintLabel}</strong>
          <span>{ACTIVE_SEASON_CONFIG.rosterSize} players · {ACTIVE_SEASON_CONFIG.pointCap.toLocaleString()} pts · DH {ACTIVE_SEASON_CONFIG.useDh ? 'ON' : 'OFF'}</span>
        </div>
      </section>

      {/* The database decides this (gameplay_settings); the page only says it. */}
      {!permissions.official_tracking_enabled && (
        <div className="gameplay-lab-message gameplay-lab-prelaunch">
          <b>Pre-launch testing.</b> Games play, save and finish normally, but nothing counts toward official
          records — no game counts, milestones, rest or fatigue carry-over — until Elements Baseball is declared live.
        </div>
      )}
      {error && <div className="gameplay-lab-message error">{error}</div>}
      {success && <div className="gameplay-lab-message success">{success}</div>}

      {/* One unfinished competitive game per manager. Leaving the game screen
          (Exit) never ends it; finishing it, or cancelling before the first
          pitch, does. */}
      {activeGame && (
        <section className="gameplay-lab-panel gameplay-lab-active">
          <div>
            <span>Your active game</span>
            <h2>vs. {activeGame.opponent_name ?? 'your opponent'}</h2>
            <p>
              You can be in one unfinished game at a time. Exit only leaves the game screen — the game stays
              active until it is finished{activeRow && canCancelBeforeFirstPitch(activeRow.game_state) ? ', or cancelled before the first pitch' : ''}.
            </p>
          </div>
          <Link className="gameplay-lab-create-button" to={activeRow ? gameLink(activeRow).to : `/games/lab/${activeGame.game_id}/screen`}>
            Resume Active Game
          </Link>
        </section>
      )}

      <section className="gameplay-lab-panel">
        <header>
          <div>
            <span>New game</span>
            <h2>Challenge a manager</h2>
          </div>
          <em>Only managers with gameplay access are listed.</em>
        </header>

        <div className="gameplay-lab-create-grid">
          <label>
            <span>Opponent</span>
            <select value={selectedOpponentId} onChange={(event) => setSelectedOpponentId(event.target.value)}>
              {opponents.length === 0 && <option value="">No other managers have gameplay access</option>}
              {opponents.map((opponent) => (
                <option value={opponent.user_id} key={opponent.user_id}>{opponent.manager_name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Your Saved Roster</span>
            <select value={selectedLineupId} onChange={(event) => setSelectedLineupId(event.target.value)}>
              {choices.length === 0 && <option value="">No saved rosters found</option>}
              {choices.map((c) => (
                <option value={c.lineup.id} key={c.lineup.id}>{c.lineup.name} — {c.eligibility.eligible ? 'eligible' : 'ineligible'}</option>
              ))}
            </select>
            <small>{selected ? rosterIssueSummary(selected.eligibility.issues) : 'Choose a saved roster.'}</small>
          </label>
        </div>

        {/* One-screen test games are a testers' tool; they never count toward
            the one-game limit and never touch rest tracking. */}
        {permissions.can_create_test_games && (
          <label className="gameplay-lab-toggle">
            <input type="checkbox" checked={twoPlayer} onChange={(e) => setTwoPlayer(e.target.checked)} />
            <span>
              <b>Two-player game</b>
              <small>{twoPlayer
                ? `${selectedOpponent?.manager_name ?? 'Your opponent'} plays their own team from their own screen. Dice are rolled by the server.`
                : 'One-screen test: you play both sides with a copy of your roster. Not counted toward the one-game limit; no rest tracking.'}</small>
            </span>
          </label>
        )}

        {blocked && (
          <p className="gameplay-lab-message error">
            You already have an active game. Finish or exit that game before starting another.
          </p>
        )}

        <button
          className="gameplay-lab-create-button"
          type="button"
          disabled={creating || blocked || !selectedOpponent || !selected?.eligibility.eligible}
          onClick={() => void createGame()}
        >
          {creating ? 'Creating…' : 'Create Game'}
        </button>
      </section>

      <section className="gameplay-lab-panel">
        <header>
          <div>
            <span>Your games</span>
            <h2>Games</h2>
          </div>
          <em>Games you created and games you were challenged to.</em>
        </header>
        <div className="gameplay-lab-saved-list">
          {savedGames.length === 0 ? (
            <p className="gameplay-lab-empty">No games yet.</p>
          ) : (
            savedGames.map((game) => (
              <GameSummary key={game.id} game={game} userId={user?.id ?? ''} active={game.id === activeGame?.game_id}
                canTerminate={permissions.can_terminate_games} busy={busy} onCancel={(g) => void cancelGame(g)} onTerminate={(g) => void terminateGame(g)} />
            ))
          )}
        </div>
      </section>
    </main>
  )
}

function errorText(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') return (e as { message: string }).message
  return fallback
}
