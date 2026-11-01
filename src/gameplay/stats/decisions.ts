import type { GameSide, PlayRecord } from '../types'
import type { PitchingLine } from './gameStats'

/**
 * Pitcher decisions -- W, L, SV, HLD, BSV -- by fixed rules, no scorer
 * judgment (Anthony, 2026-11-01: original decisions 8 and 9, audit decisions
 * 10 and 11). The winning-pitcher tree is IMPLEMENTATION_PLAN.md §5.4 exactly;
 * nothing beyond it is applied.
 *
 * W (EDSR-W v2, from OBR 9.17):
 *  1. Go-ahead run G: the run after which the winner led for the rest of the game.
 *  2. Pitcher of record (POR): the winner's pitcher on the mound for its most
 *     recent defensive play before G scored (its starter if none).
 *  3. POR is the starter: wins with outs >= S (15 if the winner defended 6+
 *     innings, else 12); otherwise the best-ranked of all the winner's relievers.
 *  4. POR is a reliever: wins unless brief and ineffective (outs < 3 and runs
 *     while pitching >= 2); if he is, the best-ranked later reliever who is
 *     not brief and ineffective; none -> POR.
 *  5. Ranking, first difference decides: outs >= 3; fewer runs charged; fewer
 *     runs while pitching; fewer H + BB; more outs; earlier entry.
 * L (EDSR-L, 9.17(d)): the responsible pitcher of G's runner.
 * SV (EDSR-SV, 9.19 with Anthony's 4.50 rule): finishes the win, is not W,
 *  >= 1 out, the lead never tied or lost while he pitched, and at his last
 *  entry either (1) led by 1-3 and pitched >= 3 outs, (2) the tying run was on
 *  base, at bat or on deck (lead <= runners on + 2), or (3) pitched >= 9 outs
 *  with 6 x ER <= outs.
 * HLD / BSV: a reliever who entered in a save situation ((1) lead or (2)):
 *  HLD if he got an out, left with the lead intact, did not finish and got
 *  neither W nor SV; BSV if the lead was tied or lost while he pitched.
 */

export type PitcherDecisions = {
  winner: GameSide | null
  W: string | null
  L: string | null
  SV: string | null
  HLD: string[]
  BSV: string[]
  /** How W was decided, for the box score note and the tests. */
  winBranch: 'starter' | 'starter_short' | 'reliever' | 'reliever_brief_ineffective' | null
}

type Ctx = {
  plays: PlayRecord[]
  pitching: Record<GameSide, PitchingLine[]>
  final: Record<GameSide, number>
  /** True only for a completed game with a result. */
  complete: boolean
}

const other = (side: GameSide): GameSide => (side === 'home' ? 'away' : 'home')

function goAheadRun(plays: PlayRecord[], winner: GameSide): { play: PlayRecord; index: number; runIndex: number } | null {
  let candidate: { play: PlayRecord; index: number; runIndex: number } | null = null
  plays.forEach((play, index) => {
    play.runs.forEach((run, runIndex) => {
      if (!run.counted || !run.scoreAfter) return
      const w = run.scoreAfter[winner], l = run.scoreAfter[other(winner)]
      const before = play.battingSide === winner ? w - 1 : w
      const beforeL = play.battingSide === winner ? l : l - 1
      if (play.battingSide === winner && before <= beforeL && w > l) candidate = { play, index, runIndex }
      if (play.battingSide !== winner && l >= w) candidate = null
    })
  })
  return candidate
}

function rankKey(line: PitchingLine): number[] {
  return [line.outs >= 3 ? 0 : 1, line.R, line.runsWhilePitching, line.H + line.BB, -line.outs, line.entryOrder]
}

export function bestRanked(lines: PitchingLine[]): PitchingLine | null {
  let best: PitchingLine | null = null
  for (const line of lines) {
    if (!best) { best = line; continue }
    const a = rankKey(line), b = rankKey(best)
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { if (a[i] < b[i]) best = line; break }
    }
  }
  return best
}

const briefAndIneffective = (line: PitchingLine) => line.outs < 3 && line.runsWhilePitching >= 2

function defensiveInnings(plays: PlayRecord[], side: GameSide): number {
  const halves = new Set<string>()
  for (const play of plays) if (play.battingSide !== side && play.kind !== 'substitution') halves.add(`${play.inning}-${play.half}`)
  return halves.size
}

/** Pitcher entries for a side, in order: { key, seq, scoreBefore, runnersOn }. The starter has seq 0. */
function entries(plays: PlayRecord[], side: GameSide, starter: string | null) {
  const out: Array<{ key: string; seq: number; scoreBefore: Record<GameSide, number>; runnersOn: number }> = []
  if (starter) out.push({ key: starter, seq: 0, scoreBefore: { away: 0, home: 0 }, runnersOn: 0 })
  for (const play of plays) {
    const sub = play.substitution
    if (sub && sub.side === side && sub.position === 'P') out.push({ key: sub.incomingKey, seq: play.seq, scoreBefore: sub.scoreBefore, runnersOn: sub.runnersOn })
  }
  return out
}

