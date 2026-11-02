import { battingSide } from '../gameBoundaryEngine'
import { decisionRollBreakdown, type RollModifier, type RunnerAttempt } from '../decisionEngine'
import { currentHitterFatigueContext, currentPitcherFatigueContext, effectiveCurrentHitterOnBase, effectiveCurrentPitcherControl } from '../engine'
import type { BaseRunnerState, DefensivePosition, GameSide, GameState } from '../types'

/**
 * What happened, written down at the moment it happened.
 *
 * Every move is saved with the full state before and after it, and this is the
 * only place both are in hand. So the play-by-play and the roll breakdown are
 * built here, once, and stored in the event payload -- which is what lets the
 * manager who did NOT roll see exactly what the one who did saw.
 *
 * The rule is the same as playNarration.ts's: state only what the two states
 * show. Runners are matched by card key across the bases; one who vanished
 * either scored or was put out, and runs are credited lead runner first,
 * which is the only order the bases allow. When the half ends the bases are
 * cleared, so who was stranded is not knowable -- the text says the inning is
 * over and names nobody it cannot.
 */

export type RollView = {
  title: string
  roll: number
  modifiers: RollModifier[]
  total?: number
  versus?: { label: string; value: number }
  natural?: string
  /** Modifiers that alone decided it, e.g. the steal-home +15. */
  decisive?: string[]
  /** The gameplay result, distinct from the number. */
  result: string
  tone: 'defense' | 'offense' | 'neutral'
}

export type PlayRecord = {
  /** Chronological sentences for this one step. */
  lines: string[]
  /**
   * The step in one line for the roll area: what happened, then who scored,
   * who moved and the out count -- "Single — Dean scores", "Strikeout — second
   * out". Built from the same resolved before/after states as `lines`, never
   * from the die. Absent on events saved before it existed.
   */
  summary?: string
  /** Groups the steps of one plate appearance, for the recap. */
  paKey: string
  runs: number
  kind: 'scoring' | 'out' | 'onbase' | 'neutral'
}

type Base = 'first' | 'second' | 'third'
const BASES: Base[] = ['third', 'second', 'first']
const BASE_WORD: Record<Base, string> = { first: 'first', second: 'second', third: 'third' }
const ATTEMPT_WORD: Record<string, string> = { '2B': 'second', '3B': 'third', HOME: 'home' }
const FORCE_AT: Record<Base, string> = { first: 'second', second: 'third', third: 'home' }
const NUMBER = ['No', 'One', 'Two', 'Three']

const other = (side: GameSide): GameSide => (side === 'home' ? 'away' : 'home')

export const CHART_VERB: Record<string, string> = {
  PU: 'pops out',
  K: 'strikes out',
  GB: 'hits a ground ball',
  FB: 'flies out',
  BB: 'walks',
  '1B': 'singles',
  '1B+': 'singles',
  '2B': 'doubles',
  '3B': 'triples',
  HR: 'homers',
}

function cardName(state: GameState, side: GameSide, key: string | null | undefined): string | null {
  if (!key) return null
  return state.pregame[side].roster?.cards[key]?.playerName ?? key
}

function where(state: GameState, key: string): Base | null {
  return BASES.find((b) => state.bases[b]?.cardKey === key) ?? null
}

function sameHalf(before: GameState, after: GameState) {
  return before.inning === after.inning && before.half === after.half
}

export function paKeyOf(state: GameState): string {
  const offense = battingSide(state.half)
  return `${state.inning}-${state.half}-${state.lineupCursor[offense]}-${state.plateAppearance.batterCardKey ?? ''}`
}

