import { describe, expect, it } from 'vitest'
import { buildHalfInningTransition, deriveScoringPlays, previousHalf } from '../halfInningTransition'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'
import type { GameState } from '../types'

const base = (): GameState => structuredClone(buildNonGbCoverageFixture()) as GameState

const event = (v: number, payload: Record<string, unknown>) => ({ state_version: v, payload })

/** The real walk-off recovered from game 65efe77d's event log. */
const REAL_WALKOFF = event(200, {
  half: 'bottom', outs: 2, inning: 9, batter: 'Harry Kenyon', pitcher: 'Charles Heywood',
  chartResult: '1B+', score: { away: 0, home: 0 }, resultingScore: { away: 0, home: 1 },
})

describe('previousHalf', () => {
  it('walks back through the game', () => {
    expect(previousHalf(5, 'bottom')).toEqual({ inning: 5, half: 'top' })
    expect(previousHalf(5, 'top')).toEqual({ inning: 4, half: 'bottom' })
  })
  it('has nothing before the first pitch of the game', () => {
    expect(previousHalf(1, 'top')).toBeNull()
  })
})

describe('deriveScoringPlays', () => {
  it('recovers a real scoring play from a real event payload', () => {
    const { plays, available } = deriveScoringPlays([REAL_WALKOFF])
    expect(available).toBe(true)
    expect(plays).toHaveLength(1)
    expect(plays[0]).toMatchObject({
      inning: 9, half: 'bottom', side: 'home', batter: 'Harry Kenyon',
      pitcher: 'Charles Heywood', chartResult: '1B+', runs: 1, outsBefore: 2,
    })
  })

  it('ignores events that did not change the score', () => {
    const plays = deriveScoringPlays([
      event(1, { half: 'top', inning: 1, score: { away: 0, home: 0 }, resultingScore: { away: 0, home: 0 } }),
      REAL_WALKOFF,
    ]).plays
    expect(plays).toHaveLength(1)
  })

  it('credits runs to the batting side, not whichever total moved', () => {
    const { plays } = deriveScoringPlays([event(1, {
      half: 'top', inning: 3, score: { away: 1, home: 4 }, resultingScore: { away: 4, home: 4 },
    })])
    expect(plays[0]).toMatchObject({ side: 'away', runs: 3 })
  })

  it('reports unavailable for a playable-shell game rather than "no runs scored"', () => {
    // The shell writes {roll, chartResult, playableShell} and nothing else, so
    // there is no score to diff. Four of the real games are entirely like this.
    const { plays, available } = deriveScoringPlays([
      event(1, { roll: 14, chartResult: 'HR', playableShell: true }),
      event(2, { roll: 3, chartResult: 'K', playableShell: true }),
    ])
    expect(available).toBe(false)
    expect(plays).toEqual([])
  })

  it('skips a score-bearing event that cannot say which half it belongs to', () => {
    const { plays, available } = deriveScoringPlays([
      event(1, { score: { away: 0, home: 0 }, resultingScore: { away: 1, home: 0 } }),
    ])
    expect(available).toBe(true) // the payload did carry a score
    expect(plays).toEqual([])    // but it is not attributable to a half
  })
})

