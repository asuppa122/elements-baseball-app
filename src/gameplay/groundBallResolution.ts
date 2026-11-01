import type { BaseRunnerState, BasesState } from './types'

/**
 * Ground-ball outcomes -- the single implementation (D3, Anthony 2026-11-01).
 *
 * Every function is pure: the bases before the play, the batter-runner and the
 * outs before it, plus the results of whatever checks the Rulebook branch
 * calls for, give the bases after, the outs the play adds, the runners who
 * score (lead runner first) and the runners retired (most advanced first).
 * The live decision flow (decisionEngine.ts) decides which checks to roll and
 * then calls these; the harnesses and rule demos call the same functions
 * through groundBallEngine.ts. Nothing else resolves a ground ball.
 *
 * Invariants every outcome satisfies (checked by the GB matrix): each out
 * added is a real retired runner or the batter; no retired runner stays on a
 * base; no two runners share a base; a play that reaches three outs scores no
 * run (OBR 5.08(a): every out here is a force or the batter-runner).
 */

export type GbOutcome = {
  bases: BasesState
  outsAdded: number
  scorers: BaseRunnerState[]
  /** Runners put out on the play, most advanced first; the batter is listed as 'batter'. */
  retired: Array<{ runner: BaseRunnerState; at: 'home' | 'third' | 'second' | 'first' }>
  /** When the play ends the half: runners (batter included) neither retired nor scored -- team LOB. */
  leftOnBase?: number
}

const EMPTY: BasesState = { first: null, second: null, third: null }

/** Any play that reaches three outs ends the half with no run and nobody on. */
function finalize(outsBefore: number, outcome: GbOutcome): GbOutcome {
  if (outsBefore + outcome.outsAdded >= 3) {
    // Runs on a force third out never count (OBR 5.08(a)); those runners are stranded.
    const stranded = [outcome.bases.first, outcome.bases.second, outcome.bases.third].filter(Boolean).length + outcome.scorers.length
    return { ...outcome, bases: { ...EMPTY }, scorers: [], leftOnBase: stranded }
  }
  return outcome
}

/** Roll 1 on a double-play check: everyone safe, every runner up one base. */
export function gbAllSafe(pre: BasesState, batter: BaseRunnerState, outsBefore: number): GbOutcome {
  return finalize(outsBefore, {
    bases: { first: batter, second: pre.first, third: pre.second },
    outsAdded: 0,
    scorers: pre.third ? [pre.third] : [],
    retired: [],
  })
}

/** Standard (2B-then-1B) double-play attempt: lead runner to 2B, then the batter. */
export function gbStandardDoublePlay(pre: BasesState, batter: BaseRunnerState, outsBefore: number, leadOut: boolean, batterOut: boolean): GbOutcome {
  const retired: GbOutcome['retired'] = []
  if (leadOut && pre.first) retired.push({ runner: pre.first, at: 'second' })
  if (batterOut) retired.push({ runner: batter, at: 'first' })
  return finalize(outsBefore, {
    bases: { first: batterOut ? null : batter, second: leadOut ? null : pre.first, third: pre.second },
    outsAdded: Number(leadOut) + Number(batterOut),
    scorers: pre.third ? [pre.third] : [],
    retired,
  })
}

/** 3B-to-1B double-play attempt: runner heading to 3B, then the batter. */
export function gbThirdToFirstDoublePlay(pre: BasesState, batter: BaseRunnerState, outsBefore: number, leadOut: boolean, batterOut: boolean): GbOutcome {
  const retired: GbOutcome['retired'] = []
  if (leadOut && pre.second) retired.push({ runner: pre.second, at: 'third' })
  if (batterOut) retired.push({ runner: batter, at: 'first' })
  return finalize(outsBefore, {
    bases: { first: batterOut ? null : batter, second: pre.first, third: leadOut ? null : pre.second },
    outsAdded: Number(leadOut) + Number(batterOut),
    scorers: pre.third ? [pre.third] : [],
    retired,
  })
}

