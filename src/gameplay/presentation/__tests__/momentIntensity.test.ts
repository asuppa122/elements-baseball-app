import { describe, expect, it } from 'vitest'
import { classifyMoment } from '../momentIntensity'
import { buildNonGbCoverageFixture } from '../../rulebookCoverage'
import type { BaseRunnerState, GameState } from '../../types'

const runner = (name: string): BaseRunnerState => ({ cardKey: name, playerName: name, baserunning: 14, stolenBase: 12 })
const base = (): GameState => structuredClone(buildNonGbCoverageFixture()) as GameState

const at = (over: Partial<GameState>): GameState => ({ ...base(), ...over })

describe('classifyMoment', () => {
  it('calls a quiet early inning routine', () => {
    const m = classifyMoment(at({ inning: 2, half: 'top', outs: 1, score: { away: 0, home: 6 } }))
    expect(m.tier).toBe('routine')
  })

  it('raises a one-run game to notable even early', () => {
    expect(classifyMoment(at({ inning: 2, half: 'top', score: { away: 3, home: 4 } })).tier).toBe('notable')
  })

  it('raises runners in scoring position to notable', () => {
    const s = at({ inning: 3, half: 'top', score: { away: 0, home: 5 } })
    s.bases.second = runner('R2')
    expect(classifyMoment(s).tier).toBe('notable')
    expect(classifyMoment(s).runnersInScoringPosition).toBe(1)
  })

  it('does not count a runner on first as scoring position', () => {
    const s = at({ inning: 3, half: 'top', score: { away: 0, home: 5 } })
    s.bases.first = runner('R1')
    expect(classifyMoment(s).runnersInScoringPosition).toBe(0)
    expect(classifyMoment(s).tier).toBe('routine')
  })

  it('raises a close late inning to high', () => {
    expect(classifyMoment(at({ inning: 8, half: 'top', score: { away: 2, home: 4 } })).tier).toBe('high')
  })

  it('leaves a late blowout below high', () => {
    const m = classifyMoment(at({ inning: 8, half: 'top', score: { away: 0, home: 11 } }))
    expect(m.tier).toBe('routine')
    expect(m.reasons).toContain('LATE_INNING')
  })

  it('reserves peak for a run that would actually end the game', () => {
    // Bottom 9, home down one, two out: a swing ends it.
    const s = at({ inning: 9, half: 'bottom', outs: 2, score: { away: 4, home: 3 } })
    const m = classifyMoment(s)
    expect(m.tier).toBe('peak')
    expect(m.reasons).toContain('WALK_OFF_CHANCE')
  })

  it('does not call the top of the ninth a walk-off chance', () => {
    const m = classifyMoment(at({ inning: 9, half: 'top', outs: 2, score: { away: 3, home: 4 } }))
    expect(m.reasons).not.toContain('WALK_OFF_CHANCE')
    expect(m.tier).not.toBe('peak')
  })

  it('does not call it a walk-off chance when the home side cannot reach with one swing', () => {
    // Home down five with the bases empty -- no single swing ends this.
    const m = classifyMoment(at({ inning: 9, half: 'bottom', outs: 1, score: { away: 8, home: 3 } }))
    expect(m.reasons).not.toContain('WALK_OFF_CHANCE')
  })

  it('counts runners when deciding whether one swing can end it', () => {
    // Home down three, bases loaded: a grand slam ends it.
    const s = at({ inning: 9, half: 'bottom', outs: 2, score: { away: 6, home: 3 } })
    s.bases.first = runner('A'); s.bases.second = runner('B'); s.bases.third = runner('C')
    expect(classifyMoment(s).reasons).toContain('WALK_OFF_CHANCE')
    expect(classifyMoment(s).tier).toBe('peak')
  })

  it('treats extra innings as ninth-or-later', () => {
    const m = classifyMoment(at({ inning: 12, half: 'bottom', outs: 2, score: { away: 5, home: 5 } }))
    expect(m.tier).toBe('peak')
  })

  it('never reports a live moment for a finished game', () => {
    const s = at({ inning: 9, half: 'bottom', outs: 2, score: { away: 4, home: 3 }, status: 'complete' })
    const m = classifyMoment(s)
    expect(m.tier).toBe('routine')
    expect(m.reasons).toEqual(['GAME_COMPLETE'])
  })
})
