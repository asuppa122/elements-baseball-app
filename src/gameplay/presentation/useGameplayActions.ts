import { decisionRollView, describePlay, pitchRollView, swingRollView } from './playRecord'
import { useCallback, useState } from 'react'
import {
  declareOffenseReady, resolveAutomaticPitcherAdvantage, resolvePitchRoll, resolveSwingRoll, resumeGame,
} from '../engine'
import { resolveSwingChart } from '../coreGame'
import {
  beginPrePitchDecision, confirmManagerDecision, getDecisionView, resolveDecisionRoll,
} from '../decisionEngine'
import { buildEventEnvelope } from '../eventPayload'
import { rollGameplayDie, saveGameplayLabState, type PersistedGameplayLabGame, type RollKind } from '../gameRepository'
import type { GameSide, GameState } from '../types'
import { useLegacyPauseResume } from './legacyPause'

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
  'POSITION_SWAP_PITCHER', 'POSITION_SWAP_DESTINATION',
]

/** Supabase errors are plain objects, not Error instances; keep the server's reason. */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return 'Could not save game state.'
}

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

/**
 * Where a die comes from. A two-player game asks the server, which records the
 * roll so it cannot be re-rolled and the save is refused unless it is used; a
 * one-screen game (the lab, the sandbox) rolls locally as it always has.
 */
export type RollDie = (state: GameState, gameId: string, kind: RollKind) => Promise<number>

const defaultRollDie: RollDie = async (state, gameId, kind) =>
  state.turnHandshake === true ? rollGameplayDie(gameId, state.stateVersion, kind) : d20()