/** 3B-2B-1B triple-play attempt; later checks only happen after earlier outs. */
export function gbTriplePlay(pre: BasesState, batter: BaseRunnerState, outsBefore: number, outAtThird: boolean, outAtSecond: boolean, outAtFirst: boolean): GbOutcome {
  const retired: GbOutcome['retired'] = []
  if (outAtThird && pre.second) retired.push({ runner: pre.second, at: 'third' })
  if (outAtSecond && pre.first) retired.push({ runner: pre.first, at: 'second' })
  if (outAtFirst) retired.push({ runner: batter, at: 'first' })
  return finalize(outsBefore, {
    bases: { first: outAtFirst ? null : batter, second: outAtSecond ? null : pre.first, third: outAtThird ? null : pre.second },
    outsAdded: [outAtThird, outAtSecond, outAtFirst].filter(Boolean).length,
    scorers: pre.third ? [pre.third] : [],
    retired,
  })
}

/**
 * Taking the singular out with a runner on 1B: the Rulebook RFO picks the
 * forced runner retired. R1 + R2: 1-5 batter, 6-15 runner to 2B, 16-20 runner
 * to 3B. R1 only (± R3): 1-5 batter, 6-20 runner to 2B. A runner on 3B scores;
 * a runner on 2B without R1 behind him is not on this path.
 */
export function gbSingularOut(pre: BasesState, batter: BaseRunnerState, outsBefore: number, roll: number): GbOutcome {
  const outKind = pre.first && pre.second ? (roll <= 5 ? 'BATTER' : roll <= 15 ? 'TO2' : 'TO3') : roll <= 5 ? 'BATTER' : 'TO2'
  const bases: BasesState = { first: outKind === 'BATTER' ? null : batter, second: outKind === 'TO2' ? null : pre.first, third: pre.second }
  if (pre.second) bases.third = outKind === 'TO3' ? null : pre.second
  else if (pre.third) bases.third = null
  const retired: GbOutcome['retired'] =
    outKind === 'BATTER' ? [{ runner: batter, at: 'first' }]
      : outKind === 'TO2' && pre.first ? [{ runner: pre.first, at: 'second' }]
        : pre.second ? [{ runner: pre.second, at: 'third' }] : []
  return finalize(outsBefore, { bases, outsAdded: 1, scorers: pre.third ? [pre.third] : [], retired })
}

/** Runner on 2B with 1B open after the batter is out at 1B (and R3 has scored): RTH 1-10 advances, 11-20 holds. */
export function gbRunnerOnSecondRoll(pre: BasesState, roll: number): BasesState {
  return { first: null, second: roll <= 10 ? null : pre.second, third: roll <= 10 ? pre.second : null }
}

/** Infield In contact play: the lead runner is checked; every other runner advances; the batter is safe. */
export function gbContactPlay(pre: BasesState, batter: BaseRunnerState, outsBefore: number, leadOut: boolean): GbOutcome {
  const lead = pre.third ?? pre.second ?? pre.first
  if (!lead) return finalize(outsBefore, { bases: { ...pre }, outsAdded: 1, scorers: [], retired: [{ runner: batter, at: 'first' }] })
  const bases: BasesState = { first: batter, second: null, third: null }
  const scorers: BaseRunnerState[] = []
  if (pre.first && pre.first.cardKey !== lead.cardKey) bases.second = pre.first
  if (pre.second && pre.second.cardKey !== lead.cardKey) bases.third = pre.second
  if (pre.third) {
    if (pre.third.cardKey !== lead.cardKey || !leadOut) scorers.push(pre.third)
  }
  if (pre.second && pre.second.cardKey === lead.cardKey && !leadOut) bases.third = pre.second
  if (pre.first && pre.first.cardKey === lead.cardKey && !leadOut) bases.second = pre.first
  const at = lead === pre.third ? 'home' : lead === pre.second ? 'third' : 'second'
  return finalize(outsBefore, { bases, outsAdded: leadOut ? 1 : 0, scorers, retired: leadOut ? [{ runner: lead, at }] : [] })
}

/**
 * Infield In, forced-out states (Rulebook §7): bases loaded -- the runner
 * heading home is out, everyone else up one, batter safe; R1 only or R1 + R2
 * -- the lead runner is out, the others up one, batter safe on a fielder's
 * choice.
 */