/** Pinch hitters, pinch runners, pitching changes and position moves, from the lineup diff. */
function rosterLines(before: GameState, after: GameState): string[] {
  const lines: string[] = []
  for (const side of ['away', 'home'] as GameSide[]) {
    const b = before.pregame[side], a = after.pregame[side]
    const order = b.battingOrderCardKeys
    const dhOver = b.defensiveAlignment.DH && !a.defensiveAlignment.DH ? b.defensiveAlignment.DH : null
    order.forEach((key, slot) => {
      const next = a.battingOrderCardKeys[slot]
      if (dhOver && key === dhOver && next) {
        lines.push(`The DH is over: ${cardName(before, side, key)} leaves the game and ${cardName(after, side, next)} bats in his spot.`)
        return
      }
      if (next && next !== key && !order.includes(next)) {
        const isRunner = BASES.some((base) => before.bases[base]?.cardKey === key)
        const isBatter = before.plateAppearance.batterCardKey === key
        const verb = isBatter ? 'pinch-hits for' : isRunner ? 'pinch-runs for' : 'replaces'
        lines.push(`${cardName(after, side, next)} ${verb} ${cardName(before, side, key)}.`)
      }
    })
    const positions = Object.keys({ ...b.defensiveAlignment, ...a.defensiveAlignment }) as DefensivePosition[]
    for (const pos of positions) {
      const was = b.defensiveAlignment[pos], now = a.defensiveAlignment[pos]
      if (!now || now === was) continue
      const from = (Object.keys(b.defensiveAlignment) as DefensivePosition[]).find((p) => b.defensiveAlignment[p] === now)
      if (pos === 'P') lines.push(from ? `${cardName(after, side, now)} moves from ${from} to pitch.` : `Pitching change: ${cardName(after, side, now)} takes the mound for ${cardName(before, side, was)}.`)
      else if (from && from !== 'P') lines.push(`${cardName(after, side, now)} moves from ${from} to ${pos}.`)
      else if (from === 'P') lines.push(`${cardName(after, side, now)} moves from the mound to ${pos}.`)
      else if (!order.includes(now) || !lines.some((l) => l.startsWith(cardName(after, side, now) ?? ''))) lines.push(`${cardName(after, side, now)} takes over at ${pos}.`)
    }
  }
  return lines
}

/**
 * The step's sentences. `chartResult` is passed for a swing, which is the one
 * step whose result is not otherwise visible in the after-state.
 */
