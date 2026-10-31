import { useEffect, useRef } from 'react'
import type { GameState } from '../types'

/**
 * Pause is gone (2026-10-31): it changed nothing but the status, and while a
 * game sat `paused` nobody could roll. Leaving a game was always safe without
 * it -- every move is saved, and Exit only navigates.
 *
 * A game paused before the button was removed would be stranded, though, so
 * it is resumed the first time someone allowed to save it opens it. "Allowed"
 * is exactly what save_gameplay_lab_state accepts, so the client never
 * attempts a write the server would refuse: either manager of a two-player
 * game, or the home tester of a one-screen game (its away manager is only a
 * name and cannot save it).
 *
 * The `paused` status stays in the schema and old GAME_PAUSED events stay in
 * the log; nothing here rewrites history.
 */
export function canResumeLegacyPause(state: GameState, userId: string | undefined): boolean {
  if (state.status !== 'paused' || !userId) return false
  const { home, away } = state.managers
  return state.turnHandshake === true ? userId === home.userId || userId === away.userId : userId === home.userId
}

/**
 * Resumes a legacy-paused game once per saved version. A failed attempt is
 * not retried for that version (the caller shows the error); a newer version
 * -- the other manager resumed it first, or a reload -- is looked at afresh.
 */
export function useLegacyPauseResume(
  game: { id: string; state_version: number; game_state: unknown } | null,
  userId: string | undefined,
  resume: (state: GameState) => Promise<void>,
) {
  const tried = useRef<string | null>(null)
  const state = game?.game_state as GameState | undefined
  useEffect(() => {
    if (!game || !state || !canResumeLegacyPause(state, userId)) return
    const key = `${game.id}@${game.state_version}`
    if (tried.current === key) return
    tried.current = key
    void resume(state)
  }, [game, state, userId, resume])
}