describe('buildHalfInningTransition', () => {
  const scoringState = (): GameState => ({
    ...base(), inning: 10, half: 'top', score: { away: 2, home: 3 },
    runsByInning: { away: [0, 0, 2, 0, 0, 0, 0, 0, 0], home: [1, 0, 0, 0, 0, 0, 0, 0, 2] },
  })

  it('scales a scoreless half down to the announcement and the filled column', () => {
    const t = buildHalfInningTransition(scoringState(), [], { inning: 2, half: 'top' })
    expect(t.tier).toBe('SCORELESS')
    expect(t.runs).toBe(0)
    expect(t.scoringPlays.plays).toEqual([])
    expect(t.filledColumn).toBe(1)
  })

  it('scales a scoring half up, and reports it complete when it reconciles', () => {
    const events = [event(50, {
      half: 'top', inning: 3, outs: 1, batter: 'Otto Briggs', chartResult: '2B',
      score: { away: 0, home: 1 }, resultingScore: { away: 2, home: 1 },
    })]
    const t = buildHalfInningTransition(scoringState(), events, { inning: 3, half: 'top' })
    expect(t.tier).toBe('SCORING')
    expect(t.runs).toBe(2)
    expect(t.scoringPlays.plays).toHaveLength(1)
    expect(t.scoringPlays.complete).toBe(true)
  })

  it('marks the list partial when the events do not account for every run', () => {
    // A run scored by a manager decision carries no score in its payload, so
    // the derived list is genuinely short. It must not read as the summary.
    const events = [event(50, {
      half: 'top', inning: 3, batter: 'Otto Briggs', chartResult: '1B',
      score: { away: 0, home: 1 }, resultingScore: { away: 1, home: 1 },
    })]
    const t = buildHalfInningTransition(scoringState(), events, { inning: 3, half: 'top' })
    expect(t.runs).toBe(2)                        // the inning recorded two
    expect(t.scoringPlays.plays).toHaveLength(1)  // the log accounts for one
    expect(t.scoringPlays.complete).toBe(false)
  })

  it('cannot claim completeness on a game with no per-inning record', () => {
    const s = base()
    delete s.runsByInning
    const t = buildHalfInningTransition({ ...s, inning: 9, half: 'bottom' }, [REAL_WALKOFF], { inning: 9, half: 'bottom' })
    expect(t.tier).toBe('UNKNOWN')
    expect(t.runs).toBeNull()
    expect(t.lineScore.recorded).toBe(false)
    expect(t.scoringPlays.plays).toHaveLength(1) // still shows what it can prove
    expect(t.scoringPlays.complete).toBe(false)  // but never claims it is whole
  })

  it('separates this half from the rest of the game, newest first', () => {
    const events = [
      event(10, { half: 'top', inning: 1, batter: 'First', chartResult: 'HR', score: { away: 0, home: 0 }, resultingScore: { away: 1, home: 0 } }),
      event(30, { half: 'bottom', inning: 2, batter: 'Second', chartResult: 'HR', score: { away: 1, home: 0 }, resultingScore: { away: 1, home: 1 } }),
      event(90, { half: 'bottom', inning: 9, batter: 'Later', chartResult: 'HR', score: { away: 1, home: 1 }, resultingScore: { away: 1, home: 3 } }),
      event(50, { half: 'top', inning: 3, batter: 'ThisHalf', chartResult: '2B', score: { away: 1, home: 1 }, resultingScore: { away: 2, home: 1 } }),
    ]
    const t = buildHalfInningTransition(scoringState(), events, { inning: 3, half: 'top' })
    expect(t.scoringPlays.plays.map((p) => p.batter)).toEqual(['ThisHalf'])
    // newest first, and 'Later' is excluded because it has not happened yet
    expect(t.earlierScoringPlays.map((p) => p.batter)).toEqual(['Second', 'First'])
  })

  it('shows the line score it was given and flags an unrecorded one', () => {
    const t = buildHalfInningTransition(scoringState(), [], { inning: 3, half: 'top' })
    expect(t.lineScore.recorded).toBe(true)
    expect(t.lineScore.away[2]).toBe(2)
    expect(t.lineScore.away.reduce((a, b) => a + b, 0)).toBe(t.score.away)
  })

  it('knows the half that ended the game', () => {
    const ended = { ...scoringState(), status: 'complete' as const, inning: 9, half: 'bottom' as const }
    expect(buildHalfInningTransition(ended, [], { inning: 9, half: 'bottom' }).gameComplete).toBe(true)
  })

  it('does not let an earlier half of a finished game claim it ended the game', () => {
    // Status alone is true for every half once the game is over, which made
    // "That ends it" the headline on a 4th-inning card.
    const ended = { ...scoringState(), status: 'complete' as const, inning: 9, half: 'bottom' as const }
    expect(buildHalfInningTransition(ended, [], { inning: 4, half: 'top' }).gameComplete).toBe(false)
    expect(buildHalfInningTransition(ended, [], { inning: 9, half: 'top' }).gameComplete).toBe(false)
  })
})

describe('"scoring so far" means so far', () => {
  it('excludes plays from later halves when an earlier half is reviewed', () => {
    const s: GameState = { ...base(), inning: 9, half: 'bottom', status: 'complete',
      runsByInning: { away: [0,0,0,0,0,0,0,0,0], home: [0,0,0,0,0,0,0,0,1] } }
    const events = [
      event(10, { half: 'top', inning: 1, batter: 'First', chartResult: 'HR', score: { away: 0, home: 0 }, resultingScore: { away: 1, home: 0 } }),
      event(90, { half: 'bottom', inning: 9, batter: 'Walkoff', chartResult: '1B+', score: { away: 1, home: 0 }, resultingScore: { away: 1, home: 1 } }),
    ]
    const t = buildHalfInningTransition(s, events, { inning: 4, half: 'top' })
    expect(t.earlierScoringPlays.map((p) => p.batter)).toEqual(['First'])
  })

  it('still includes the other half of the same inning when it came first', () => {
    const s: GameState = { ...base(), inning: 6, half: 'top',
      runsByInning: { away: [0,0,0,0,0,0], home: [0,0,0,0,1,0] } }
    const events = [event(40, { half: 'top', inning: 5, batter: 'TopFive', chartResult: 'HR', score: { away: 0, home: 0 }, resultingScore: { away: 1, home: 0 } })]
    const t = buildHalfInningTransition(s, events, { inning: 5, half: 'bottom' })
    expect(t.earlierScoringPlays.map((p) => p.batter)).toEqual(['TopFive'])
  })
})