export function describePlay(before: GameState, after: GameState, chartResult?: string | null): PlayRecord {
  const offense = battingSide(before.half)
  const defense = other(offense)
  const lines: string[] = []
  const decision = before.pendingDecision
  const kind = decision?.decisionType ?? null
  const ctx = (decision?.context ?? {}) as Record<string, unknown>
  const half = sameHalf(before, after)
  const ended = !half || after.status === 'complete'
  const outsAdded = half ? Math.max(0, after.outs - before.outs) : 3 - before.outs
  const runs = Math.max(0, after.score[offense] - before.score[offense])
  const batterKey = before.plateAppearance.batterCardKey
  const batter = cardName(before, offense, batterKey) ?? 'The batter'
  const throwTarget = (ctx.target as RunnerAttempt | undefined)?.runner?.cardKey
    ? ctx.target as RunnerAttempt : null

  // ---- what the batter / the call did
  if (chartResult) {
    const reachedOnGb = chartResult === 'GB' && batterKey && where(after, batterKey)
    let verb = CHART_VERB[chartResult] ?? chartResult
    if (chartResult === 'GB' && !after.pendingDecision) verb = outsAdded >= 2 ? 'grounds into a double play' : reachedOnGb ? 'reaches on a ground ball' : 'grounds out'
    if (chartResult === 'FB' && outsAdded === 0 && half) verb = 'flies out'
    lines.push(`${batter} ${verb}.`)
  } else if (kind === 'INTENTIONAL_WALK_CONFIRM') lines.push(`${batter} is intentionally walked.`)
  else if (kind === 'SAC_BUNT_RTS' || kind === 'SAC_BUNT_WHEEL_RTS') {
    const batterOut = batterKey && !where(after, batterKey) && outsAdded > 0
    const leadOut = outsAdded > (batterOut ? 1 : 0)
    if (after.waitingFor === 'SWING_ROLL') lines.push(`${batter}'s bunt attempt fails — he must swing on the pitcher's chart.`)
    else if (leadOut) lines.push(`${batter} bunts, but the lead runner is cut down.`)
    else if (batterOut) lines.push(`${batter} lays down a successful sacrifice bunt.`)
    else if (outsAdded === 0) lines.push(`${batter} bunts and everyone is safe.`)
  } else if (kind === 'SQUEEZE_BUNT_ROLL') lines.push(`${batter} squares to squeeze.`)
  else if (kind === 'CATCHER_FIELDING_ROLL' || kind === 'ONE_BASE_PLUS_STOLEN_BASE') {
    const target = kind === 'CATCHER_FIELDING_ROLL' ? throwTarget?.runner : ctx.target as BaseRunnerState | undefined
    const to = kind === 'CATCHER_FIELDING_ROLL' ? ATTEMPT_WORD[throwTarget?.to ?? ''] : 'second'
    const catcher = cardName(before, defense, before.pregame[defense].defensiveAlignment.C) ?? 'the catcher'
    if (target) {
      const out = !where(after, target.cardKey) && (outsAdded > 0 || !half) && !(to === 'home' && runs > 0)
      lines.push(out ? `${target.playerName} tries to steal ${to} and is thrown out by ${catcher}.` : to === 'home' ? `${target.playerName} steals home!` : `${target.playerName} steals ${to}.`)
    }
  } else if (kind === 'SECOND_STEAL_HOME_ROLL') {
    const target = ctx.target as BaseRunnerState
    lines.push(runs > 0 ? `${target.playerName} steals home!` : `${target.playerName} tries to steal home and is thrown out.`)
  } else if (kind === 'OUTFIELD_FIELDING_ROLL' && throwTarget) {
    const pos = String(ctx.outfielder ?? 'the outfield')
    const of = cardName(before, defense, before.pregame[defense].defensiveAlignment[pos as DefensivePosition]) ?? pos
    const to = ATTEMPT_WORD[throwTarget.to] ?? throwTarget.to
    const safe = throwTarget.to === 'HOME' ? runs > 0 : Boolean(where(after, throwTarget.runner.cardKey))
    const tag = String(ctx.kind) === 'TAG_UP' ? 'tags and ' : ''
    lines.push(safe
      ? `${throwTarget.runner.playerName} ${tag}${throwTarget.to === 'HOME' ? 'scores, beating the throw home' : `beats the throw to ${to}`} from ${pos} ${of}.`
      : `${pos} ${of} throws out ${throwTarget.runner.playerName} at ${to}${tag ? ' on the tag-up' : ''}.`)
  } else if ((kind === 'EXTRA_BASE_RTS' || kind === 'TAG_UP_RTS') && !after.pendingDecision && half && after.outs === before.outs) {
    // A failed roll-to-see: no throw, the play stands as it was.
    if (BASES.every((b) => before.bases[b]?.cardKey === after.bases[b]?.cardKey) && runs === 0) lines.push('No chance to take the extra base — runners hold.')
  }

  // ---- runner movement, lead runner first, then the batter
  const mentioned = new Set<string>()
  if (throwTarget) mentioned.add(throwTarget.runner.cardKey)
  for (const line of lines) for (const b of BASES) { const r = before.bases[b]; if (r && line.includes(r.playerName)) mentioned.add(r.cardKey) }
  const movers: Array<{ key: string; name: string; from: Base | 'batter' }> = BASES
    .map((b) => before.bases[b] ? { key: before.bases[b]!.cardKey, name: before.bases[b]!.playerName, from: b } : null)
    .filter((x): x is { key: string; name: string; from: Base } => Boolean(x))
  const batterDone = Boolean(chartResult || kind === 'INTENTIONAL_WALK_CONFIRM' || kind?.startsWith('SAC_BUNT') || kind === 'SQUEEZE_BUNT_ROLL' || kind?.startsWith('GB_')) && batterKey
  if (batterDone && batterKey) movers.push({ key: batterKey, name: batter, from: 'batter' })

  let toCredit = runs
  const scored: string[] = []
  const advanced: Array<{ name: string; to: Base }> = []
  const tagging = kind === 'OUTFIELD_FIELDING_ROLL' && String(ctx.kind) === 'TAG_UP' || kind === 'TAG_UP_RTS'
  const gb = Boolean(kind?.startsWith('GB_')) || chartResult === 'GB'
  for (const m of movers) {
    const now = half ? where(after, m.key) : null
    if (now) {
      if (m.from !== now && m.from !== 'batter') advanced.push({ name: m.name, to: now })
      if (m.from !== now && !mentioned.has(m.key)) {
        if (m.from === 'batter') { if (!chartResult && kind !== 'INTENTIONAL_WALK_CONFIRM') lines.push(`${m.name} reaches ${BASE_WORD[now]}.`) }
        else lines.push(`${m.name} ${tagging ? 'tags up and goes' : 'goes'} to ${BASE_WORD[now]}.`)
      }
      continue
    }
    if (toCredit > 0) {
      toCredit -= 1
      scored.push(m.name)
      if (m.from === 'batter') { if (chartResult !== 'HR') lines.push(`${m.name} comes all the way around to score.`) }
      else if (!(throwTarget && throwTarget.runner.cardKey === m.key && throwTarget.to === 'HOME') && !(kind === 'SECOND_STEAL_HOME_ROLL') && !(kind === 'CATCHER_FIELDING_ROLL' && throwTarget?.runner.cardKey === m.key))
        lines.push(`${m.name} ${tagging ? 'tags up and scores' : `scores from ${BASE_WORD[m.from as Base]}`}.`)
      continue
    }
    if (!half) continue // the inning ended; stranded and out cannot be told apart
    // A decision is still open (the ground-ball choice, an extra-base call):
    // nobody is out until it resolves, and the next step will say who is.
    if (after.pendingDecision) continue
    if (mentioned.has(m.key)) continue
    if (m.from === 'batter') {
      if (chartResult && (['K', 'PU', 'FB'].includes(chartResult) || (chartResult === 'GB' && outsAdded === 1))) continue // the verb already says it
      lines.push(gb || kind?.startsWith('SAC_BUNT') ? `${m.name} is retired at first.` : `${m.name} is out.`)
    } else lines.push(gb ? `${m.name} is forced out at ${FORCE_AT[m.from as Base]}.` : `${m.name} is out.`)
  }

  // ---- the runner-on-2B roll to hold: say the result either way, or a hold
  // reads as nothing having happened
  if (kind === 'GB_RUNNER_2B_RTH' && half) {
    const r2 = before.bases.second
    if (r2 && where(after, r2.cardKey) === 'second') lines.push(`${r2.playerName} holds at second.`)
  }

  // ---- the tally
  if (runs > 0) {
    const team = after.managers[offense].managerName
    lines.push(`${team} score${runs === 1 ? 's' : ''} ${runs === 1 ? 'a run' : `${runs} runs`} — ${after.managers.away.managerName} ${after.score.away}, ${after.managers.home.managerName} ${after.score.home}.`)
  }
  if (outsAdded >= 2) lines.push(`${NUMBER[outsAdded]} outs on the play.`)
  if (after.status === 'complete') lines.push('Ballgame.')
  else if (ended && outsAdded > 0) lines.push('That ends the inning.')

  const roster = rosterLines(before, after)
  const all = [...roster, ...lines]
  const kindOut: PlayRecord['kind'] = runs > 0 ? 'scoring' : outsAdded > 0 ? 'out'
    : movers.some((m) => m.from === 'batter' && half && where(after, m.key)) ? 'onbase' : 'neutral'
  const summary = summarize({ before, after, chartResult, kind, ctx, throwTarget, lines, scored, advanced, outsAdded, runs, half, ended, batterKey })
  return { lines: all, summary, paKey: paKeyOf(before), runs, kind: kindOut }
}

