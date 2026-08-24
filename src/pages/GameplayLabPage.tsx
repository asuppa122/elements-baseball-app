import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  attachPregameRoster,
  createInitialGameState,
} from '../gameplay/engine'
import {
  createGameplayLabGame,
  hasGameplayLabAccess,
  loadCardsForGameplayRoster,
  loadGameplayLabGames,
  loadGameplayLabOpponents,
  loadOwnGameplayLineups,
  type GameplayLabLineup,
  type GameplayLabOpponent,
  type PersistedGameplayLabGame,
} from '../gameplay/gameRepository'
import {
  createGameRosterSnapshot,
  validateRosterForGame,
  type RosterEligibilityIssue,
  type SavedRosterForGame,
} from '../gameplay/rosterSnapshot'
import { ACTIVE_SEASON_CONFIG } from '../gameplay/seasonConfig'
import type { CardRecord } from '../types/card'

function asSavedRoster(lineup: GameplayLabLineup): SavedRosterForGame {
  return {
    id: lineup.id,
    name: lineup.name,
    useDh: lineup.use_dh,
    playerCount: lineup.player_count,
    totalPoints: lineup.total_points,
    rosterState: {
      assigned: lineup.roster_state?.assigned ?? {},
      rosterFormat: lineup.roster_state?.rosterFormat,
      useDh: lineup.roster_state?.useDh ?? lineup.use_dh,
      seasonEligibleOnly: lineup.roster_state?.seasonEligibleOnly ?? true,
    },
  }
}

function rosterIssueSummary(issues: RosterEligibilityIssue[]): string {
  if (issues.length === 0) return 'Eligible for Season 10.1 gameplay.'
  return issues.map((issue) => issue.message).join(' ')
}

function GameSummary({ game }: { game: PersistedGameplayLabGame }) {
  const rosterName = game.home_roster_snapshot?.sourceLineupName ?? 'Roster not attached'
  const opponent = game.game_state?.managers?.away?.managerName ?? 'Opponent'

  return (
    <article className="gameplay-lab-saved-game">
      <div>
        <span>{game.season_id} · {game.season_year}</span>
        <strong>Anthony vs. {opponent}</strong>
        <small>{rosterName}</small>
      </div>
      <div className="gameplay-lab-saved-actions">
        <dl>
          <div><dt>Status</dt><dd>{game.status.replaceAll('_', ' ')}</dd></div>
          <div><dt>State</dt><dd>v{game.state_version}</dd></div>
          <div><dt>Created</dt><dd>{new Date(game.created_at).toLocaleString()}</dd></div>
        </dl>
        <Link className="gameplay-lab-open-button" to={`/games/lab/${game.id}/pregame`}>Open Pregame</Link>
      </div>
    </article>
  )
}

