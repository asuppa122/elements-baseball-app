import { describe, expect, it } from 'vitest'
import { buildPostGameSummary, formatInningsPitched, pitchingLinesFor, restProjectionFor } from '../postGameSummary'
import { resolveCoreResult } from '../coreGame'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'
import type { GameState } from '../types'

// Tier one of the post-game box score: what a finished game can report from
// state it already holds. Anything not tracked must come back absent or
// explicitly flagged -- never estimated into something that looks real.

const base = (): GameState => structuredClone(buildNonGbCoverageFixture()) as GameState

describe('formatInningsPitched', () => {
  it('uses baseball notation, where .2 means two outs and not two-thirds', () => {
    expect(formatInningsPitched(0)).toBe('0.0')
    expect(formatInningsPitched(20)).toBe('6.2')
    expect(formatInningsPitched(27)).toBe('9.0')
    expect(formatInningsPitched(28)).toBe('9.1')
  })
})

describe('pitchingLinesFor', () => {
  it('gives a starter who was never relieved the whole game', () => {
    const s: GameState = { ...base(), inning: 9, half: 'bottom', outs: 3,
      pitcherAppearanceCardKeys: { away: ['AWAY-8'], home: ['HOME-8'] } }
    const [home] = pitchingLinesFor(s, 'home')
    expect(home.inningsPitched).toBe('9.0')
    expect(home.order).toBe(0)
    expect(home.finished).toBe(true)
  })

  it('splits the game at the relief entry, not evenly', () => {
    const s: GameState = { ...base(), inning: 9, half: 'top', outs: 2,
      pitcherAppearanceCardKeys: { away: [], home: ['HOME-8', 'HOME-7'] },
      // reliever entered with 20 outs recorded; starter therefore threw 6.2
      pitcherEntryDefenseOuts: { 'home::HOME-7': 20 },
      pitcherRunsAllowed: { 'home::HOME-8': 4, 'home::HOME-7': 1 } }
    const [starter, reliever] = pitchingLinesFor(s, 'home')
    expect(starter.inningsPitched).toBe('6.2')
    expect(starter.runsAllowed).toBe(4)
    expect(starter.finished).toBe(false)
    expect(reliever.inningsPitched).toBe('2.0') // 20 -> 26 outs, top of the 9th with two away
    expect(reliever.runsAllowed).toBe(1)
    expect(reliever.finished).toBe(true)
    // the two lines must account for every out the side recorded, with none double-counted
    expect(starter.outsRecorded + reliever.outsRecorded).toBe(26)
  })

  it('reads real printed ratings off the roster snapshot rather than inventing them', () => {
    const s: GameState = { ...base(), pitcherAppearanceCardKeys: { away: [], home: ['HOME-8'] } }
    const card = s.pregame.home.roster!.cards['HOME-8']
    const [line] = pitchingLinesFor(s, 'home')
    expect(line.printedControl).toBe(card.pitcher.control)
    expect(line.printedIp).toBe(card.pitcher.ip)
    expect(line.playerName).toBe(card.playerName)
  })

  it('is empty rather than guessing when no pitcher appearance was ever recorded', () => {
    expect(pitchingLinesFor(base(), 'home')).toEqual([])
  })
})

