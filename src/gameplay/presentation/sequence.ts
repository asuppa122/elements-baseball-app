// Minimal, dependency-free step orchestrator for gameplay presentation
// (GAMEPLAY_PRESENTATION_PLAN.md, Phase 0). Deliberately small: Phase 0 only
// needs to prove this pattern exists and works, not implement the actual
// pitch/swing/result reveal sequence -- that's Phase 1. No animation
// library added; the *visual* motion lives in gameplay-motion.css as plain
// CSS classes, this only controls *order and timing* of when each step's
// state change is applied.
//
// Every step is a plain state mutation (`apply`), never a rule decision --
// this module has no access to and no opinion about game logic. It only
// sequences the presentation of state the engine already produced.

export type SequenceStep = {
  apply: () => void
  waitMs: number
}

/**
 * Runs each step's `apply()` in order, waiting `waitMs` after each one
 * before moving to the next. Returns a promise that resolves once every
 * step has run. Callers can bail out early by tracking their own
 * cancellation (e.g. on unmount) and checking it between awaited steps --
 * this module intentionally has no built-in cancellation to stay minimal.
 */
export async function runSequence(steps: SequenceStep[]): Promise<void> {
  for (const step of steps) {
    step.apply()
    if (step.waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, step.waitMs))
    }
  }
}