/** The pitch roll: the die, the pitcher's Control (after fatigue), against the batter's On Base. */
export function pitchRollView(before: GameState, roll: number, after: GameState): RollView {
  const pitcher = currentPitcherFatigueContext(before)
  const hitter = currentHitterFatigueContext(before)
  const control = effectiveCurrentPitcherControl(before)
  const onBase = effectiveCurrentHitterOnBase(before)
  const printed = pitcher?.input.printedControl
  const label = `${pitcher?.card.playerName ?? 'Pitcher'} Control${printed !== null && printed !== undefined && printed !== control ? ` (C${printed}, fatigue ${control - printed})` : ''}`
  const adv = after.plateAppearance.advantage
  return {
    title: 'Pitch',
    roll,
    modifiers: [{ label, value: control }],
    total: roll + control,
    versus: { label: `${hitter?.card.playerName ?? 'Batter'} On Base`, value: onBase },
    result: adv === 'pitcher' ? 'Pitcher advantage — swing on the pitcher\'s chart' : adv === 'hitter' ? 'Hitter advantage — swing on the hitter\'s chart' : 'No advantage',
    tone: adv === 'pitcher' ? 'defense' : adv === 'hitter' ? 'offense' : 'neutral',
  }
}

export function swingRollView(before: GameState, roll: number, chartResult: string): RollView {
  const offense = battingSide(before.half)
  const pitcherChart = before.plateAppearance.advantage === 'pitcher'
  const owner = pitcherChart
    ? cardName(before, other(offense), before.plateAppearance.pitcherCardKey)
    : cardName(before, offense, before.plateAppearance.batterCardKey)
  const good = ['BB', '1B', '1B+', '2B', '3B', 'HR'].includes(chartResult)
  return {
    title: `Swing on ${owner ?? (pitcherChart ? 'the pitcher' : 'the hitter')}'s chart`,
    roll,
    modifiers: [],
    result: `${chartResult} — ${CHART_VERB[chartResult] ?? chartResult}`,
    tone: good ? 'offense' : 'defense',
  }
}