describe('restProjectionFor', () => {
  it('withholds the projection when the season game count is unknown', () => {
    // The milestone step needs it, and a wrong rest number is worse than none.
    const r = restProjectionFor(base(), 'home', null)
    expect(r.available).toBe(false)
    expect(r).toMatchObject({ reason: 'MISSING_SEASON_GAME_COUNT' })
  })

  it('charges printed Ftg to a player who appeared and rests one off for the game', () => {
    const s = base()
    s.hitterPlateAppearanceCardKeys = { away: [], home: ['HOME-0'] }
    s.pitcherAppearanceCardKeys = { away: [], home: [] }
    s.restState = { away: {}, home: { 'HOME-0': { hitterGamesRemaining: 0, pitcherGamesRemaining: 0 } } }
    const r = restProjectionFor(s, 'home', 1)
    if (!r.available) throw new Error('expected a projection')
    const p = r.players.find((x) => x.cardKey === 'HOME-0')!
    const ftg = s.pregame.home.roster!.cards['HOME-0'].hitter.fatigue ?? 0
    expect(p.hitterAppeared).toBe(true)
    expect(p.hitterGamesRemaining).toBe(Math.max(0, ftg - 1))
  })

  it('still ticks down a player who sat but was already carrying rest debt', () => {
    const s = base()
    s.hitterPlateAppearanceCardKeys = { away: [], home: [] }
    s.pitcherAppearanceCardKeys = { away: [], home: [] }
    s.restState = { away: {}, home: { 'HOME-3': { hitterGamesRemaining: 3, pitcherGamesRemaining: 0 } } }
    const r = restProjectionFor(s, 'home', 1)
    if (!r.available) throw new Error('expected a projection')
    const p = r.players.find((x) => x.cardKey === 'HOME-3')!
    expect(p.hitterAppeared).toBe(false)
    expect(p.priorHitterGamesRemaining).toBe(3)
    expect(p.hitterGamesRemaining).toBe(2) // omitting him would read as "nothing moved"
  })

  it('applies the season milestone as an extra day off at the threshold game', () => {
    const s = base()
    s.hitterPlateAppearanceCardKeys = { away: [], home: [] }
    s.pitcherAppearanceCardKeys = { away: [], home: [] }
    s.restState = { away: {}, home: { 'HOME-3': { hitterGamesRemaining: 4, pitcherGamesRemaining: 0 } } }
    const milestone = s.configuration.restMilestones[0]
    const at = restProjectionFor(s, 'home', milestone.gamesPlayed)
    const before = restProjectionFor(s, 'home', milestone.gamesPlayed - 1)
    if (!at.available || !before.available) throw new Error('expected projections')
    expect(before.players[0].hitterGamesRemaining - at.players[0].hitterGamesRemaining).toBe(milestone.bonusRestDays)
  })
})

describe('buildPostGameSummary through the real engine', () => {
  it('reports a walk-off from a game actually played to that state', () => {
    let s = base()
    s = { ...s, inning: 9, half: 'bottom', outs: 1, score: { away: 2, home: 2 },
      runsByInning: { away: [1,0,0,0,0,0,0,1,0], home: [0,0,2,0,0,0,0,0,0] },
      bases: { first: null, second: null, third: null },
      // home bats in the bottom half, so the batter has to be a home card
      plateAppearance: { ...base().plateAppearance, batterCardKey: 'HOME-0', pitcherCardKey: 'AWAY-8' } }
    s = resolveCoreResult(s, 'HR') // real engine scores the run and ends it

    const summary = buildPostGameSummary(s)
    expect(summary.complete).toBe(true)
    expect(summary.final).toMatchObject({ away: 2, home: 3, winner: 'home', walkoff: true, inningsPlayed: 9 })
    expect(summary.lineScore.recorded).toBe(true)
    expect(summary.lineScore.home[8]).toBe(1)
    // the line score must reconcile with the final, or one of them is lying
    expect(summary.lineScore.home.reduce((a, b) => a + b, 0)).toBe(summary.final.home)
    expect(summary.lineScore.away.reduce((a, b) => a + b, 0)).toBe(summary.final.away)
  })

  it('does not call a regulation home win a walk-off', () => {
    const s: GameState = { ...base(), status: 'complete', inning: 9, half: 'bottom', outs: 3,
      score: { away: 1, home: 4 }, runsByInning: { away: [1,0,0,0,0,0,0,0,0], home: [0,4,0,0,0,0,0,0,0] } }
    expect(buildPostGameSummary(s).final.walkoff).toBe(false)
  })

  it('flags a pre-runsByInning game as unrecorded so it renders dashes, not zeroes', () => {
    // All 14 lab games persisted before the field existed. A row of zeroes here
    // would be indistinguishable from a real scoreless line.
    const s = base()
    delete s.runsByInning
    const summary = buildPostGameSummary({ ...s, status: 'complete', score: { away: 3, home: 5 } })
    expect(summary.lineScore.recorded).toBe(false)
    expect(summary.final.home).toBe(5)
    // and the zeroed innings must NOT reconcile -- proving they are not data
    expect(summary.lineScore.home.reduce((a, b) => a + b, 0)).not.toBe(summary.final.home)
  })

  it('carries no batting lines at all, because none are tracked', () => {
    const summary = buildPostGameSummary(base())
    expect(Object.keys(summary)).not.toContain('batting')
    expect(JSON.stringify(summary)).not.toMatch(/rbi|RBI|atBats/)
  })

  it('reports appearances as the real recorded lists', () => {
    const s = base()
    s.hitterPlateAppearanceCardKeys = { away: ['AWAY-0', 'AWAY-1'], home: [] }
    s.pitcherAppearanceCardKeys = { away: [], home: ['HOME-8'] }
    const summary = buildPostGameSummary(s)
    expect(summary.appearances.away.hitters).toEqual(['AWAY-0', 'AWAY-1'])
    expect(summary.appearances.home.pitchers).toEqual(['HOME-8'])
  })
})

