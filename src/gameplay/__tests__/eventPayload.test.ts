import { describe, expect, it } from 'vitest'
import { buildEventEnvelope, envelopeScoredRuns } from '../eventPayload'
import { deriveScoringPlays } from '../halfInningTransition'
import { resolveCoreResult } from '../coreGame'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'
import type { GameState } from '../types'

const base = (): GameState => structuredClone(buildNonGbCoverageFixture()) as GameState

describe('buildEventEnvelope', () => {
  it('records where the play started and where it ended', () => {
    const before: GameState = { ...base(), inning: 5, half: 'top', outs: 1, score: { away: 2, home: 3 } }
    const after: GameState = { ...before, outs: 2, score: { away: 4, home: 3 }, inning: 5, half: 'top' }
    const e = buildEventEnvelope(before, after)
    expect(e).toMatchObject({
      inning: 5, half: 'top', outs: 1, score: { away: 2, home: 3 },
      resultingOuts: 2, resultingScore: { away: 4, home: 3 },
      nextInning: 5, nextHalf: 'top', gameStatus: before.status,
    })
  })

  it('names the batter and pitcher from the frozen roster, not the card key', () => {
    const s = base()
    const e = buildEventEnvelope(s, s)
    expect(e.batter).toBe(s.pregame.away.roster!.cards['AWAY-0'].playerName)
    expect(e.pitcher).toBe(s.pregame.home.roster!.cards['HOME-8'].playerName)
  })

  it('takes the batter from whichever side is actually batting', () => {
    const bottom: GameState = { ...base(), half: 'bottom',
      plateAppearance: { ...base().plateAppearance, batterCardKey: 'HOME-0', pitcherCardKey: 'AWAY-8' } }
    const e = buildEventEnvelope(bottom, bottom)
    expect(e.batter).toBe(bottom.pregame.home.roster!.cards['HOME-0'].playerName)
    expect(e.pitcher).toBe(bottom.pregame.away.roster!.cards['AWAY-8'].playerName)
  })

  it('snapshots bases rather than aliasing live state', () => {
    const before = base()
    const after = base()
    const e = buildEventEnvelope(before, after)
    after.bases.first = { cardKey: 'X', playerName: 'X', baserunning: 10, stolenBase: 10 } as never
    expect((e.resultingBases as { first: unknown }).first).toBeNull()
  })

  it('falls back to the card key when a card is missing rather than dropping the name', () => {
    const s = base()
    const e = buildEventEnvelope(
      { ...s, plateAppearance: { ...s.plateAppearance, batterCardKey: 'GHOST' } }, s)
    expect(e.batter).toBe('GHOST')
  })

  it('reports no batter when there is none, instead of inventing one', () => {
    const s = base()
    const e = buildEventEnvelope({ ...s, plateAppearance: { ...s.plateAppearance, batterCardKey: null } }, s)
    expect(e.batter).toBeNull()
  })
})

describe('envelopeScoredRuns', () => {
  it('is true only when a side actually gained runs', () => {
    const s = base()
    expect(envelopeScoredRuns(s, s)).toBe(false)
    expect(envelopeScoredRuns(s, { ...s, score: { away: 1, home: 0 } })).toBe(true)
    expect(envelopeScoredRuns(s, { ...s, score: { away: 0, home: 2 } })).toBe(true)
  })
})

describe('the envelope closes the gap it was written for', () => {
  it('makes a swing-scored run recoverable end to end', () => {
    let s = base()
    s = { ...s, inning: 3, half: 'top', outs: 0, score: { away: 0, home: 0 },
      runsByInning: { away: [], home: [] }, bases: { first: null, second: null, third: null } }
    const after = resolveCoreResult(s, 'HR')
    const plays = deriveScoringPlays([{ state_version: 1, payload: buildEventEnvelope(s, after) }]).plays
    expect(plays).toHaveLength(1)
    expect(plays[0]).toMatchObject({ inning: 3, half: 'top', side: 'away', runs: 1 })
    expect(plays[0].batter).toBe(s.pregame.away.roster!.cards['AWAY-0'].playerName)
  })

  it('makes a run scored WITHOUT a swing recoverable too, which was the real gap', () => {
    // Runs credited by a manager decision carried no score in any payload --
    // 0 of 40 DECISION_RESOLVED events on the one game with rich payloads. The
    // envelope is attached at the shared persist chokepoint, so a decision that
    // scores is now just another before/after diff.
    const before: GameState = { ...base(), inning: 7, half: 'bottom', score: { away: 1, home: 1 } }
    const after: GameState = { ...before, score: { away: 1, home: 3 } }
    const plays = deriveScoringPlays([{ state_version: 9, payload: buildEventEnvelope(before, after) }]).plays
    expect(plays).toHaveLength(1)
    expect(plays[0]).toMatchObject({ side: 'home', runs: 2, inning: 7, half: 'bottom' })
  })

  it('does not turn an ordinary out into a scoring play', () => {
    const s = base()
    expect(deriveScoringPlays([{ state_version: 1, payload: buildEventEnvelope(s, { ...s, outs: 1 }) }]).plays)
      .toEqual([])
  })
})

describe('backward compatibility with the 14 games persisted before this', () => {
  it('only ever adds keys — a caller can still override any of them', () => {
    // The shell spreads its own payload last, so an explicit key wins. That is
    // what keeps `roll`/`chartResult`/`playableShell` behaving as before.
    const s = base()
    const merged = { ...buildEventEnvelope(s, s), chartResult: 'HR', playableShell: true }
    expect(merged.chartResult).toBe('HR')
    expect(merged.playableShell).toBe(true)
    expect(merged).toHaveProperty('resultingScore')
  })

  it('leaves old thin payloads readable exactly as they were', () => {
    // A pre-change shell event. It must still parse, still report unavailable,
    // and above all must not start looking like a scoring play.
    const legacyShell = { state_version: 4, payload: { roll: 12, chartResult: 'HR', playableShell: true } }
    const derived = deriveScoringPlays([legacyShell])
    expect(derived.available).toBe(false)
    expect(derived.plays).toEqual([])
  })

  it('reads a mix of old and new events without either corrupting the other', () => {
    const s: GameState = { ...base(), inning: 2, half: 'top', score: { away: 0, home: 0 } }
    const derived = deriveScoringPlays([
      { state_version: 1, payload: { roll: 3, chartResult: 'K', playableShell: true } },
      { state_version: 2, payload: buildEventEnvelope(s, { ...s, score: { away: 2, home: 0 } }) },
      { state_version: 3, payload: { roll: 9, playableShell: true } },
    ])
    expect(derived.available).toBe(true)
    expect(derived.plays).toHaveLength(1)
    expect(derived.plays[0].runs).toBe(2)
  })
})