/** A decision roll, from the same breakdown the board showed before it was rolled. */
export function decisionRollView(before: GameState, roll: number, play: PlayRecord): RollView {
  const b = decisionRollBreakdown(before, roll)
  const result = play.lines.find((l) => !l.startsWith('Pitching change')) ?? 'Resolved.'
  if (!b) return { title: 'Roll', roll, modifiers: [], result, tone: 'neutral' }
  return {
    title: b.title,
    roll,
    modifiers: b.modifiers,
    total: b.total,
    versus: b.versus,
    natural: b.natural,
    decisive: b.decisiveModifiers.length ? b.decisiveModifiers : undefined,
    result: b.versus ? `${b.defenseWins ? 'Out' : 'Safe'} — ${result}` : `${result}`,
    tone: b.defenseWins === null ? 'neutral' : b.defenseWins ? 'defense' : 'offense',
  }
}

/** The play-by-play recorded with a saved event, when it has one. */
export function playOf(event: { payload?: Record<string, unknown> | null }): PlayRecord | null {
  const p = event.payload?.play
  return p && typeof p === 'object' && Array.isArray((p as PlayRecord).lines) && (p as PlayRecord).lines.length ? p as PlayRecord : null
}

const CHART_NOUN: Record<string, string> = {
  PU: 'Pop out', K: 'Strikeout', FB: 'Fly out', BB: 'Walk',
  '1B': 'Single', '1B+': 'Single', '2B': 'Double', '3B': 'Triple', HR: 'Home run',
}
const ORDINAL_OUT = ['', 'first out', 'second out', 'third out']
const BASE_SHORT: Record<Base, string> = { first: 'first', second: 'second', third: 'third' }

