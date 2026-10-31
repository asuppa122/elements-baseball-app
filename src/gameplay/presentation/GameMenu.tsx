/**
 * Game-level controls: leaving the game. Leaving never ends or forfeits it --
 * every move is already saved, so the game is exactly where it was when either
 * manager opens it again. Deliberately small: it is chrome, not gameplay.
 */

export default function GameMenu({ onExit }: { onExit: () => void }) {
  return (
    <section className="gp-menu" aria-label="Game menu">
      <b className="s-lbl">Game</b>
      <div className="gp-menu-controls">
        <button className="gp-menu-btn" onClick={onExit}>Exit</button>
      </div>
    </section>
  )
}