export function gbInfieldInForcedOut(pre: BasesState, batter: BaseRunnerState, outsBefore: number): GbOutcome {
  if (pre.first && pre.second && pre.third) {
    return finalize(outsBefore, { bases: { first: batter, second: pre.first, third: pre.second }, outsAdded: 1, scorers: [], retired: [{ runner: pre.third, at: 'home' }] })
  }
  if (pre.first && pre.second) {
    return finalize(outsBefore, { bases: { first: batter, second: pre.first, third: null }, outsAdded: 1, scorers: [], retired: [{ runner: pre.second, at: 'third' }] })
  }
  if (pre.first) {
    return finalize(outsBefore, { bases: { first: batter, second: null, third: null }, outsAdded: 1, scorers: [], retired: [{ runner: pre.first, at: 'second' }] })
  }
  throw new Error('Infield In forced out needs a runner on 1B.')
}

/**
 * Infield In "hold" states (R2, R3, R2 + R3, R1 + R3): runners hold unless
 * forced and the batter is out at 1B.
 *
 * R1 + R3 under rules v2 (Anthony, 2026-11-01, confirmed): the batter reaches
 * 1B safely, the runner from 1B is forced to 2B, the runner on 3B holds, and
 * NO out is recorded -- the bases end loaded. Rules v1 kept R1 at 1B and put
 * the batter out.
 */
export function gbInfieldInHold(pre: BasesState, batter: BaseRunnerState, outsBefore: number, rulesV2: boolean): GbOutcome {
  if (rulesV2 && pre.first && pre.third && !pre.second) {
    return finalize(outsBefore, { bases: { first: batter, second: pre.first, third: pre.third }, outsAdded: 0, scorers: [], retired: [] })
  }
  return finalize(outsBefore, { bases: { ...pre }, outsAdded: 1, scorers: [], retired: [{ runner: batter, at: 'first' }] })
}

/** Which Infield In ground-ball branch a base state takes (Rulebook §7). */
export function infieldInBranch(pre: BasesState): 'forced_out' | 'hold' | 'none' {
  if (!pre.first && !pre.second && !pre.third) return 'none'
  if (pre.first && pre.second && pre.third) return 'forced_out'
  if (pre.first && !pre.third) return 'forced_out'
  return 'hold'
}

export type GroundBallChoice = 'TAKE_SINGULAR_OUT' | 'ATTEMPT_STANDARD_DBP' | 'ATTEMPT_3B_1B_DBP' | 'ATTEMPT_TRIPLE_PLAY' | 'HOLD_RUNNERS' | 'CONTACT_PLAY'

/**
 * The legal choices on a ground ball that reaches a decision -- the one
 * statement of them, used by the live decision view and the reference API.
 * Without Infield In a runner on 1B is needed (other states resolve without a
 * choice). A triple play needs no outs, runners on 1B and 2B, the 1B+2B+3B
 * combination available in the usage cycle, 2B fielding +4 or better and 3B
 * +2 or better (Rulebook §7).
 */
export function groundBallChoices(args: {
  pre: BasesState
  outs: number
  infieldIn: boolean
  /** Infield combinations available in the current usage cycle. */
  eligibleCombos: string[]
  secondBaseFielding: number
  thirdBaseFielding: number
  /** Rules v2 widens Infield In to 1B-only and 1B+2B (forced out, no contact play). */
  rulesV2: boolean
}): GroundBallChoice[] {
  const { pre } = args
  if (args.infieldIn) {
    const branch = infieldInBranch(pre)
    if (branch === 'forced_out' && (args.rulesV2 || (pre.first && pre.second && pre.third))) return ['HOLD_RUNNERS']
    return ['HOLD_RUNNERS', 'CONTACT_PLAY']
  }
  if (!pre.first) return []
  const out: GroundBallChoice[] = ['TAKE_SINGULAR_OUT', 'ATTEMPT_STANDARD_DBP']
  if (pre.second && args.eligibleCombos.some((c) => c.includes('3B'))) out.push('ATTEMPT_3B_1B_DBP')
  if (pre.second && args.outs === 0 && args.eligibleCombos.includes('1B+2B+3B') && args.secondBaseFielding >= 4 && args.thirdBaseFielding >= 2) out.push('ATTEMPT_TRIPLE_PLAY')
  return out
}
