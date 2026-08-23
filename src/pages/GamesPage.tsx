import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  hasGameplayLabAccess,
  loadCardsForGameplayRoster,
  loadGameplayActiveRosters,
  loadGameplayLabGames,
  type GameplayActiveRoster,
  type PersistedGameplayLabGame,
} from '../gameplay/gameRepository'
import {
  validateRosterForGame,
  type RosterEligibilityResult,
  type SavedRosterForGame,
} from '../gameplay/rosterSnapshot'
import { ACTIVE_SEASON_CONFIG } from '../gameplay/seasonConfig'
import type { CardRecord } from '../types/card'

function toSavedRoster(row: GameplayActiveRoster): SavedRosterForGame | null {
  if (!row.lineup_id || !row.lineup_name || row.use_dh === null) return null
  return {
    id: row.lineup_id,
    name: row.lineup_name,
    useDh: row.use_dh,
    playerCount: row.player_count ?? 0,
    totalPoints: row.total_points ?? 0,
    rosterState: {
      assigned: row.roster_state?.assigned ?? {},
      rosterFormat: row.roster_state?.rosterFormat,
      useDh: row.roster_state?.useDh ?? row.use_dh,
      seasonEligibleOnly: row.roster_state?.seasonEligibleOnly ?? true,
    },
  }
}

function statusText(row: GameplayActiveRoster, result: RosterEligibilityResult | null) {
  if (!row.lineup_id) return 'No active roster saved.'
  if (!result) return 'Checking active roster…'
  if (result.eligible) return `Eligible for ${ACTIVE_SEASON_CONFIG.seasonLabel}.`
  return result.issues.map((issue) => issue.message).join(' ')
}

export default function GamesPage() {
  const { user, profile, isDemo } = useAuth()
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [rows, setRows] = useState<GameplayActiveRoster[]>([])
  const [results, setResults] = useState<Record<string, RosterEligibilityResult | null>>({})
  const [games, setGames] = useState<PersistedGameplayLabGame[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user || isDemo) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const hasAccess = await hasGameplayLabAccess()
        if (cancelled) return
        setAllowed(hasAccess)
        if (!hasAccess) return
        const [activeRows, savedGames] = await Promise.all([
          loadGameplayActiveRosters(),
          loadGameplayLabGames(),
        ])
        if (cancelled) return
        setRows(activeRows)
        setGames(savedGames)

        const next: Record<string, RosterEligibilityResult | null> = {}
        await Promise.all(activeRows.map(async (row) => {
          const roster = toSavedRoster(row)
          if (!roster) {
            next[row.user_id] = null
            return
          }
          const cardKeys = Object.values(roster.rosterState.assigned ?? {}).filter(Boolean)
          const cards = await loadCardsForGameplayRoster(cardKeys)
          const map = new Map<string, CardRecord>(cards.map((card) => [card.card_key, card]))
          next[row.user_id] = validateRosterForGame(roster, map, ACTIVE_SEASON_CONFIG)
        }))
        if (!cancelled) setResults(next)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load Games.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [user?.id, isDemo])

  const own = rows.find((row) => row.user_id === user?.id) ?? null
  const ownEligible = own ? results[own.user_id]?.eligible === true : false
  const eligibleOpponents = useMemo(
    () => rows.filter((row) => row.user_id !== user?.id && results[row.user_id]?.eligible === true),
    [rows, results, user?.id],
  )

  if (loading) return <main className="games-hub-page"><section className="games-hub-panel">Loading Games…</section></main>

  if (!allowed) {
    return <main className="games-hub-page"><section className="games-hub-panel"><span>Coming Soon</span><h1>Games</h1><p>The playable game is still in private development.</p></section></main>
  }

  return (
    <main className="games-hub-page">
      <section className="games-hub-hero">
        <div>
          <span>Playable Games · Private Build</span>
          <h1>Games</h1>
          <p>Certified engine underneath. Simple human-play shell on top.</p>
        </div>
        <div className="games-hub-season">
          <small>Active Season</small>
          <strong>{ACTIVE_SEASON_CONFIG.seasonLabel} · {ACTIVE_SEASON_CONFIG.blueprintLabel}</strong>
          <span>{ACTIVE_SEASON_CONFIG.rosterSize} players · {ACTIVE_SEASON_CONFIG.pointCap.toLocaleString()} pts · DH {ACTIVE_SEASON_CONFIG.useDh ? 'ON' : 'OFF'}</span>
        </div>
      </section>

      {error && <div className="games-hub-message error">{error}</div>}

      <section className="games-hub-panel games-hub-start">
        <header><div><span>New Game</span><h2>{profile?.manager_name ?? 'Manager'} vs. Opponent</h2></div></header>
        <p>{eligibleOpponents.length > 0 && ownEligible
          ? `${eligibleOpponents.length} eligible opponent${eligibleOpponents.length === 1 ? '' : 's'} available for the next integration step.`
          : 'A real game will unlock when your active roster and at least one opponent active roster pass the Season 10.1 rules.'}</p>
        <button type="button" disabled className="games-hub-primary">Start New Game — Next Build</button>
      </section>

      <section className="games-hub-panel">
        <header><div><span>Roster Readiness</span><h2>Active Season Eligibility</h2></div><em>“Active” alone does not mean gameplay eligible.</em></header>
        <div className="games-roster-status-grid">
          {rows.map((row) => {
            const result = results[row.user_id]
            const eligible = result?.eligible === true
            const isYou = row.user_id === user?.id
            return (
              <article key={row.user_id} className={`games-roster-status ${eligible ? 'eligible' : 'ineligible'}`}>
                <div><strong>{row.manager_name}{isYou ? ' · YOU' : ''}</strong><span>{row.lineup_name ?? 'No active roster'}</span></div>
                <b>{eligible ? 'ELIGIBLE' : 'NOT READY'}</b>
                <small>{statusText(row, result)}</small>
              </article>
            )
          })}
        </div>
      </section>

      <section className="games-hub-panel">
        <header><div><span>Continue</span><h2>Development Games</h2></div><em>Existing lab games remain isolated from the certified engine baseline.</em></header>
        <div className="games-continue-list">
          {games.length === 0 && <p>No development games saved yet.</p>}
          {games.map((game) => (
            <article key={game.id}>
              <div><strong>{game.game_state.managers.home.managerName} vs. {game.game_state.managers.away.managerName}</strong><span>{game.status.replaceAll('_', ' ')} · state v{game.state_version}</span></div>
              <div className="games-continue-actions">
                <Link to={`/games/lab/${game.id}/play`}>Open Playable Shell</Link>
                <Link to={`/games/lab/${game.id}/state`}>Developer State</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="games-hub-dev-link"><Link to="/games/lab">Open Gameplay Lab</Link></div>
    </main>
  )
}