/** describePlay's facts as one compact line for the roll area. */
function summarize(f: {
  before: GameState; after: GameState; chartResult?: string | null; kind: string | null
  ctx: Record<string, unknown>; throwTarget: RunnerAttempt | null; lines: string[]
  scored: string[]; advanced: Array<{ name: string; to: Base }>
  outsAdded: number; runs: number; half: boolean; ended: boolean; batterKey: string | null
}): string | undefined {
  const last = (name: string) => name.split(' ').slice(-1)[0] || name
  let head: string | null = null
  let groundBall = false
  if (f.chartResult === 'GB') {
    groundBall = true
    head = f.after.pendingDecision ? 'Ground ball'
      : f.outsAdded >= 2 ? 'Double play'
      : f.batterKey && where(f.after, f.batterKey) ? 'Ground ball, safe at first'
      : f.outsAdded ? 'Groundout' : 'Ground ball'
  } else if (f.chartResult) head = CHART_NOUN[f.chartResult] ?? f.chartResult
  else if (f.kind === 'GROUND_BALL_RESOLUTION' || f.kind?.startsWith('GB_')) {
    groundBall = true
    // The roll that finishes a ground ball the defence chose how to play: say
    // what the whole play came to, not the first runner that moved.
    const batterSafe = Boolean(f.batterKey && where(f.after, f.batterKey))
    head = f.after.pendingDecision?.decisionType.startsWith('GB_') ? (f.outsAdded ? 'Force out' : 'Ground ball')
      : f.kind === 'GB_RUNNER_2B_RTH' ? 'Roll to hold'
      : f.kind === 'GB_TRIPLE_THIRD_CHECK' && f.outsAdded ? 'Triple play'
      : /_SECOND_CHECK$/.test(f.kind) && f.outsAdded && !batterSafe ? 'Double play'
      : batterSafe ? (f.outsAdded ? "Fielder's choice" : 'Ground ball, all safe')
      : f.outsAdded ? 'Groundout' : 'Ground ball'
  } else if (f.kind === 'INTENTIONAL_WALK_CONFIRM') head = 'Intentional walk'
  else if (f.kind === 'SAC_BUNT_RTS' || f.kind === 'SAC_BUNT_WHEEL_RTS') head = f.after.waitingFor === 'SWING_ROLL' ? 'Bunt fails — swing away' : 'Sacrifice bunt'
  else if (f.kind === 'SQUEEZE_BUNT_ROLL') head = 'Squeeze'
  else if (f.kind === 'CATCHER_FIELDING_ROLL' || f.kind === 'ONE_BASE_PLUS_STOLEN_BASE' || f.kind === 'SECOND_STEAL_HOME_ROLL') {
    const target = f.kind === 'CATCHER_FIELDING_ROLL' ? f.throwTarget?.runner : f.ctx.target as BaseRunnerState | undefined
    const to = f.kind === 'CATCHER_FIELDING_ROLL' ? ATTEMPT_WORD[f.throwTarget?.to ?? ''] : f.kind === 'SECOND_STEAL_HOME_ROLL' ? 'home' : 'second'
    if (target) {
      const safe = to === 'home' ? f.runs > 0 : Boolean(where(f.after, target.cardKey))
      head = safe ? `${last(target.playerName)} steals ${to}` : `${last(target.playerName)} caught stealing ${to}`
    }
  } else if (f.kind === 'OUTFIELD_FIELDING_ROLL' && f.throwTarget) {
    const t = f.throwTarget
    const safe = t.to === 'HOME' ? f.runs > 0 : Boolean(where(f.after, t.runner.cardKey))
    head = safe ? `${last(t.runner.playerName)} safe at ${ATTEMPT_WORD[t.to] ?? t.to}` : `${last(t.runner.playerName)} thrown out at ${ATTEMPT_WORD[t.to] ?? t.to}`
  } else if (f.lines.length) head = f.lines[0].replace(/[.!]$/, '')
  if (!head) return undefined

  const facts: string[] = []
  // The roll to hold on the runner from 2B: advanced or held, said first.
  let rthRunner: string | null = null
  if (f.kind === 'GB_RUNNER_2B_RTH' && f.half && f.before.bases.second) {
    const r2 = f.before.bases.second
    const now = where(f.after, r2.cardKey)
    if (now === 'third' || now === 'second') {
      rthRunner = r2.playerName
      facts.push(now === 'third' ? `${last(r2.playerName)} advances to third` : `${last(r2.playerName)} holds at second`)
    }
  }
  // Where a ground ball's outs were made: "Fielder's choice — out at second".
  // A runner who is gone and did not score was forced at the next base; the
  // batter is out at first. A plain groundout (the batter alone, at first)
  // already says so. Unknowable once the inning has ended and the bases clear.
  if (groundBall && f.half && f.outsAdded > 0 && !f.after.pendingDecision) {
    const outAt: string[] = []
    for (const b of ['third', 'second', 'first'] as Base[]) {
      const r = f.before.bases[b]
      if (r && !where(f.after, r.cardKey) && !f.scored.includes(r.playerName)) outAt.push(FORCE_AT[b])
    }
    if (f.batterKey && !where(f.after, f.batterKey) && !f.scored.some((n) => n === f.before.pregame[f.before.half === 'top' ? 'away' : 'home'].roster?.cards[f.batterKey!]?.playerName)) outAt.push('first')
    if (outAt.length && !(outAt.length === 1 && outAt[0] === 'first' && head === 'Groundout')) {
      facts.push(`${outAt.length === 1 ? 'out' : 'outs'} at ${outAt.length === 1 ? outAt[0] : `${outAt.slice(0, -1).join(', ')} and ${outAt.at(-1)}`}`)
    }
  }
  const scoredHere = f.scored.filter((n) => !head!.startsWith(last(n)))
  if (scoredHere.length === 1) facts.push(`${last(scoredHere[0])} scores`)
  else if (scoredHere.length === 2) facts.push(`${last(scoredHere[0])} and ${last(scoredHere[1])} score`)
  else if (scoredHere.length > 2) facts.push(`${scoredHere.length} runs score`)
  const moved = f.advanced.filter((m) => !head!.startsWith(last(m.name)) && m.name !== rthRunner)
  if (moved.length === 1) facts.push(`${last(moved[0].name)} to ${BASE_SHORT[moved[0].to]}`)
  else if (moved.length > 1) facts.push('runners advance')
  if (f.after.status === 'complete') facts.push('ballgame')
  else if (f.ended && f.outsAdded > 0) facts.push('inning over')
  // An out already on the board counts even while a decision follows (a fly
  // out before the tag-up call); a ground ball's outs wait on the defence's
  // choice, and until then outsAdded is 0.
  else if (f.half && f.outsAdded > 0) facts.push(ORDINAL_OUT[f.after.outs] ?? `${f.after.outs} outs`)
  return facts.length ? `${head} — ${facts.join(', ')}` : head
}