describe('appearancesRecorded', () => {
  it('separates "nobody pitched" from "this game never recorded who did"', () => {
    // As of 2026-08-28 every persisted game is the second case: the appearance
    // fields postdate all of them, so an empty pitching list is not evidence.
    const legacy = base()
    delete legacy.pitcherAppearanceCardKeys
    delete legacy.hitterPlateAppearanceCardKeys
    expect(buildPostGameSummary(legacy).appearancesRecorded).toBe(false)

    const tracked: GameState = { ...base(), pitcherAppearanceCardKeys: { away: [], home: [] } }
    expect(buildPostGameSummary(tracked).appearancesRecorded).toBe(true)
    // both still produce an empty list -- the flag is the only thing telling them apart
    expect(buildPostGameSummary(legacy).pitching.home).toEqual(buildPostGameSummary(tracked).pitching.home)
  })
})

describe('legacy configuration snapshots', () => {
  it('does not crash when the frozen config predates restMilestones', () => {
    // Found against real data: every persisted game's configuration snapshot
    // lacks the field, and passing the undefined into applyGameCompletionRest
    // threw "restMilestones is not iterable", taking down the whole panel.
    const s = base()
    delete (s.configuration as { restMilestones?: unknown }).restMilestones
    expect(() => buildPostGameSummary(s, { away: 5, home: 5 })).not.toThrow()
    const r = buildPostGameSummary(s, { away: 5, home: 5 }).rest.home
    expect(r.available).toBe(false)
    expect(r).toMatchObject({ reason: 'MISSING_REST_MILESTONES' })
  })

  it('keeps the two unavailable reasons distinct', () => {
    // "we don't know your season game count" and "this game never froze the
    // rule" are different facts and read differently on the surface.
    const withConfig = restProjectionFor(base(), 'home', null)
    expect(withConfig).toMatchObject({ reason: 'MISSING_SEASON_GAME_COUNT' })
  })
})

describe('rest ordering', () => {
  it('leads with whoever is still owed rest, since that is what the manager must act on', () => {
    const s = base()
    s.hitterPlateAppearanceCardKeys = { away: [], home: [] }
    s.pitcherAppearanceCardKeys = { away: [], home: [] }
    s.restState = { away: {}, home: {
      'HOME-0': { hitterGamesRemaining: 1, pitcherGamesRemaining: 0 },
      'HOME-1': { hitterGamesRemaining: 4, pitcherGamesRemaining: 0 },
      'HOME-2': { hitterGamesRemaining: 2, pitcherGamesRemaining: 0 },
    } }
    const r = restProjectionFor(s, 'home', 1)
    if (!r.available) throw new Error('expected a projection')
    const owed = r.players.map((p) => Math.max(p.hitterGamesRemaining, p.pitcherGamesRemaining))
    expect(owed).toEqual([...owed].sort((a, b) => b - a))
    expect(r.players[0].cardKey).toBe('HOME-1') // deepest in rest debt, not first in the roster
  })
})
