import { useCallback, useMemo, useRef, useState } from 'react'
import GameplayScreenView from '../gameplay/presentation/GameplayScreenView'
import { type LogEvent } from '../gameplay/presentation/GameLogPanel'
import { useGameplayActions, type SaveGameState } from '../gameplay/presentation/useGameplayActions'
import { buildHalfInningTransition, previousHalf } from '../gameplay/halfInningTransition'
import type { PersistedGameplayLabGame } from '../gameplay/gameRepository'
import type { GameState } from '../gameplay/types'

import midgame from '../gameplay/sandbox/states/midgame.json'
import decision from '../gameplay/sandbox/states/decision.json'
import final from '../gameplay/sandbox/states/final.json'

/**
 * A playable gameplay screen with no account and no database.
 *
 * This route exists so someone outside the league can review the real screen
 * rather than a picture of it. It renders GameplayScreenView -- the same
 * component the live screen uses -- and drives it with the same action layer,
 * so every roll, chart result and manager decision runs the production
 * resolvers. Feedback on this therefore applies to the real thing.
 *
 * WHY IT CANNOT TOUCH PRODUCTION
 *   The engine never talks to the network: engine.ts, coreGame.ts and
 *   decisionEngine.ts make no requests at all, so play is pure computation.
 *   The single Supabase dependency is the write in useGameplayActions, and
 *   this page passes its own `saveState` that keeps the next state in React.
 *   Nothing here imports gameRepository's writers, so there is no path from a
 *   click on this page to a row in the database.
 *
 * The states are real games, exported and stripped of identity by
 * scripts/build-sandbox-states.mjs -- see that file for exactly what was
 * removed. The pending-decision fixture is a genuinely stranded game: it holds
 * GB_RUNNER_2B_RFO, renamed to _RTH in 56e0cde, so it was unresolvable until
 * the read-time alias in decisionEngine landed. It stays here on purpose -- it
 * is the real-data proof that the alias works, not just a harness fixture. This route is deliberately outside AuthGate: it must work signed
 * out, which is the whole point.
 */

type Scenario = { key: string; label: string; blurb: string; state: GameState }

const SCENARIOS: Scenario[] = [
  {
    key: 'midgame',
    label: 'Mid-game',
    blurb: 'Bottom of the 1st, one out, runner on. Roll pitches to play it forward, or use a manager decision to open the decision board.',
    state: midgame as unknown as GameState,
  },
  {
    key: 'decision',
    label: 'Pending decision',
    blurb: 'A ground ball with a runner on 2nd, waiting on the Roll-To-Hold. Roll it to see a decision resolve.',
    state: decision as unknown as GameState,
  },
  {
    key: 'final',
    label: 'Final',
    blurb: 'A finished game, showing the post-game board and final line.',
    state: final as unknown as GameState,
  },
]

/** Wraps a bare GameState in the row shape the screen expects. */
function asGame(state: GameState, key: string): PersistedGameplayLabGame {
  return {
    id: `sandbox-${key}`,
    game_state: state,
    state_version: state.stateVersion,
  } as unknown as PersistedGameplayLabGame
}

export default function GameplaySandboxPage() {
  const [scenarioKey, setScenarioKey] = useState(SCENARIOS[0].key)
  const scenario = SCENARIOS.find((s) => s.key === scenarioKey) ?? SCENARIOS[0]

  const [game, setGame] = useState<PersistedGameplayLabGame>(() => asGame(scenario.state, scenario.key))
  const [events, setEvents] = useState<LogEvent[]>([])
  const [lastHalfSeen, setLastHalfSeen] = useState<string | null>(null)
  const [transitionDismissed, setTransitionDismissed] = useState<string | null>(null)
  const seq = useRef(0)

  const load = useCallback((key: string) => {
    const next = SCENARIOS.find((s) => s.key === key) ?? SCENARIOS[0]
    setScenarioKey(key)
    setGame(asGame(structuredClone(next.state), key))
    setEvents([])
    setLastHalfSeen(`${next.state.inning}-${next.state.half}`)
    setTransitionDismissed(null)
  }, [])

  /**
   * The persistence swap. Same signature as the Supabase writer, so the action
   * layer is unchanged; it just returns the next state instead of saving it,
   * and appends the event the real one would have recorded so the game log and
   * play recap behave normally.
   */
  const saveState: SaveGameState = useCallback(async ({ gameId, nextState, eventType, eventPayload }) => {
    seq.current += 1
    setEvents((prev) => [...prev, {
      state_version: nextState.stateVersion,
      event_type: eventType,
      payload: eventPayload,
    } as unknown as LogEvent])
    return {
      id: gameId,
      game_state: nextState,
      state_version: nextState.stateVersion,
    } as unknown as PersistedGameplayLabGame
  }, [])

  const actions = useGameplayActions({
    game,
    userId: 'sandbox',
    surface: 'screen',
    onSaved: setGame,
    saveState,
  })

  const state = game.game_state as GameState
  const halfKey = `${state.inning}-${state.half}`
  const justEnded = lastHalfSeen !== null && lastHalfSeen !== halfKey
    ? previousHalf(state.inning, state.half)
    : null
  const transition = justEnded && transitionDismissed !== halfKey
    ? buildHalfInningTransition(state, events, justEnded)
    : null

  const banner = useMemo(() => (
    <div className="gp-wip gp-sandbox-bar">
      <b>Sandbox</b>
      <span className="gp-sandbox-blurb">{scenario.blurb}</span>
      <span className="gp-sandbox-scenarios">
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            className="gp-action gp-action-secondary"
            aria-current={s.key === scenarioKey}
            onClick={() => load(s.key)}
          >
            {s.label}
          </button>
        ))}
        <button className="gp-action gp-action-secondary" onClick={() => load(scenarioKey)}>Reset</button>
      </span>
    </div>
  ), [scenario.blurb, scenarioKey, load])

  return (
    <GameplayScreenView
      state={state}
      events={events}
      actions={actions}
      transition={transition}
      onDismissTransition={() => setTransitionDismissed(halfKey)}
      onExit={() => load(scenarioKey)}
      banner={banner}
      /* No opponent here: the reviewer acts for whichever side the engine is
         asking, so every legal decision is actually reachable. */
      viewerSide={actions.decision?.actingSide ?? 'home'}
    />
  )
}