export function useGameplayActions({ game, userId, surface, onSaved, onAfterSave, onStale, saveState, rollDie }: {
  game: PersistedGameplayLabGame | null
  userId: string | undefined
  surface: GameplaySurface
  onSaved: (saved: PersistedGameplayLabGame) => void
  onAfterSave?: (gameId: string) => void | Promise<void>
  /** The other manager moved first; the caller should reload the game. */
  onStale?: () => void | Promise<void>
  saveState?: SaveGameState
  rollDie?: RollDie
}) {
  const save = saveState ?? saveGameplayLabState
  const roll = rollDie ?? defaultRollDie
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [chosen, setSelection] = useState<string[]>([])
  // A roster move started from a drawer row already knows its player. The
  // engine asks for that player at different steps -- first for a pitching
  // change or pinch hitter, after the runner or position for a pinch runner or
  // defensive sub -- so the preference waits for whichever step offers it and
  // pre-selects it there. It is only ever a pre-selection: the manager still
  // confirms on the decision board, and picking something else overrides it.
  const [preferred, setPreferred] = useState<string | null>(null)

  const state = game?.game_state as GameState | undefined
  const decision = state ? getDecisionView(state) : null
  const preferredOffered = Boolean(preferred && decision?.options.some((o) => o.id === preferred))
  const selection = chosen.length === 0 && preferredOffered && preferred ? [preferred] : chosen
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
      // The play-by-play and the roll are written down now, from the full
      // before and after states, so the other manager reads the same thing
      // (playRecord.ts). Steps that are not plays -- readying up, starting or
      // cancelling a call -- carry no play.
      const play = describePlay(state, next, typeof payload.chartResult === 'string' ? payload.chartResult : null)
      const eventPayload = { ...buildEventEnvelope(state, next), surface, ...(play.lines.length ? { play } : {}), ...payload }
      const saved = await save({
        gameId: game.id, expectedStateVersion: game.state_version, nextState: next, eventType, eventPayload,
      })
      onSaved(saved)
      await onAfterSave?.(game.id)
      setNotice(message)
    } catch (e) {
      const message = errorMessage(e)
      // Someone else's move landed first. That is normal in a two-player game,
      // not a failure: reload and let the manager act on what actually happened.
      if (/stale game state/i.test(message) && onStale) {
        setNotice('The other manager moved first — showing the latest.')
        await onStale()
      } else {
        setError(message)
      }
    } finally {
      setSaving(false)
    }
  }, [game, state, surface, onSaved, onAfterSave, onStale, save])

  /** Wraps a move that needs a die: a failed server roll is shown, not thrown. */
  const withRoll = useCallback(async (kind: RollKind, fn: (value: number) => Promise<void>) => {
    if (!game || !state) return
    let value: number
    try {
      setSaving(true); setError('')
      value = await roll(state, game.id, kind)
    } catch (e) {
      const message = errorMessage(e)
      setSaving(false)
      if (/stale game state/i.test(message) && onStale) { await onStale(); return }
      setError(message)
      return
    }
    setSaving(false)
    await fn(value)
  }, [game, state, roll, onStale])

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

  const declareReady = useCallback(async () => {
    if (!state) return
    await persist(declareOffenseReady(state), 'OFFENSE_READY', { playableShell: true }, 'Ready. Over to the pitcher.')
  }, [state, persist])

  const rollPitch = useCallback(async () => {
    if (!state) return
    await withRoll('pitch', async (roll) => {
      const next = resolvePitchRoll(state, roll)
      await persist(next, 'PITCH_ROLLED', { roll, rollView: pitchRollView(state, roll, next), playableShell: true },
        '')
    })
  }, [state, persist, withRoll])

  const rollSwing = useCallback(async () => {
    if (!state) return
    await withRoll('swing', async (roll) => {
      const result = resolveSwingChart(state, roll)
      await persist(resolveSwingRoll(state, roll), 'SWING_RESOLVED',
        { roll, chartResult: result, rollView: swingRollView(state, roll, result), playableShell: true }, '')
    })
  }, [state, persist, withRoll])

  const startAction = useCallback(async (actionId: string, preferOptionId?: string) => {
    if (!state) return
    setPreferred(preferOptionId ?? null)
    setSelection([])
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
    setPreferred(null)
  }, [state, editablePrePitchDecision, defense, persist])

  const confirmDecision = useCallback(async () => {
    if (!state || !decision) return
    const message = finalSubstitutionCommit ? 'Decision locked.'
      : editablePrePitchDecision ? 'Selection saved. You can still change the action before final confirmation.'
      : 'Decision locked.'
    await persist(bump(confirmManagerDecision(state, selection)), 'DECISION_RESOLVED',
      { decisionType: state.pendingDecision?.decisionType, selected: selection, playableShell: true }, message)
    setSelection([])
    // spent once the step that offered it has been confirmed
    if (preferredOffered) setPreferred(null)
  }, [state, decision, selection, preferredOffered, editablePrePitchDecision, finalSubstitutionCommit, persist])

  const rollDecision = useCallback(async () => {
    if (!state || !decision) return
    await withRoll('decision', async (roll) => {
      const next = bump(resolveDecisionRoll(state, roll))
      // The result is shown to both managers by RollResult, from the saved event.
      const rollView = decisionRollView(state, roll, describePlay(state, next))
      await persist(next, 'DECISION_RESOLVED',
        { decisionType: state.pendingDecision?.decisionType, resolutionKind: 'ROLL', roll, rollView, playableShell: true }, '')
    })
  }, [state, decision, persist, withRoll])

  // A game paused before Pause was removed resumes when it is opened, through
  // the same versioned save as every other move (legacyPause.ts).
  const resumeLegacyPause = useCallback(async (paused: GameState) => {
    let next: GameState
    try { next = resumeGame(paused) } catch (e) { setError(errorMessage(e)); return }
    await persist(next, 'GAME_RESUMED',
      { from: 'paused', to: next.status, legacyPause: true, automatic: true, playableShell: true },
      'This game was paused; it has been resumed exactly where it left off.')
  }, [persist])
  useLegacyPauseResume(game, userId, resumeLegacyPause)

  const toggleSelection = useCallback((id: string, single: boolean) => {
    setSelection((current) => (single ? [id] : current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }, [])

  return {
    saving, error, notice, setError, setNotice,
    selection, setSelection, toggleSelection,
    decision, editablePrePitchDecision, finalSubstitutionCommit,
    noPitch, declareReady, rollPitch, rollSwing, startAction, changeAction, confirmDecision, rollDecision,
  }
}
