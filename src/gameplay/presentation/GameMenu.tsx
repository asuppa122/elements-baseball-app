import type { GameState } from '../types'

/**
 * Game-level controls, at the top of the rail: pause/resume and leaving.
 * Deliberately small -- it is chrome, not gameplay.
 */

export default function GameMenu({ state, saving, onTogglePause, onExit }: {
  state: GameState
  saving: boolean
  onTogglePause: () => void
  onExit: () => void
}) {
  const paused = state.status === 'paused'
  return (
    <section className="gp-menu" aria-label="Game menu">
      <b className="s-lbl">Game</b>
      <div className="gp-menu-controls">
        {state.status !== 'complete' && (
          <button className="gp-menu-btn" disabled={saving} onClick={onTogglePause}>
            {paused ? 'Resume' : 'Pause'}
          </button>
        )}
        <button className="gp-menu-btn" onClick={onExit}>Exit</button>
      </div>
    </section>
  )
}
