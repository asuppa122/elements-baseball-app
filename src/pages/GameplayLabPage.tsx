import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { attachPregameRoster, createInitialGameState } from '../gameplay/engine'
import {
  createGameplayLabGame,
  hasGameplayLabAccess,
  loadGameplayLabGames,
  loadGameplayOpponents,
  type GameplayLabOpponent,
  type PersistedGameplayLabGame,
} from '../gameplay/gameRepository'
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
  if (twoPlayer) return { to: `/games/lab/${game.id}/screen`, label: s.status === 'complete' ? 'View Final' : 'Play' }
  return { to: `/games/lab/${game.id}/screen`, label: 'Open Game' }
}

function GameSummary({ game, userId }: { game: PersistedGameplayLabGame; userId: string }) {
  const s = game.game_state as GameState
  const mySide: GameSide = s?.managers?.away?.userId === userId ? 'away' : 'home'
  const opponentSide: GameSide = mySide === 'home' ? 'away' : 'home'
  const opponent = s?.managers?.[opponentSide]?.managerName ?? 'Opponent'
  const twoPlayer = s?.turnHandshake === true
  const toAct = s ? sideToAct(s) : null
  const turn = !twoPlayer ? 'One-screen test'
    : s.status === 'complete' ? `Final ${s.score.away}–${s.score.home}`
    : s.status === 'pregame' ? (s.pregame[mySide].locked ? `Waiting on ${opponent}'s pregame` : 'Your pregame')
    : s.status === 'ready' ? 'Ready to start'
    : toAct === mySide ? 'Your move' : `Waiting on ${opponent}`
  const link = gameLink(game)

  return (
    <article className="gameplay-lab-saved-game">
      <div>
        <span>{game.season_id} · You are {mySide}</span>
        <strong>vs. {opponent}</strong>
        <small>{turn}</small>
      </div>
      <div className="gameplay-lab-saved-actions">
        <dl>
          <div><dt>Status</dt><dd>{game.status.replaceAll('_', ' ')}</dd></div>
          <div><dt>State</dt><dd>v{game.state_version}</dd></div>
          <div><dt>Created</dt><dd>{new Date(game.created_at).toLocaleString()}</dd></div>
        </dl>
        <Link className="gameplay-lab-open-button" to={link.to}>{link.label}</Link>
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

        const [nextOpponents, nextChoices, nextGames] = await Promise.all([
          loadGameplayOpponents(),
          loadLineupChoices(),
          loadGameplayLabGames(),
        ])
        if (cancelled) return

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
      setSuccess(twoPlayer
        ? `Game created: ${profile.manager_name} (home) vs. ${selectedOpponent.manager_name} (away). Set your pregame; ${selectedOpponent.manager_name} will see it in their games list.`
        : `One-screen test game created vs. ${selectedOpponent.manager_name}.`)
    } catch (createError) {
      setError(errorText(createError, 'Could not create the game.'))
    } finally {
      setCreating(false)
    }
  }

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

      {error && <div className="gameplay-lab-message error">{error}</div>}
      {success && <div className="gameplay-lab-message success">{success}</div>}

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

        <label className="gameplay-lab-toggle">
          <input type="checkbox" checked={twoPlayer} onChange={(e) => setTwoPlayer(e.target.checked)} />
          <span>
            <b>Two-player game</b>
            <small>{twoPlayer
              ? `${selectedOpponent?.manager_name ?? 'Your opponent'} plays their own team from their own screen. Dice are rolled by the server.`
              : 'One-screen test: you play both sides with a copy of your roster.'}</small>
          </span>
        </label>

        <button
          className="gameplay-lab-create-button"
          type="button"
          disabled={creating || !selectedOpponent || !selected?.eligibility.eligible}
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
            savedGames.map((game) => <GameSummary key={game.id} game={game} userId={user?.id ?? ''} />)
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
