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
const lastName = (name: string) => name.split(' ').slice(-1)[0] || name

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
      ? `${throwTarget.runner.playerName} ${tag}${throwTarget.to === 'HOME' ? 'scores, beating the throw home' : `beats the throw to ${to}`} from ${lastName(of)} in ${pos}.`
      : `${lastName(of)} throws out ${throwTarget.runner.playerName} at ${to}${tag ? ' on the tag-up' : ''}.`)
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
  const tagging = kind === 'OUTFIELD_FIELDING_ROLL' && String(ctx.kind) === 'TAG_UP' || kind === 'TAG_UP_RTS'
  const gb = Boolean(kind?.startsWith('GB_')) || chartResult === 'GB'
  for (const m of movers) {
    const now = half ? where(after, m.key) : null
    if (now) {
      if (m.from !== now && !mentioned.has(m.key)) {
        if (m.from === 'batter') { if (!chartResult && kind !== 'INTENTIONAL_WALK_CONFIRM') lines.push(`${m.name} reaches ${BASE_WORD[now]}.`) }
        else lines.push(`${m.name} ${tagging ? 'tags up and goes' : 'goes'} to ${BASE_WORD[now]}.`)
      }
      continue
    }
    if (toCredit > 0) {
      toCredit -= 1
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
  return { lines: all, paKey: paKeyOf(before), runs, kind: kindOut }
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
