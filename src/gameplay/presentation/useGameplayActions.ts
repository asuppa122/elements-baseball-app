import { useCallback, useState } from 'react'
import {
  pauseGame, resolveAutomaticPitcherAdvantage, resolvePitchRoll, resolveSwingRoll, resumeGame,
} from '../engine'
import { resolveSwingChart } from '../coreGame'
import {
  beginPrePitchDecision, confirmManagerDecision, getDecisionView, noWheelSacBuntOutcome, resolveDecisionRoll,
} from '../decisionEngine'
import { buildEventEnvelope } from '../eventPayload'
import { saveGameplayLabState, type PersistedGameplayLabGame } from '../gameRepository'
import type { GameSide, GameState } from '../types'

/**
 * Every way a manager can change a game, in one place.
 *
 * Both gameplay surfaces call this. That is the whole point: the last time two
 * screens each owned their own persist path they drifted, and four completed
 * games ended up unable to produce a single scoring play because one of them
 * wrote a thinner payload than the other. A shared hook means they cannot
 * diverge again, and it makes the eventual cutover a deletion rather than a
 * migration.
 *
 * Extracted verbatim from the playable shell -- same resolvers, same d20, same
 * event types, same payload keys, same messages. The only addition is a
 * `surface` marker so an event can say which screen wrote it, which is what
 * makes a parity playthrough on the new screen provable rather than assumed.
 */

export type GameplaySurface = 'shell' | 'screen'

/** Decisions the manager may still back out of before the final commit. */
const EDITABLE_PRE_PITCH = [
  'PINCH_HITTER_SELECTION', 'PINCH_RUNNER_TARGET', 'PINCH_RUNNER_REPLACEMENT',
  'DEF_SUB_POSITION', 'DEF_SUB_REPLACEMENT', 'DOUBLE_SWITCH_PITCHER',
  'DOUBLE_SWITCH_FIELDER', 'DOUBLE_SWITCH_OUTGOING_FIELDER', 'ENTRY_ATTRIBUTE_MODE',
]

function d20(): number {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return (values[0] % 20) + 1
}

/**
 * How a state change is written. Defaults to Supabase; the sandbox passes a
 * local implementation so an outside reviewer can play a real game with no
 * account and no database. Injecting it here rather than forking the hook is
 * deliberate -- the drift this file exists to prevent would come straight back
 * if a second surface owned its own copy of the action layer.
 */
export type SaveGameState = typeof saveGameplayLabState

