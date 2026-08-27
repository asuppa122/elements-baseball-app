import {
  distanceControlPenalty,
  effectiveHitterOnBase,
  effectivePitcherControl,
  performanceControlPenalty,
  shutoutBonusApplies,
} from '../fatigueEngine'
import { currentHitterFatigueContext, currentPitcherFatigueContext } from '../engine'
import type { GameState } from '../types'

/**
 * In-game fatigue display (Phase 1, GAMEPLAY_PRESENTATION_PLAN.md).
 *
 * The playable shell already renders fatigue-adjusted ratings -- and *only*
 * those, never the printed value -- so a rating the engine has already lowered
 * is currently indistinguishable from a card that was printed that way. This
 * module supplies what's missing to show the delta, deliberately as data only:
 * it decides nothing about presentation and touches no resolution logic.
 *
 * Companion to pregameFatigueDisplay.ts, and it keeps that module's contract:
 * return null when there is genuinely nothing to say, so a rested player on
 * card attributes renders exactly as it does today.
 */

/**
 * SHUTOUT_BONUS is not a penalty like the other three. A pitcher past card IP
 * with the shutout intact pays -1 per out instead of -2 and cannot be pushed
 * below 0 by it -- he has earned the right to stay in, and callers must not
 * present it as overwork. It is mutually exclusive with DISTANCE: they are
 * different branches of the same distance calculation, never both.
 */
export type FatigueCause = 'REST' | 'PERFORMANCE' | 'DISTANCE' | 'SHUTOUT_BONUS'

export type RatingAdjustment =
  /**
   * Entered on default attributes -- a flat OB 5 / Control -5 floor, which is
   * NOT fatigue. Rendering this with the fatigue treatment would claim a
   * printed-12 pinch hitter is exhausted when he simply entered without his
   * card's attributes, so callers must label this case separately.
   */
  | { kind: 'DEFAULT_ATTRIBUTES'; printed: number | null; effective: number }
  /**
   * A real fatigue adjustment. `causes` is *attribution* -- which penalties are
   * currently active -- and deliberately carries no per-cause amounts, because
   * effectivePitcherControl clamps its total at -5: below the floor the
   * individual penalties no longer sum to the visible delta, so any rendered
   * arithmetic would be wrong. For the same reason `printed` can equal
   * `effective` while causes are non-empty (the penalties are real but fully
   * absorbed by the clamp); callers should show the causes without an arrow.
   */
  | { kind: 'FATIGUE'; printed: number; effective: number; causes: FatigueCause[] }

export function currentHitterOnBaseAdjustment(state: GameState): RatingAdjustment | null {
  const context = currentHitterFatigueContext(state)
  if (!context) return null

  const effective = effectiveHitterOnBase(
    context.printedOnBase,
    context.gamesFromRested,
    context.useDefaultAttributes,
  )

  if (context.useDefaultAttributes) {
    return { kind: 'DEFAULT_ATTRIBUTES', printed: context.printedOnBase, effective }
  }
  // Non-default guarantees a printed value: useDefaultAttributes is already
  // true whenever onBase is null (see currentHitterFatigueContext).
  const printed = context.printedOnBase as number

  // Rest debt is the only thing effectiveHitterOnBase applies -- there is no
  // hitter equivalent of the pitcher's performance/distance penalties.
  const causes: FatigueCause[] = context.gamesFromRested > 0 ? ['REST'] : []
  if (causes.length === 0 && effective === printed) return null

  return { kind: 'FATIGUE', printed, effective, causes }
}

export function currentPitcherControlAdjustment(state: GameState): RatingAdjustment | null {
  const context = currentPitcherFatigueContext(state)
  if (!context) return null

  const { input } = context
  const effective = effectivePitcherControl(input)

  if (input.useDefaultAttributes || input.printedControl === null) {
    return { kind: 'DEFAULT_ATTRIBUTES', printed: input.printedControl, effective }
  }
  const printed = input.printedControl

  // The same three components effectivePitcherControl itself subtracts
  // (fatigueEngine.ts), read from the same input the live roll used -- not
  // re-derived by differencing, which would be fragile across the clamp and
  // the Shutout-Bonus branches.
  const causes: FatigueCause[] = []
  if (Math.max(0, input.gamesFromRested ?? 0) > 0) causes.push('REST')
  if (performanceControlPenalty(input.earnedRunsAllowed) > 0) causes.push('PERFORMANCE')
  // One distance figure, two very different reasons for it. Only report it as a
  // cause when it actually cost something -- past card IP with the shutout
  // intact but already at/below 0, the bonus is capped to nothing.
  const distance = distanceControlPenalty(input)
  if (distance > 0) causes.push(shutoutBonusApplies(input) ? 'SHUTOUT_BONUS' : 'DISTANCE')

  if (causes.length === 0 && effective === printed) return null

  return { kind: 'FATIGUE', printed, effective, causes }
}
