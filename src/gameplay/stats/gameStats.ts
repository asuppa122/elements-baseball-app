import type { BattingCredit, DefensivePosition, GameSide, GameState, PlayRecord } from '../types'

/**
 * One game's statistics, derived only from the play log (playLog.ts) and the
 * starting line-ups it records. Deterministic: the same plays always give the
 * same lines. The single statistics implementation -- live lines, box scores
 * and the official writer all call it (STATS_SPEC.md §1).
 *
 * Definitions (STATS_SPEC.md §5-§9, Anthony's decisions of 2026-11-01):
 * - PA: completed plate appearances; a half ended by an out on the bases is not one.
 * - AB = PA - BB - SAC - SF. H from the credited result (walk-off hits per OBR 9.06(f)).
 * - OBP = (H + BB) / PA (Anthony's formula).
 * - OBA / OCHO / PCHW (batting) and ADV / OCHW / HCHO (pitching) from the
 *   engine's advantage on the completing chart swing; an intentional walk is
 *   BB for both and OCHW for the pitcher, nothing else.
 * - R charged to the runner's responsible pitcher; ER = R (all runs earned).
 * - IP stored as outs; every out on a play goes to the pitcher on the mound.
 */

export type BattingLine = {
  cardKey: string
  side: GameSide
  G: number; PA: number; AB: number; R: number; H: number
  '1B': number; '2B': number; '3B': number; HR: number
  RBI: number; SB: number; CS: number; BB: number; SO: number
  OBA: number; OCHO: number; PCHW: number; GIDP: number; SAC: number; SF: number
}

export type PitchingLine = {
  cardKey: string
  side: GameSide
  G: number; GS: number; BF: number; outs: number
  H: number; '2B': number; '3B': number; HR: number; BB: number; SO: number
  R: number; ER: number
  /** Runs that scored while he was on the mound, inherited runners included. */
  runsWhilePitching: number
  ADV: number; OCHW: number; HCHO: number
  /** Order he first took the mound for his side (0 = starter). */
  entryOrder: number
}

export type FieldingLine = {
  cardKey: string
  side: GameSide
  /** Positions played, in order (DEF 1, DEF 2, ...). */
  positions: DefensivePosition[]
  CS: number; SBa: number
  DBP: number; DBPa: number; TBP: number; TBPa: number
  OFA: number
}

export type TeamLine = {
  side: GameSide
  R: number; H: number; LOB: number
  DP: number; TP: number
  runsByInning: number[]
}

export type GameStats = {
  batting: Record<GameSide, BattingLine[]>
  pitching: Record<GameSide, PitchingLine[]>
  fielding: Record<GameSide, FieldingLine[]>
  team: Record<GameSide, TeamLine>
  /** Batting order slots: who batted in each, in order of entry. */
  lineupSlots: Record<GameSide, string[][]>
  plays: PlayRecord[]
}

const SIDES: GameSide[] = ['away', 'home']
const other = (side: GameSide): GameSide => (side === 'home' ? 'away' : 'home')
const HITS: BattingCredit[] = ['single', 'double', 'triple', 'home_run']
const CHART_OUTS = ['K', 'PU', 'FB', 'GB']

export function isHit(credit: BattingCredit | undefined): boolean {
  return credit !== undefined && HITS.includes(credit)
}

function blankBatting(cardKey: string, side: GameSide): BattingLine {
  return { cardKey, side, G: 0, PA: 0, AB: 0, R: 0, H: 0, '1B': 0, '2B': 0, '3B': 0, HR: 0, RBI: 0, SB: 0, CS: 0, BB: 0, SO: 0, OBA: 0, OCHO: 0, PCHW: 0, GIDP: 0, SAC: 0, SF: 0 }
}
function blankPitching(cardKey: string, side: GameSide, entryOrder: number): PitchingLine {
  return { cardKey, side, G: 1, GS: entryOrder === 0 ? 1 : 0, BF: 0, outs: 0, H: 0, '2B': 0, '3B': 0, HR: 0, BB: 0, SO: 0, R: 0, ER: 0, runsWhilePitching: 0, ADV: 0, OCHW: 0, HCHO: 0, entryOrder }
}
function blankFielding(cardKey: string, side: GameSide): FieldingLine {
  return { cardKey, side, positions: [], CS: 0, SBa: 0, DBP: 0, DBPa: 0, TBP: 0, TBPa: 0, OFA: 0 }
}