export function useGameplayActions({ game, userId, surface, onSaved, onAfterSave, saveState }: {
  game: PersistedGameplayLabGame | null
  userId: string | undefined
  surface: GameplaySurface
  onSaved: (saved: PersistedGameplayLabGame) => void
  onAfterSave?: (gameId: string) => void | Promise<void>
  saveState?: SaveGameState
}) {
  const save = saveState ?? saveGameplayLabState
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selection, setSelection] = useState<string[]>([])

  const state = game?.game_state as GameState | undefined
  const decision = state ? getDecisionView(state) : null
  const offense: GameSide = state?.half === 'bottom' ? 'home' : 'away'
  const defense: GameSide = offense === 'home' ? 'away' : 'home'
  const editablePrePitchDecision = Boolean(
    state?.pendingDecision && EDITABLE_PRE_PITCH.includes(state.pendingDecision.decisionType),
  )
  const finalSubstitutionCommit = state?.pendingDecision?.decisionType === 'ENTRY_ATTRIBUTE_MODE'

  const persist = useCallback(async (
    next: GameState,
    eventType: Parameters<typeof saveGameplayLabState>[0]['eventType'],
    payload: Record<string, unknown>,
    message: string,
  ) => {
    if (!game || !state) return
    setSaving(true); setError(''); setNotice('')
    try {
      // The before/after envelope is attached once, here, so it covers
      // decisions as well as swings -- that is what makes a run scored on a
      // manager decision attributable at all. Caller keys win on collision.
      const eventPayload = { ...buildEventEnvelope(state, next), surface, ...payload }
      const saved = await save({
        gameId: game.id, expectedStateVersion: game.state_version, nextState: next, eventType, eventPayload,
      })
      onSaved(saved)
      await onAfterSave?.(game.id)
      setNotice(message)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save game state.')
    } finally {
      setSaving(false)
    }
  }, [game, state, surface, onSaved, onAfterSave, save])

  const bump = (next: GameState): GameState => {
    next.stateVersion = (state?.stateVersion ?? next.stateVersion) + 1
    next.updatedAt = new Date().toISOString()
    return next
  }

  const noPitch = useCallback(async () => {
    if (!state) return
    await persist(resolveAutomaticPitcherAdvantage(state), 'DECISION_RESOLVED',
      { resolutionKind: 'AUTOMATIC_PITCHER_ADVANTAGE', automatic: true, playableShell: true },
      'NO PITCH — PITCHER ADVANTAGE.')
  }, [state, persist])

  const rollPitch = useCallback(async () => {
    if (!state) return
    const roll = d20(); const next = resolvePitchRoll(state, roll)
    await persist(next, 'PITCH_ROLLED', { roll, playableShell: true },
      `Pitch roll: ${roll}. ${next.plateAppearance.advantage?.toUpperCase()} advantage.`)
  }, [state, persist])

  const rollSwing = useCallback(async () => {
    if (!state) return
    const roll = d20(); const result = resolveSwingChart(state, roll)
    await persist(resolveSwingRoll(state, roll), 'SWING_RESOLVED',
      { roll, chartResult: result, playableShell: true }, `Swing roll: ${roll} → ${result}.`)
  }, [state, persist])

  const startAction = useCallback(async (actionId: string) => {
    if (!state) return
    await persist(bump(beginPrePitchDecision(state, actionId)), 'DECISION_RESOLVED',
      { resolutionKind: 'PRE_PITCH_ACTION_STARTED', action: actionId, playableShell: true },
      `${actionId.replaceAll('_', ' ')} started.`)
  }, [state, persist])

  const changeAction = useCallback(async () => {
    if (!state || !editablePrePitchDecision) return
    const next: GameState = {
      ...state, status: 'in_progress', waitingFor: 'PITCH_ROLL', pendingDecision: null,
      nextActor: defense, stateVersion: state.stateVersion + 1, updatedAt: new Date().toISOString(),
    }
    await persist(next, 'DECISION_RESOLVED',
      { resolutionKind: 'PRE_PITCH_ACTION_CANCELLED', playableShell: true },
      'Action cleared. Choose a different manager action.')
    setSelection([])
  }, [state, editablePrePitchDecision, defense, persist])

  const confirmDecision = useCallback(async () => {
    if (!state || !decision) return
    const message = finalSubstitutionCommit ? 'Decision locked.'
      : editablePrePitchDecision ? 'Selection saved. You can still change the action before final confirmation.'
      : 'Decision locked.'
    await persist(bump(confirmManagerDecision(state, selection)), 'DECISION_RESOLVED',
      { decisionType: state.pendingDecision?.decisionType, selected: selection, playableShell: true }, message)
    setSelection([])
  }, [state, decision, selection, editablePrePitchDecision, finalSubstitutionCommit, persist])

  const rollDecision = useCallback(async () => {
    if (!state || !decision) return
    const roll = d20()
    const next = bump(resolveDecisionRoll(state, roll))
    const bunt = state.pendingDecision?.decisionType === 'SAC_BUNT_RTS' ? noWheelSacBuntOutcome(roll) : null
    const message = bunt === 'FAILED_PITCHER_CHART' ? `Bunt roll: ${roll} — FAILED BUNT. Attempt swing on PITCHER chart.`
      : bunt === 'STRIKEOUT' ? `Bunt roll: ${roll} — K.`
      : bunt === 'LEAD_RUNNER_OUT' ? `Bunt roll: ${roll} — lead runner OUT.`
      : bunt === 'SUCCESS' ? `Bunt roll: ${roll} — bunt successful; runners advance.`
      : state.pendingDecision?.decisionType === 'GB_RUNNER_2B_RTH'
        ? `RTH roll: ${roll} — ${roll <= 10 ? 'runner advances to 3B' : 'runner stays at 2B'}.`
        : `Decision roll: ${roll}.`
    await persist(next, 'DECISION_RESOLVED',
      { decisionType: state.pendingDecision?.decisionType, resolutionKind: 'ROLL', roll, playableShell: true }, message)
  }, [state, decision, persist])

  const togglePause = useCallback(async () => {
    if (!game || !state || !userId) return
    const paused = state.status === 'paused'
    await persist(
      paused ? resumeGame(state) : pauseGame(state, userId),
      paused ? 'GAME_RESUMED' : 'GAME_PAUSED',
      { from: state.status, to: paused ? 'resumed' : 'paused', playableShell: true },
      paused ? 'Resumed at the exact saved state.' : 'Paused. You can close this and come back to it.',
    )
  }, [game, state, userId, persist])

  const toggleSelection = useCallback((id: string, single: boolean) => {
    setSelection((current) => (single ? [id] : current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }, [])

  return {
    saving, error, notice, setError, setNotice,
    selection, setSelection, toggleSelection,
    decision, editablePrePitchDecision, finalSubstitutionCommit,
    noPitch, rollPitch, rollSwing, startAction, changeAction, confirmDecision, rollDecision, togglePause,
  }
}
