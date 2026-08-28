import type { ScoringEventInput } from './../halfInningTransition'

/**
 * Turning a persisted event into a sentence.
 *
 * The rule this module holds to: narrate ONLY from what the engine recorded.
 * Every clause below is a fact read out of the payload -- who batted, what the
 * chart said, whether outs went up, whether the score moved, which bases were
 * occupied before and after. Nothing is inferred about how a play looked.
 *
 * When the payload cannot support a sentence -- the thin `{roll, chartResult,
 * playableShell}` shape every pre-2026-08-28 shell event has -- this returns
 * null and the caller falls back to showing the raw event. A missing narration
 * is honest; an invented one is not.
 */

export type Narration = {
  text: string
  /** Runs scored on this play, for emphasis. */
  runs: number
  kind: 'scoring' | 'out' | 'onbase' | 'neutral'
}

type Score = { away: number; home: number }

function asScore(value: unknown): Score | null {
  if (!value || typeof value !== 'object') return null
  const r = value as Record<string, unknown>
  return typeof r.away === 'number' && typeof r.home === 'number' ? { away: r.away, home: r.home } : null
}

function occupied(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  return ['first', 'second', 'third'].filter((b) => (value as Record<string, unknown>)[b]).length
}

/** What the chart result is called in plain language. */
const CHART_PHRASE: Record<string, string> = {
  PU: 'pops up',
  K: 'strikes out',
  GB: 'grounds out',
  FB: 'flies out',
  BB: 'walks',
  '1B': 'singles',
  '1B+': 'singles',
  '2B': 'doubles',
  '3B': 'triples',
  HR: 'homers',
}

export function narrate(event: ScoringEventInput & { event_type?: string }): Narration | null {
  const p = event.payload ?? {}
  const batter = typeof p.batter === 'string' && p.batter ? p.batter : null
  const chart = typeof p.chartResult === 'string' && p.chartResult ? p.chartResult : null
  if (!batter || !chart) return null

  const before = asScore(p.score)
  const after = asScore(p.resultingScore)
  const runs = before && after ? (after.away - before.away) + (after.home - before.home) : 0

  const outsBefore = typeof p.outs === 'number' ? p.outs : null
  const outsAfter = typeof p.resultingOuts === 'number' ? p.resultingOuts : null
  // A third out ends the half and resets the count to 0, so a DROP to zero is
  // still an out -- but only from two. Treating any zero as an out made a
  // leadoff double read as an out, which the tests caught.
  const madeOut = outsBefore !== null && outsAfter !== null
    && (outsAfter > outsBefore || (outsBefore === 2 && outsAfter === 0))

  const phrase = CHART_PHRASE[chart] ?? chart
  // GB and FB only "ground out" / "fly out" if an out was actually recorded --
  // the same chart result can end with the batter safe.
  const verb = (chart === 'GB' || chart === 'FB') && !madeOut
    ? (chart === 'GB' ? 'grounds' : 'flies out to the outfield')
    : phrase

  let text = `${batter} ${verb}`
  if (runs === 1) text += ', 1 run scores'
  else if (runs > 1) text += `, ${runs} run${runs === 1 ? '' : 's'} score`

  const kind: Narration['kind'] = runs > 0 ? 'scoring'
    : madeOut ? 'out'
    : occupied(p.resultingBases) > occupied(p.bases) ? 'onbase'
    : 'neutral'

  return { text: `${text}.`, runs, kind }
}
