import type { DefensivePosition } from '../types'

/**
 * Where each fielder stands on the field graphic.
 *
 * These are the exact percentages from the artboards (.design-mockup/
 * Main.dc.html), which were positioned by eye against the same 680x680
 * render now served as /gameplay-field.webp. Keeping them as data rather
 * than as inline styles means the field can be re-laid-out, tested and
 * reasoned about without editing markup -- and it is the only place a
 * position needs changing if the render is ever replaced.
 *
 * Percentages are of the field box, which is square; each chip is centred on
 * its point with translate(-50%, -50%).
 */

export type FieldPoint = { left: number; top: number }

export const FIELDER_POINTS: Record<Exclude<DefensivePosition, 'DH'>, FieldPoint> = {
  LF: { left: 18.90, top: 19.21 },
  CF: { left: 49.60, top: 15.50 },
  RF: { left: 81.10, top: 19.21 },
  // Middle infielders up toward centre field and apart, corners a touch wider
  // and lower: the artboard values left SS and 2B 12px from the corner cards
  // and crowding the pitcher once the field was drawn square (layout review,
  // approved 2026-10-30). Was SS 34.61/40.02, 2B 65.39/40.02, 3B 23.13/50.71,
  // 1B 76.87/50.71.
  SS: { left: 33.0, top: 35.5 },
  '2B': { left: 67.0, top: 35.5 },
  '3B': { left: 21.5, top: 52.0 },
  '1B': { left: 78.5, top: 52.0 },
  // 0.9% lower (toward the mound) than the artboard's 50.88, with the 2B
  // runner 0.8% higher: on a square field the bag's label otherwise touched
  // the pitcher card at ~560px.
  P: { left: 50.00, top: 51.8 },
  C: { left: 50.00, top: 86.49 },
}

/**
 * Runner pills. Third and second are the artboard's own values; first is the
 * mirror of third about the centre line (100 - 23.29), which is where the
 * artboard would have put it -- it only ever drew runners on second and third.
 */
export const RUNNER_POINTS: Record<'first' | 'second' | 'third', FieldPoint> = {
  // Corner runners moved off the 3B/1B name labels (they sat 10px under
  // them); second stays on the bag, nudged up from 38.60 to clear the
  // pitcher. Was third 23.29/62.76, first 76.71/62.76.
  third: { left: 20.5, top: 66.5 },
  second: { left: 49.84, top: 37.8 },
  first: { left: 79.5, top: 66.5 },
}

/**
 * The two batter's boxes, mirrored about the centre line.
 *
 * This render looks out from behind home plate, so third base is on the
 * viewer's left and first base on the right. A right-handed batter stands on
 * the third-base side; a left-handed batter on the first-base side. The
 * artboard's own batter marker sat at 64% -- the left-handed box -- which is
 * where these come from.
 */
export const BATTER_BOX: Record<'L' | 'R', FieldPoint> = {
  R: { left: 36.0, top: 89.0 },
  L: { left: 64.0, top: 89.0 },
}

/** The order fielders are painted, so the pitcher and catcher sit above the rest. */
export const FIELDER_PAINT_ORDER: Array<Exclude<DefensivePosition, 'DH'>> =
  ['LF', 'CF', 'RF', 'SS', '2B', '3B', '1B', 'C', 'P']

/** DEF ratings read as signed numbers everywhere in Elements. */
export function formatDef(value: number | null): string {
  if (value === null) return '—'
  return value >= 0 ? `+${value}` : `${value}`
}