export default function GameplayLabPage() {
  const { user, profile, isDemo } = useAuth()
  const [accessChecked, setAccessChecked] = useState(false)
  const [hasAccess, setHasAccess] = useState(false)
  const [opponents, setOpponents] = useState<GameplayLabOpponent[]>([])
  const [lineups, setLineups] = useState<GameplayLabLineup[]>([])
  const [cardsByLineup, setCardsByLineup] = useState<Record<string, Map<string, CardRecord>>>({})
  const [savedGames, setSavedGames] = useState<PersistedGameplayLabGame[]>([])
  const [selectedOpponentId, setSelectedOpponentId] = useState('')
  const [selectedLineupId, setSelectedLineupId] = useState('')
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

        const [nextOpponents, nextLineups, nextGames] = await Promise.all([
          loadGameplayLabOpponents(),
          loadOwnGameplayLineups(),
          loadGameplayLabGames(),
        ])
        if (cancelled) return

        setOpponents(nextOpponents)
        setLineups(nextLineups)
        setSavedGames(nextGames)
        setSelectedOpponentId((current) => current || nextOpponents[0]?.user_id || '')
        setSelectedLineupId((current) => current || nextLineups[0]?.id || '')

        const cardMaps: Record<string, Map<string, CardRecord>> = {}
        await Promise.all(nextLineups.map(async (lineup) => {
          const assigned = Object.values(lineup.roster_state?.assigned ?? {}).filter(Boolean)
          const cards = await loadCardsForGameplayRoster(assigned)
          cardMaps[lineup.id] = new Map(cards.map((card) => [card.card_key, card]))
        }))
        if (!cancelled) setCardsByLineup(cardMaps)
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load gameplay lab.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadLab()
    return () => { cancelled = true }
  }, [user?.id, isDemo])

  const lineupEligibility = useMemo(() => {
    const results: Record<string, ReturnType<typeof validateRosterForGame> | null> = {}
    for (const lineup of lineups) {
      const cardMap = cardsByLineup[lineup.id]
      results[lineup.id] = cardMap
        ? validateRosterForGame(asSavedRoster(lineup), cardMap, ACTIVE_SEASON_CONFIG)
        : null
    }
    return results
  }, [lineups, cardsByLineup])

  const selectedOpponent = opponents.find((opponent) => opponent.user_id === selectedOpponentId) ?? null
  const selectedLineup = lineups.find((lineup) => lineup.id === selectedLineupId) ?? null
  const selectedEligibility = selectedLineup ? lineupEligibility[selectedLineup.id] : null

  async function createTestGame() {
    if (!user || !profile || !selectedOpponent || !selectedLineup) return
    const cardMap = cardsByLineup[selectedLineup.id]
    if (!cardMap || !selectedEligibility?.eligible) return

    setCreating(true)
    setError('')
    setSuccess('')

    try {
      const gameId = crypto.randomUUID()
      const rosterSnapshot = createGameRosterSnapshot(
        asSavedRoster(selectedLineup),
        cardMap,
        ACTIVE_SEASON_CONFIG,
      )

      const initial = createInitialGameState({
        gameId,
        configuration: ACTIVE_SEASON_CONFIG,
        homeManager: {
          userId: user.id,
          managerName: profile.manager_name,
        },
        awayManager: {
          userId: selectedOpponent.user_id,
          managerName: selectedOpponent.manager_name,
        },
      })

      const withRoster = attachPregameRoster(initial, 'home', rosterSnapshot)
      const created = await createGameplayLabGame(withRoster)
      setSavedGames((current) => [created, ...current])
      setSuccess(`Private test game created: ${profile.manager_name} vs. ${selectedOpponent.manager_name}. Refresh this page to verify it persists.`)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create test game.')
    } finally {
      setCreating(false)
    }
  }

  if (loading || !accessChecked) {
    return <main className="gameplay-lab-page"><section className="gameplay-lab-panel">Loading private gameplay lab…</section></main>
  }

  if (!hasAccess) {
    return (
      <main className="gameplay-lab-page">
        <section className="gameplay-lab-panel gameplay-lab-locked">
          <span>Private Development</span>
          <h1>Gameplay Lab</h1>
          <p>This unreleased gameplay prototype is not enabled for this account.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="gameplay-lab-page">
      <section className="gameplay-lab-hero">
        <div>
          <span>Private Development · Sandbox</span>
          <h1>Gameplay Phase 1A</h1>
          <p>Create a frozen Season 10.1 game record and prove that it survives a browser refresh before we add pregame locking or live gameplay.</p>
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
            <span>Step 1</span>
            <h2>Create Private Test Game</h2>
          </div>
          <em>Only your account can create/read these lab games.</em>
        </header>

        <div className="gameplay-lab-create-grid">
          <label>
            <span>Opponent</span>
            <select value={selectedOpponentId} onChange={(event) => setSelectedOpponentId(event.target.value)}>
              {opponents.length === 0 && <option value="">No other claimed managers found</option>}
              {opponents.map((opponent) => (
                <option value={opponent.user_id} key={opponent.user_id}>{opponent.manager_name}</option>
              ))}
            </select>
            <small>Opponent access is disabled during this private slice.</small>
          </label>

          <label>
            <span>Your Saved Roster</span>
            <select value={selectedLineupId} onChange={(event) => setSelectedLineupId(event.target.value)}>
              {lineups.length === 0 && <option value="">No saved rosters found</option>}
              {lineups.map((lineup) => {
                const eligibility = lineupEligibility[lineup.id]
                const state = eligibility === null ? 'checking' : eligibility.eligible ? 'eligible' : 'ineligible'
                return <option value={lineup.id} key={lineup.id}>{lineup.name} — {state}</option>
              })}
            </select>
            <small>{selectedEligibility ? rosterIssueSummary(selectedEligibility.issues) : 'Checking roster against the active season configuration…'}</small>
          </label>
        </div>

        <div className="gameplay-lab-roster-list">
          {lineups.map((lineup) => {
            const eligibility = lineupEligibility[lineup.id]
            return (
              <article className={`gameplay-lab-roster ${eligibility?.eligible ? 'eligible' : 'ineligible'}`} key={lineup.id}>
                <div>
                  <strong>{lineup.name}</strong>
                  <span>{lineup.player_count} players · {lineup.total_points.toLocaleString()} pts · DH {lineup.use_dh ? 'ON' : 'OFF'}</span>
                </div>
                <div>
                  <b>{eligibility === null ? 'Checking…' : eligibility.eligible ? 'Eligible' : 'Ineligible'}</b>
                  {eligibility && <small>{rosterIssueSummary(eligibility.issues)}</small>}
                </div>
              </article>
            )
          })}
        </div>

        <button
          className="gameplay-lab-create-button"
          type="button"
          disabled={creating || !selectedOpponent || !selectedLineup || !selectedEligibility?.eligible}
          onClick={() => void createTestGame()}
        >
          {creating ? 'Creating Frozen Game…' : 'Create Private Test Game'}
        </button>
      </section>

      <section className="gameplay-lab-panel">
        <header>
          <div>
            <span>Persistence Check</span>
            <h2>Saved Test Games</h2>
          </div>
          <em>Refresh the browser. These records should still be here.</em>
        </header>
        <div className="gameplay-lab-saved-list">
          {savedGames.length === 0 ? (
            <p className="gameplay-lab-empty">No gameplay lab records yet.</p>
          ) : (
            savedGames.map((game) => <GameSummary key={game.id} game={game} />)
          )}
        </div>
      </section>
    </main>
  )
}
