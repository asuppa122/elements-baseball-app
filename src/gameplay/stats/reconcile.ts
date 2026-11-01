import type { GameSide, GameState } from '../types'
import { buildBoxScore } from './boxScore'

/**
 * Cross-checks a recorded game's box score against its final state -- every
 * total that can be computed two ways must agree. Used by the full-game
 * simulations so any play the recorder mis-reads shows up as a named failure.
 */
export function reconcileBoxScore(state: GameState): string[] {
  const box = buildBoxScore(state)
  if (box.kind !== 'recorded') return ['No play record.']
  const issues: string[] = []
  const { stats, decisions } = box
  const sides: GameSide[] = ['away', 'home']
  const other = (side: GameSide): GameSide => (side === 'home' ? 'away' : 'home')
  const sum = <T>(items: T[], pick: (item: T) => number) => items.reduce((n, item) => n + pick(item), 0)

  const plays = stats.plays
  plays.forEach((play, i) => { if (play.seq !== i + 1) issues.push(`Play ${i + 1} has seq ${play.seq}.`) })

  for (const side of sides) {
    const runs = state.score[side]
    const team = stats.team[side]
    if (team.R !== runs) issues.push(`${side}: team R ${team.R} != score ${runs}.`)
    const batterRuns = sum(stats.batting[side], (l) => l.R)
    if (batterRuns !== runs) issues.push(`${side}: batters' R ${batterRuns} != score ${runs}.`)
    const charged = sum(stats.pitching[other(side)], (l) => l.R)
    if (charged !== runs) issues.push(`${side}: runs charged to ${other(side)} pitchers ${charged} != ${runs}.`)
    const whilePitching = sum(stats.pitching[other(side)], (l) => l.runsWhilePitching)
    if (whilePitching !== runs) issues.push(`${side}: runs while pitching ${whilePitching} != ${runs}.`)
    const hits = sum(stats.batting[side], (l) => l.H)
    if (hits !== team.H) issues.push(`${side}: batters' H ${hits} != team H ${team.H}.`)
    const hitsAllowed = sum(stats.pitching[other(side)], (l) => l.H)
    if (hitsAllowed !== team.H) issues.push(`${side}: H allowed ${hitsAllowed} != team H ${team.H}.`)
    const pa = sum(stats.batting[side], (l) => l.PA)
    const bf = sum(stats.pitching[other(side)], (l) => l.BF)
    if (pa !== bf) issues.push(`${side}: PA ${pa} != BF ${bf}.`)
    if (pa % 9 !== state.lineupCursor[side]) issues.push(`${side}: ${pa} PA but the line-up cursor is ${state.lineupCursor[side]}.`)
    for (const line of stats.batting[side]) {
      if (line.AB + line.BB + line.SAC + line.SF !== line.PA) issues.push(`${side} ${line.cardKey}: AB+BB+SAC+SF != PA.`)
      if (line['1B'] + line['2B'] + line['3B'] + line.HR !== line.H) issues.push(`${side} ${line.cardKey}: hit types != H.`)
    }
    const rbi = sum(stats.batting[side], (l) => l.RBI)
    if (rbi > runs) issues.push(`${side}: RBI ${rbi} > runs ${runs}.`)
    const byInning = (state.runsByInning?.[side] ?? []).reduce((n, r) => n + (r ?? 0), 0)
    if (state.runsByInning && byInning !== runs) issues.push(`${side}: line score ${byInning} != ${runs}.`)
    // Outs: every out recorded while this side fielded belongs to one of its pitchers.
    const outs = sum(plays.filter((p) => p.battingSide === other(side) && p.kind !== 'substitution'), (p) => Math.max(0, p.outsAfter - p.outsBefore))
    const pitcherOuts = sum(stats.pitching[side], (l) => l.outs)
    if (outs !== pitcherOuts) issues.push(`${side}: ${outs} outs recorded but pitchers have ${pitcherOuts}.`)
  }

  if (state.status === 'complete' && state.score.home !== state.score.away) {
    const winner: GameSide = state.score.home > state.score.away ? 'home' : 'away'
    if (decisions.winner !== winner) issues.push(`Decisions winner ${decisions.winner} != ${winner}.`)
    if (!decisions.W || !stats.pitching[winner].some((l) => l.cardKey === decisions.W)) issues.push(`W ${decisions.W} is not a ${winner} pitcher.`)
    if (!decisions.L || !stats.pitching[other(winner)].some((l) => l.cardKey === decisions.L)) issues.push(`L ${decisions.L} is not a ${other(winner)} pitcher.`)
    if (decisions.SV && decisions.SV === decisions.W) issues.push('W and SV to the same pitcher.')
  }
  return issues
}
