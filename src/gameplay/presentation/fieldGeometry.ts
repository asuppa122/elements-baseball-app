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
  SS: { left: 34.61, top: 40.02 },
  '2B': { left: 65.39, top: 40.02 },
  '3B': { left: 23.13, top: 50.71 },
  '1B': { left: 76.87, top: 50.71 },
  P: { left: 50.00, top: 50.88 },
  C: { left: 50.00, top: 86.49 },
}

/**
 * Runner pills. Third and second are the artboard's own values; first is the
 * mirror of third about the centre line (100 - 23.29), which is where the
 * artboard would have put it -- it only ever drew runners on second and third.
 */
export const RUNNER_POINTS: Record<'first' | 'second' | 'third', FieldPoint> = {
  third: { left: 23.29, top: 62.76 },
  second: { left: 49.84, top: 38.60 },
  first: { left: 76.71, top: 62.76 },
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
