import type { DecisionOption, DecisionView } from '../decisionEngine'
import type { GameSide, GameState } from '../types'

/**
 * The blocking-decision surface (GAMEPLAY_PRESENTATION_PLAN.md, Phase 4 shell).
 *
 * Distinct from the pre-pitch action list, which offers things a manager MAY
 * do. This renders the state where the engine requires a specific resolution
 * before the game can continue, and it is where Elements' rule knowledge is
 * supposed to be visible rather than implied:
 *
 *   - only legal options appear (getDecisionView already computes them)
 *   - an option gated on another is shown DISABLED WITH ITS REASON rather than
 *     hidden, because that is how a manager learns the rule
 *   - the decision names its own rule condition (RC2/RC5)
 *   - confirmation says plainly that it locks
 *
 * It also has to be honest about a real failure mode: getDecisionView falls
 * back to an 'information' view with no options for any decisionType it has no
 * case for. A game persisted before a type was renamed lands there permanently
 * (GB_RUNNER_2B_RFO, renamed to _RTH in 56e0cde, still exists in a saved lab
 * game). Rendering that as a normal prompt with a dead button would be a lie,
 * so it gets its own state.
 */

const RC_LABEL: Record<string, string> = {
  RC2_LOCKED_MANAGER_DECISION: 'RC2',
  RC5_CONDITIONAL_GAME_STATE: 'RC5',
}

/** True when this option is gated on another the manager has not selected. */
export function isBlockedByDependency(option: DecisionOption, selection: string[]): boolean {
  return Boolean(option.requiresOptionId) && !selection.includes(option.requiresOptionId as string)
}

/** The option this one is waiting on, for naming it in the reason line. */
export function dependencyLabel(option: DecisionOption, all: DecisionOption[]): string | null {
  if (!option.requiresOptionId) return null
  return all.find((o) => o.id === option.requiresOptionId)?.label ?? null
}

export default function DecisionBoard({
  state,
  view,
  selection,
  viewerSide,
  saving,
  onToggle,
  onConfirm,
  onRoll,
}: {
  state: GameState
  view: DecisionView
  selection: string[]
  viewerSide: GameSide
  saving: boolean
  onToggle: (id: string) => void
  onConfirm: () => void
  onRoll: () => void
}) {
  const yours = view.actingSide === viewerSide
  const rc = RC_LABEL[state.pendingDecision?.ruleCondition ?? ''] ?? null
  const opponent = state.managers[view.actingSide]?.managerName ?? 'the other manager'

  // getDecisionView's fallback: a decisionType it has no case for.
  const unresolvable = view.mode === 'information' && view.options.length === 0

  return (
    <section className="gp-decision" aria-live="polite">
      <header className="gp-decision-head">
        <div className="gp-decision-title">
          <h2>{view.title}</h2>
          {rc && <span className="gp-decision-rc">{rc}</span>}
        </div>
        <span className={`gp-decision-actor ${yours ? 'is-yours' : 'is-waiting'}`}>
          {yours ? 'YOUR DECISION' : `WAITING ON ${opponent.toUpperCase()}`}
        </span>
      </header>

      <p className="gp-decision-desc">{view.description}</p>

      {unresolvable ? (
        <div className="gp-decision-stuck">
          <strong>No resolver for this decision.</strong>
          <span>
            This game is holding <code>{state.pendingDecision?.decisionType}</code>, which the current
            engine has no case for &mdash; so it cannot be resolved from here. It is not a display
            problem: the saved state predates a rename of this decision type.
          </span>
        </div>
      ) : view.mode === 'roll' ? (
        <button className="gp-decision-primary" disabled={!yours || saving} onClick={onRoll}>
          {view.confirmationLabel || 'Roll d20'}
        </button>
      ) : (
        <>
          <ul className="gp-decision-options">
            {view.options.map((option) => {
              const blocked = isBlockedByDependency(option, selection)
              const selected = selection.includes(option.id)
              const needs = blocked ? dependencyLabel(option, view.options) : null
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    className={`gp-decision-option${selected ? ' is-selected' : ''}${blocked ? ' is-blocked' : ''}`}
                    disabled={!yours || saving || blocked}
                    aria-disabled={blocked}
                    onClick={() => onToggle(option.id)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                    {blocked && (
                      <em className="gp-decision-blocked-why">
                        Unavailable &mdash; {needs ? `select ${needs} first` : 'the runner ahead must also advance'}
                      </em>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          <footer className="gp-decision-foot">
            <span className="gp-decision-lock">Locks once confirmed.</span>
            <button
              className="gp-decision-primary"
              disabled={!yours || saving || selection.length === 0}
              onClick={onConfirm}
            >
              {view.confirmationLabel || 'Confirm'}
              {view.mode === 'multi_runner' && selection.length > 0 ? ` (${selection.length})` : ''}
            </button>
          </footer>
        </>
      )}
    </section>
  )
}
