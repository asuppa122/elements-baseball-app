import type { PlayRecord } from '../types'

/**
 * Plain-language play-by-play, written from the structured record. Display
 * only: nothing reads these strings back (statistics come from the record).
 */

const VERB: Record<string, string> = {
  single: 'singles', double: 'doubles', triple: 'triples', home_run: 'homers',
  walk: 'walks', intentional_walk: 'is intentionally walked', strikeout: 'strikes out',
  out: 'is out', fielders_choice: 'reaches on a fielder\'s choice', sacrifice_bunt: 'sacrifices', sacrifice_fly: 'hits a sacrifice fly',
}
const CHART_OUT: Record<string, string> = { GB: 'grounds out', FB: 'flies out', PU: 'pops out', K: 'strikes out' }
const BASE: Record<string, string> = { second: '2nd', third: '3rd', home: 'home' }
const SUB: Record<string, string> = {
  pinch_hitter: 'pinch-hits for', pinch_runner: 'pinch-runs for', defensive_sub: 'replaces', pitching_change: 'replaces', position_change: 'moves to',
}

export function describePlay(play: PlayRecord, name: (cardKey: string | null) => string): string {
  if (play.kind === 'substitution' && play.substitution) {
    const sub = play.substitution
    if (sub.kind === 'position_change') return `${name(sub.incomingKey)} moves to ${sub.position}.`
    const verb = SUB[sub.kind] ?? 'replaces'
    const where = sub.kind === 'pitching_change' ? ' on the mound' : sub.position && sub.kind === 'defensive_sub' ? ` at ${sub.position}` : ''
    return `${name(sub.incomingKey)} ${verb} ${name(sub.outgoingKey)}${where}.`
  }
  const parts: string[] = []
  for (const steal of play.steals) {
    const runner = name(steal.runnerKey)
    if (steal.kind === 'squeeze') parts.push(`${runner} is out at home on the squeeze (caught stealing).`)
    else parts.push(steal.success ? `${runner} steals ${BASE[steal.to]}.` : `${runner} is caught stealing ${BASE[steal.to]}.`)
  }
  if (play.kind === 'plate_appearance' && play.batting) {
    const b = play.batting
    let verb = VERB[b.credit] ?? b.credit
    if (b.credit === 'out' && b.chartResult && CHART_OUT[b.chartResult]) verb = CHART_OUT[b.chartResult]
    let sentence = `${name(play.batterKey)} ${verb}`
    if (b.gidp) sentence += ' into a double play'
    if (b.creditedFromChart) sentence += ` (a ${b.creditedFromChart.replace('_', ' ')} on the chart, credited as a ${b.credit.replace('_', ' ')})`
    parts.unshift(`${sentence}.`)
  }
  const counted = play.runs.filter((r) => r.counted)
  if (counted.length) parts.push(`${counted.map((r) => name(r.cardKey)).join(', ')} ${counted.length === 1 ? 'scores' : 'score'}.`)
  const uncounted = play.runs.filter((r) => !r.counted)
  if (uncounted.length) parts.push(`(${uncounted.map((r) => name(r.cardKey)).join(', ')} crossed after the winning run -- not counted.)`)
  const tp = play.defense.find((d) => d.kind === 'triple_play' && d.outsOnPlay >= 3)
  if (tp) parts.push('Triple play.')
  if (play.winningRun) parts.push('Walk-off.')
  if (play.outsAfter >= 3 && play.leftOnBase) parts.push(`${play.leftOnBase} left on base.`)
  return parts.join(' ') || play.note || 'Play.'
}
