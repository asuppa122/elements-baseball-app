import { useCallback, useEffect, useRef, useState } from 'react'
import GameplayScreenView from '../gameplay/presentation/GameplayScreenView'
import { type LogEvent } from '../gameplay/presentation/GameLogPanel'
import { useGameplayActions } from '../gameplay/presentation/useGameplayActions'
import { createInitialGameState, startGame } from '../gameplay/engine'
import { createGameplayDevDb, DEV_USERS, type DevDb } from '../gameplay/devDb'
import type { PersistedGameplayLabGame } from '../gameplay/gameRepository'
import type { GameSide, GameState } from '../gameplay/types'
import midgame from '../gameplay/sandbox/states/midgame.json'

/**
 * A two-player game against a real Postgres in the browser. DEVELOPMENT ONLY.
 *
 * Two managers at two screens cannot be exercised by one person signed in
 * once, and the two-player migration cannot be tried live before it is
 * applied. This page runs both halves locally: PGlite (Postgres 18 in wasm)
 * with every gameplay migration applied, including the two-player one, and a
 * switch for which manager's screen you are looking at. Every move goes
 * through the real save function -- turn checks, other-team checks, server
 * dice -- exactly as it would live, and each "screen" learns about the other
 * manager's moves the same way the live one does, by polling the version.
 *
 * The route only exists in `npm run dev` (see App.tsx); PGlite never ships.
 */

const MANAGERS: Record<GameSide, { userId: string; name: string }> = {
  home: { userId: DEV_USERS.home, name: 'Anthony' },
  away: { userId: DEV_USERS.away, name: 'Will' },
}

/** A fresh two-player game from the sandbox's real rosters, started and waiting on the first pitch. */
function freshGame(): GameState {
  const source = midgame as unknown as GameState
  const initial = createInitialGameState({
    gameId: crypto.randomUUID(),
    configuration: source.configuration,
    homeManager: { userId: MANAGERS.home.userId, managerName: MANAGERS.home.name },
    awayManager: { userId: MANAGERS.away.userId, managerName: MANAGERS.away.name },
  })
  const ready: GameState = {
    ...initial,
    status: 'ready',
    turnHandshake: true,
    restState: { home: {}, away: {} },
    pregame: {
      home: { ...structuredClone(source.pregame.home), locked: true },
      away: { ...structuredClone(source.pregame.away), locked: true },
    },
  }
  return startGame(ready)
}

export default function GameplayDuelPage() {
  const [dev, setDev] = useState<DevDb | null>(null)
  const [game, setGame] = useState<PersistedGameplayLabGame | null>(null)
  const [events, setEvents] = useState<LogEvent[]>([])
  const [viewing, setViewing] = useState<GameSide>('away')
  const [bootError, setBootError] = useState('')
  const versionRef = useRef<number | null>(null)
  versionRef.current = game?.state_version ?? null

  const boot = useCallback(async (existing?: DevDb) => {
    try {
      const db = existing ?? await createGameplayDevDb()
      const state = freshGame()
      // One active game per manager: a new duel ends the previous one first.
      await db.endAll()
      await db.createGame(MANAGERS.home.userId, state)
      setDev(db)
      setGame(await db.load(MANAGERS.home.userId, state.gameId))
      setEvents([])
    } catch (e) {
      setBootError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => { void boot() }, [boot])

  const refresh = useCallback(async () => {
    if (!dev || !game) return
    const user = MANAGERS[viewing].userId
    setGame(await dev.load(user, game.id))
    setEvents((await dev.events(user, game.id)) as unknown as LogEvent[])
  }, [dev, game, viewing])

  // Each "screen" hears about the other manager's moves by polling, as live.
  useEffect(() => {
    if (!dev || !game) return
    const timer = window.setInterval(async () => {
      const latest = await dev.load(MANAGERS[viewing].userId, game.id)
      if (versionRef.current !== null && latest.state_version > versionRef.current) await refresh()
    }, 800)
    return () => window.clearInterval(timer)
  }, [dev, game, viewing, refresh])

  const actions = useGameplayActions({
    game,
    userId: MANAGERS[viewing].userId,
    surface: 'screen',
    onSaved: setGame,
    onAfterSave: async () => { await refresh() },
    onStale: refresh,
    saveState: (args) => {
      if (!dev) throw new Error('Database still starting.')
      return dev.save(MANAGERS[viewing].userId, args)
    },
    rollDie: (state, gameId, kind) => {
      if (!dev) throw new Error('Database still starting.')
      return dev.roll(MANAGERS[viewing].userId, gameId, state.stateVersion, kind)
    },
  })

  if (bootError) return <main className="gp-screen"><div className="gp-panel gp-region">Could not start the local database: {bootError}</div></main>
  if (!game || !dev) return <main className="gp-screen"><div className="gp-panel gp-region">Starting a local Postgres with the gameplay migrations…</div></main>

  const banner = (
    <div className="gp-wip gp-sandbox-bar">
      <b>Duel · dev</b>
      <span className="gp-sandbox-blurb">
        Two-player game on a real local Postgres. Switch screens to play each manager; every move goes through the live save rules and server dice.
      </span>
      <span className="gp-sandbox-scenarios">
        {(['away', 'home'] as GameSide[]).map((side) => (
          <button key={side} className="gp-action gp-action-secondary" aria-current={viewing === side}
            onClick={() => { actions.setError(''); actions.setNotice(''); setViewing(side) }}>
            {MANAGERS[side].name}'s screen ({side})
          </button>
        ))}
        <button className="gp-action gp-action-secondary" onClick={() => void boot(dev)}>New game</button>
      </span>
    </div>
  )

  return (
    <GameplayScreenView
      state={game.game_state as GameState}
      events={events}
      actions={actions}
      transition={null}
      onDismissTransition={() => undefined}
      onExit={() => void boot(dev)}
      banner={banner}
      viewerSide={viewing}
      actingSides={[viewing]}
    />
  )
}
