// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useGameplayActions, type SaveGameState } from '../useGameplayActions'
import { canResumeLegacyPause } from '../legacyPause'
import type { PersistedGameplayLabGame } from '../../gameRepository'
import type { GameState } from '../../types'
import midgame from '../../sandbox/states/midgame.json'

/**
 * Pause was removed; a game paused before then resumes when someone allowed
 * to save it opens it. These pin who that is (the same managers the server's
 * save accepts -- twoPlayerSql.test.ts proves the server side), that it
 * happens once, that switching games resumes the right one, and that a game
 * which was never paused is left alone.
 */

const HOME = 'home-user'
const AWAY = 'away-user'
const OUTSIDER = 'someone-else'

function base(twoPlayer: boolean, id = 'game-1'): GameState {
  const s = structuredClone(midgame) as unknown as GameState
  s.gameId = id
  s.managers = { home: { userId: HOME, managerName: 'Anthony' }, away: { userId: AWAY, managerName: 'Will' } }
  s.turnHandshake = twoPlayer ? true : undefined
  return s
}

/** As the removed pauseGame() wrote it. */
function paused(s: GameState): GameState {
  return { ...s, status: 'paused', stateVersion: s.stateVersion + 1, paused: { pausedAt: '2026-10-30T00:00:00.000Z', pausedByUserId: HOME, resumeStatus: s.status as Exclude<GameState['status'], 'paused'> } }
}

const persisted = (s: GameState): PersistedGameplayLabGame =>
  ({ id: s.gameId, state_version: s.stateVersion, game_state: s }) as unknown as PersistedGameplayLabGame

function harness(initial: GameState, userId: string | undefined, save?: SaveGameState) {
  const saveState = vi.fn<SaveGameState>(save ?? (async ({ gameId, nextState }) => persisted({ ...nextState, gameId })))
  const onStale = vi.fn(async () => {})
  const view = renderHook(({ game, user }) => useGameplayActions({
    game, userId: user, surface: 'screen', onSaved: () => {}, onStale, saveState,
  }), { initialProps: { game: persisted(initial) as PersistedGameplayLabGame | null, user: userId } })
  return { ...view, saveState, onStale }
}

describe('who may resume a legacy-paused game', () => {
  it('either manager of a two-player game, nobody else', () => {
    const s = paused(base(true))
    expect(canResumeLegacyPause(s, HOME)).toBe(true)
    expect(canResumeLegacyPause(s, AWAY)).toBe(true)
    expect(canResumeLegacyPause(s, OUTSIDER)).toBe(false)
    expect(canResumeLegacyPause(s, undefined)).toBe(false)
  })

  it('only the home tester of a one-screen game -- its away manager is a name', () => {
    const s = paused(base(false))
    expect(canResumeLegacyPause(s, HOME)).toBe(true)
    expect(canResumeLegacyPause(s, AWAY)).toBe(false)
    expect(canResumeLegacyPause(s, OUTSIDER)).toBe(false)
  })

  it('never for a game that is not paused', () => {
    for (const status of ['pregame', 'ready', 'in_progress', 'awaiting_decision', 'complete'] as const) {
      expect(canResumeLegacyPause({ ...base(true), status }, HOME)).toBe(false)
    }
  })
})

describe('opening a legacy-paused game', () => {
  it('resumes it once, at the status it was paused from, through a normal versioned save', async () => {
    const before = base(true)
    const s = paused(before)
    const { saveState, rerender } = harness(s, AWAY)
    await waitFor(() => expect(saveState).toHaveBeenCalledTimes(1))
    const call = saveState.mock.calls[0][0]
    expect(call.eventType).toBe('GAME_RESUMED')
    expect(call.expectedStateVersion).toBe(s.stateVersion)
    expect(call.nextState.stateVersion).toBe(s.stateVersion + 1)
    expect(call.nextState.status).toBe(before.status)
    expect(call.nextState.paused).toEqual({ pausedAt: null, pausedByUserId: null, resumeStatus: null })
    // nothing about the game itself changes
    expect(call.nextState.bases).toEqual(s.bases)
    expect(call.nextState.score).toEqual(s.score)
    expect(call.nextState.plateAppearance).toEqual(s.plateAppearance)
    expect(call.eventPayload).toMatchObject({ legacyPause: true, automatic: true, from: 'paused' })
    // re-rendering the same saved version does not try again
    rerender({ game: persisted(s), user: AWAY })
    await new Promise((r) => setTimeout(r, 20))
    expect(saveState).toHaveBeenCalledTimes(1)
  })

  it('leaves a normal active game alone', async () => {
    const { saveState } = harness(base(true), HOME)
    await new Promise((r) => setTimeout(r, 20))
    expect(saveState).not.toHaveBeenCalled()
  })

  it('does not write when the viewer may not save the game', async () => {
    for (const [state, user] of [[paused(base(false)), AWAY], [paused(base(true)), OUTSIDER], [paused(base(true)), undefined]] as const) {
      const { saveState, unmount } = harness(state, user)
      await new Promise((r) => setTimeout(r, 20))
      expect(saveState).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('resumes the right game when the screen switches games, and only paused ones', async () => {
    const first = paused(base(true, 'game-1'))
    const { saveState, rerender } = harness(first, HOME)
    await waitFor(() => expect(saveState).toHaveBeenCalledTimes(1))
    rerender({ game: persisted(base(true, 'game-2')), user: HOME })
    await new Promise((r) => setTimeout(r, 20))
    expect(saveState).toHaveBeenCalledTimes(1)
    rerender({ game: persisted(paused(base(true, 'game-3'))), user: HOME })
    await waitFor(() => expect(saveState).toHaveBeenCalledTimes(2))
    expect(saveState.mock.calls[1][0].gameId).toBe('game-3')
    rerender({ game: null, user: HOME })
    await new Promise((r) => setTimeout(r, 20))
    expect(saveState).toHaveBeenCalledTimes(2)
  })

  it('treats the other manager resuming first as normal: reloads, shows no error', async () => {
    const stale: SaveGameState = async () => { throw new Error('Stale game state. Expected version 5, current version is 6.') }
    const { result, onStale, saveState } = harness(paused(base(true)), AWAY, stale)
    await waitFor(() => expect(onStale).toHaveBeenCalledTimes(1))
    expect(saveState).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBe('')
  })

  it('shows an error rather than guessing when a paused game has no resume point', async () => {
    const s = paused(base(true))
    s.paused.resumeStatus = null
    const { result, saveState } = harness(s, HOME)
    await waitFor(() => expect(result.current.error).toMatch(/missing its resume state/))
    expect(saveState).not.toHaveBeenCalled()
  })

  it('no longer offers a pause action', () => {
    const { result } = harness(base(true), HOME)
    expect('togglePause' in result.current).toBe(false)
  })
})