/** Did the lead get tied or lost while `key` pitched, after his entry at `fromSeq`? */
function leadLostWhilePitching(plays: PlayRecord[], side: GameSide, key: string, fromSeq: number): boolean {
  for (const play of plays) {
    if (play.seq <= fromSeq || play.battingSide === side) continue
    for (const run of play.runs) {
      if (!run.counted || !run.scoreAfter || run.pitcherOnMoundKey !== key) continue
      if (run.scoreAfter[other(side)] >= run.scoreAfter[side]) return true
    }
  }
  return false
}

function saveSituation(lead: number, runnersOn: number): { lead: boolean; tyingRun: boolean } {
  return { lead: lead >= 1 && lead <= 3, tyingRun: lead >= 1 && lead <= runnersOn + 2 }
}

export function computeDecisions(ctx: Ctx): PitcherDecisions {
  const none: PitcherDecisions = { winner: null, W: null, L: null, SV: null, HLD: [], BSV: [], winBranch: null }
  if (!ctx.complete || ctx.final.home === ctx.final.away) return none
  const winner: GameSide = ctx.final.home > ctx.final.away ? 'home' : 'away'
  const loser = other(winner)
  const g = goAheadRun(ctx.plays, winner)
  if (!g) return { ...none, winner }

  const lines = ctx.pitching[winner]
  const lineOf = (key: string | null | undefined) => lines.find((l) => l.cardKey === key) ?? null
  const starter = lines.find((l) => l.entryOrder === 0) ?? null

  // Pitcher of record: the winner's pitcher for its last defensive play before G.
  let porKey: string | null = starter?.cardKey ?? null
  for (let i = 0; i < g.index; i++) {
    const play = ctx.plays[i]
    if (play.battingSide !== winner && play.kind !== 'substitution' && play.pitcherKey) porKey = play.pitcherKey
  }
  const por = lineOf(porKey)

  let W: PitchingLine | null = null
  let winBranch: PitcherDecisions['winBranch'] = null
  const relievers = lines.filter((l) => l.entryOrder > 0)
  if (por && por.entryOrder === 0) {
    const threshold = defensiveInnings(ctx.plays, winner) >= 6 ? 15 : 12
    if (por.outs >= threshold) { W = por; winBranch = 'starter' }
    else { W = (relievers.length === 1 ? relievers[0] : bestRanked(relievers)) ?? por; winBranch = 'starter_short' }
  } else if (por) {
    if (!briefAndIneffective(por)) { W = por; winBranch = 'reliever' }
    else {
      const later = relievers.filter((l) => l.entryOrder > por.entryOrder && !briefAndIneffective(l))
      W = later.length ? bestRanked(later) : por
      winBranch = 'reliever_brief_ineffective'
    }
  }

  // L: responsible pitcher of the go-ahead runner.
  const goAhead = g.play.runs[g.runIndex]
  const L = goAhead.responsiblePitcherKey ?? null

  // Finisher: the winner's last pitcher.
  const winnerEntries = entries(ctx.plays, winner, starter?.cardKey ?? null)
  let finisherKey: string | null = null
  for (const play of ctx.plays) if (play.battingSide !== winner && play.kind !== 'substitution' && play.pitcherKey) finisherKey = play.pitcherKey
  const finisher = lineOf(finisherKey)

  let SV: string | null = null
  if (finisher && finisher.entryOrder > 0 && finisher.cardKey !== W?.cardKey && finisher.outs >= 1) {
    const last = [...winnerEntries].reverse().find((e) => e.key === finisher.cardKey)
    if (last) {
      const lead = last.scoreBefore[winner] - last.scoreBefore[loser]
      const situation = saveSituation(lead, last.runnersOn)
      const lost = leadLostWhilePitching(ctx.plays, winner, finisher.cardKey, last.seq)
      const effectiveLong = finisher.outs >= 9 && 6 * finisher.ER <= finisher.outs
      if (!lost && lead >= 1 && ((situation.lead && finisher.outs >= 3) || situation.tyingRun || effectiveLong)) SV = finisher.cardKey
    }
  }

  const HLD: string[] = []
  const BSV: string[] = []
  for (const side of [winner, loser] as GameSide[]) {
    const sideEntries = entries(ctx.plays, side, ctx.pitching[side].find((l) => l.entryOrder === 0)?.cardKey ?? null)
    let sideFinisher: string | null = null
    for (const play of ctx.plays) if (play.battingSide !== side && play.kind !== 'substitution' && play.pitcherKey) sideFinisher = play.pitcherKey
    const seen = new Set<string>()
    for (const entry of sideEntries) {
      if (entry.seq === 0 || seen.has(entry.key)) continue
      seen.add(entry.key)
      const lead = entry.scoreBefore[side] - entry.scoreBefore[other(side)]
      const situation = saveSituation(lead, entry.runnersOn)
      if (!situation.lead && !situation.tyingRun) continue
      const lost = leadLostWhilePitching(ctx.plays, side, entry.key, entry.seq)
      const line = ctx.pitching[side].find((l) => l.cardKey === entry.key)
      if (lost) BSV.push(entry.key)
      else if (line && line.outs >= 1 && entry.key !== sideFinisher && entry.key !== W?.cardKey && entry.key !== SV) HLD.push(entry.key)
    }
  }

  return { winner, W: W?.cardKey ?? null, L, SV, HLD, BSV, winBranch }
}
