/**
 * Game-level controls. Exit leaves the screen and never ends or forfeits the
 * game -- every move is already saved, so it is exactly where it was when
 * either manager opens it again. Cancel ends it for good, without a result,
 * and is only offered before the first pitch; it is set apart so the two are
 * never mistaken for each other. Deliberately small: chrome, not gameplay.
 */

export default function GameMenu({ onExit, onCancel }: { onExit: () => void; onCancel?: () => void }) {
  return (
    <section className="gp-menu" aria-label="Game menu">
      <b className="s-lbl">Game</b>
      <div className="gp-menu-controls">
        {onCancel && (
          <button className="gp-menu-btn is-danger" onClick={onCancel} title="End this game before the first pitch. No result is recorded.">
            Cancel game
          </button>
        )}
        <button className="gp-menu-btn" onClick={onExit} title="Leave the game screen. The game stays saved and active.">Exit</button>
      </div>
    </section>
  )
}