/** True when the game has a trustworthy play-level record (created under rules v2 with a play log). */
export function hasPlayRecord(state: GameState): boolean {
  return Boolean(state.playLog?.start)
}

export function computeGameStats(state: GameState): GameStats {
  const log = state.playLog
  if (!log?.start) throw new Error('This game has no play-by-play record.')
  const plays = log.plays

  const batting: Record<GameSide, Map<string, BattingLine>> = { away: new Map(), home: new Map() }
  const pitching: Record<GameSide, Map<string, PitchingLine>> = { away: new Map(), home: new Map() }
  const fielding: Record<GameSide, Map<string, FieldingLine>> = { away: new Map(), home: new Map() }
  const slots: Record<GameSide, string[][]> = { away: [], home: [] }
  const team: Record<GameSide, TeamLine> = {
    away: { side: 'away', R: 0, H: 0, LOB: 0, DP: 0, TP: 0, runsByInning: [...(state.runsByInning?.away ?? [])] },
    home: { side: 'home', R: 0, H: 0, LOB: 0, DP: 0, TP: 0, runsByInning: [...(state.runsByInning?.home ?? [])] },
  }

  const bat = (side: GameSide, key: string) => {
    let line = batting[side].get(key)
    if (!line) { line = blankBatting(key, side); batting[side].set(key, line) }
    return line
  }
  const field = (side: GameSide, key: string) => {
    let line = fielding[side].get(key)
    if (!line) { line = blankFielding(key, side); fielding[side].set(key, line) }
    return line
  }
  const pitchEntries: Record<GameSide, number> = { away: 0, home: 0 }
  const pitch = (side: GameSide, key: string) => {
    let line = pitching[side].get(key)
    if (!line) { line = blankPitching(key, side, pitchEntries[side]++); pitching[side].set(key, line) }
    return line
  }
  const playPosition = (side: GameSide, key: string, position: DefensivePosition) => {
    if (position === 'DH') return
    const line = field(side, key)
    if (line.positions.at(-1) !== position) line.positions.push(position)
  }

  // Starting line-ups, alignments and pitchers.
  for (const side of SIDES) {
    const start = log.start[side]
    start.battingOrder.forEach((key, slot) => { slots[side][slot] = [key]; bat(side, key) })
    for (const [position, key] of Object.entries(start.alignment) as Array<[DefensivePosition, string]>) if (key) playPosition(side, key, position)
    if (start.startingPitcher) pitch(side, start.startingPitcher)
  }

  for (const play of plays) {
    const off = play.battingSide
    const def = other(off)

    if (play.kind === 'substitution' && play.substitution) {
      const sub = play.substitution
      const side = sub.side
      // The batting-order slot he holds after the move (double switches included).
      if (sub.battingSlot !== null && sub.battingSlot !== undefined) {
        const slot = (slots[side][sub.battingSlot] ??= [])
        if (slot.at(-1) !== sub.incomingKey) slot.push(sub.incomingKey)
      }
      bat(side, sub.incomingKey)
      if (sub.position) {
        playPosition(side, sub.incomingKey, sub.position as DefensivePosition)
        if (sub.position === 'P') pitch(side, sub.incomingKey)
      }
      continue
    }

    // Outs on any play belong to the pitcher on the mound.
    if (play.pitcherKey) {
      const outs = Math.max(0, play.outsAfter - play.outsBefore)
      pitch(def, play.pitcherKey).outs += outs
    }

    for (const run of play.runs) {
      if (!run.counted) continue
      bat(off, run.cardKey).R++
      team[off].R++
      if (run.responsiblePitcherKey) {
        const charged = pitch(def, run.responsiblePitcherKey)
        charged.R++
        charged.ER++
      }
      if (run.pitcherOnMoundKey) pitch(def, run.pitcherOnMoundKey).runsWhilePitching++
    }

    for (const steal of play.steals) {
      const runner = bat(off, steal.runnerKey)
      if (steal.success) runner.SB++
      else runner.CS++
      if (steal.catcherKey) {
        const catcher = field(def, steal.catcherKey)
        if (steal.success) catcher.SBa++
        else catcher.CS++
      }
    }

    for (const attempt of play.defense) {
      for (const key of attempt.fielderKeys) {
        const line = field(def, key)
        if (attempt.kind === 'double_play') {
          line.DBPa++
          if (attempt.outsOnPlay >= 2) line.DBP++
        } else {
          line.TBPa++
          if (attempt.outsOnPlay >= 3) line.TBP++
        }
      }
      if (attempt.outsOnPlay === 2) team[def].DP++
      if (attempt.outsOnPlay >= 3) team[def].TP++
    }
    for (const key of play.outfieldAssists) field(def, key).OFA++

    if (play.leftOnBase !== undefined) team[off].LOB += play.leftOnBase

    if (play.kind !== 'plate_appearance' || !play.batting || !play.batterKey) continue
    const b = play.batting
    const batter = bat(off, play.batterKey)
    const pitcher = play.pitcherKey ? pitch(def, play.pitcherKey) : null
    batter.PA++
    if (pitcher) pitcher.BF++
    const credit = b.credit
    const walk = credit === 'walk' || credit === 'intentional_walk'
    if (walk) { batter.BB++; if (pitcher) pitcher.BB++ }
    else if (credit === 'sacrifice_bunt') batter.SAC++
    else if (credit === 'sacrifice_fly') batter.SF++
    else batter.AB++
    if (credit === 'strikeout') { batter.SO++; if (pitcher) pitcher.SO++ }
    if (isHit(credit)) {
      batter.H++
      team[off].H++
      if (pitcher) pitcher.H++
      if (credit === 'single') batter['1B']++
      if (credit === 'double') { batter['2B']++; if (pitcher) pitcher['2B']++ }
      if (credit === 'triple') { batter['3B']++; if (pitcher) pitcher['3B']++ }
      if (credit === 'home_run') { batter.HR++; if (pitcher) pitcher.HR++ }
    }
    batter.RBI += b.rbi
    if (b.gidp) batter.GIDP++

    // Showdown categories: only for a completed chart swing.
    if (credit === 'intentional_walk') { if (pitcher) pitcher.OCHW++ }
    else if (b.chartResult && b.advantage) {
      const hitOrWalk = isHit(credit) || credit === 'walk'
      const chartOut = !hitOrWalk && CHART_OUTS.includes(b.chartResult)
      if (b.advantage === 'hitter') {
        batter.OBA++
        if (chartOut) { batter.OCHO++; if (pitcher) pitcher.HCHO++ }
      } else {
        if (pitcher) pitcher.ADV++
        if (hitOrWalk) { batter.PCHW++; if (pitcher) pitcher.OCHW++ }
      }
    }
  }

  for (const side of SIDES) for (const line of batting[side].values()) line.G = line.PA > 0 ? 1 : 0

  const orderedBatting = (side: GameSide): BattingLine[] => {
    const seen = new Set<string>()
    const out: BattingLine[] = []
    for (const slot of slots[side]) for (const key of slot) if (!seen.has(key)) { seen.add(key); out.push(batting[side].get(key)!) }
    for (const line of batting[side].values()) if (!seen.has(line.cardKey) && (line.PA || line.R || line.SB || line.CS)) out.push(line)
    return out
  }

  return {
    batting: { away: orderedBatting('away'), home: orderedBatting('home') },
    pitching: {
      away: [...pitching.away.values()].sort((a, b) => a.entryOrder - b.entryOrder),
      home: [...pitching.home.values()].sort((a, b) => a.entryOrder - b.entryOrder),
    },
    fielding: { away: [...fielding.away.values()], home: [...fielding.home.values()] },
    team,
    lineupSlots: slots,
    plays,
  }
}

/** Innings-pitched display from integer outs: 6.0 / 6.1 / 6.2 (box score). */
export function inningsDisplay(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

/** A rate, or "—" for a zero denominator (STATS_SPEC §3). */
export function rate(numerator: number, denominator: number, digits = 3, leadingZero = false): string {
  if (!denominator) return '—'
  const value = (numerator / denominator).toFixed(digits)
  return leadingZero ? value : value.replace(/^0(?=\.)/, '')
}

export function era(earnedRuns: number, outs: number): string {
  return outs ? ((earnedRuns * 27) / outs).toFixed(2) : '—'
}
