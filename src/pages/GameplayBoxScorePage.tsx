import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { loadGameplayLabGame, type PersistedGameplayLabGame } from '../gameplay/gameRepository'
import BoxScoreView from '../gameplay/presentation/BoxScoreView'
import type { GameSide } from '../gameplay/types'

/**
 * Game history: one game's box score and play-by-play, read from its saved
 * state. Reading it writes nothing. Exhibition games are labelled as such;
 * games from before the play log show only what they reliably hold.
 */
export default function GameplayBoxScorePage() {
  const { gameId } = useParams()
  const [game, setGame] = useState<PersistedGameplayLabGame | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameId) return
    let live = true
    loadGameplayLabGame(gameId)
      .then((g) => { if (live) setGame(g) })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'The game could not be loaded.') })
    return () => { live = false }
  }, [gameId])

  const state = game?.game_state
  const managers: Record<GameSide, string> | undefined = state ? { away: state.managers.away.managerName, home: state.managers.home.managerName } : undefined

  return (
    <main className="gameplay-lab-shell gp-box-page">
      <p><Link to="/games/lab">← Games</Link></p>
      {error && <p className="gameplay-lab-error" role="alert">{error}</p>}
      {!error && !state && <p>Loading…</p>}
      {state && managers && (
        <>
          <h1 className="gp-box-title">{managers.away} {state.score.away} — {managers.home} {state.score.home}</h1>
          <BoxScoreView state={state} progression={game?.progression ?? null} managers={managers} />
        </>
      )}
    </main>
  )
}
