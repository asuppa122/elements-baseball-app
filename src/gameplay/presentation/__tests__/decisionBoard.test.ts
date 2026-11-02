import { describe, expect, it } from 'vitest'
import { dependencyLabel, isBlockedByDependency } from '../DecisionBoard'
import type { DecisionOption } from '../../decisionEngine'

// The dependency rule the board renders: a trailing runner cannot advance
// unless the runner ahead does. decisionEngine exposes this structurally via
// requiresOptionId so presentation never has to parse the detail sentence.

const lead: DecisionOption = { id: 'R2::2B->HOME', label: 'Lead: 2B → Home', detail: 'BSR 19' }
const trail: DecisionOption = { id: 'R1::1B->2B', label: 'Trail: 1B → 2B', detail: 'BSR 16', requiresOptionId: 'R2::2B->HOME' }

describe('isBlockedByDependency', () => {
  it('blocks a dependent option while its prerequisite is unselected', () => {
    expect(isBlockedByDependency(trail, [])).toBe(true)
  })

  it('releases it the moment the prerequisite is selected', () => {
    expect(isBlockedByDependency(trail, ['R2::2B->HOME'])).toBe(false)
  })

  it('never blocks an option that has no prerequisite', () => {
    expect(isBlockedByDependency(lead, [])).toBe(false)
    expect(isBlockedByDependency(lead, ['R1::1B->2B'])).toBe(false)
  })

  it('selecting an unrelated option does not release the dependency', () => {
    expect(isBlockedByDependency(trail, ['SOMETHING_ELSE'])).toBe(true)
  })
})

describe('dependencyLabel', () => {
  it('names the option that must be selected first, so the reason is concrete', () => {
    expect(dependencyLabel(trail, [lead, trail])).toBe('Lead: 2B → Home')
  })

  it('returns null when there is no dependency to explain', () => {
    expect(dependencyLabel(lead, [lead, trail])).toBeNull()
  })

  it('returns null rather than a broken label when the prerequisite is absent from the list', () => {
    expect(dependencyLabel(trail, [trail])).toBeNull()
  })
})

describe('the defence\'s outfielder choice names the runner and his BsR as the throw faces it', () => {
  it('Hines going home with two out: BsR 14 reads 20 (+3 extra base, +3 two out)', async () => {
    const { getDecisionView } = await import('../../decisionEngine')
    const midgame = (await import('../../sandbox/states/midgame.json')).default as unknown as import('../../types').GameState
    const state = structuredClone(midgame)
    state.outs = 2
    state.pendingDecision = {
      id: 'test', decisionType: 'OUTFIELD_SELECTION', actingSide: state.half === 'top' ? 'home' : 'away', legalActions: ['SELECT_OUTFIELDER'],
      context: { kind: 'EXTRA_BASE', target: { runner: { cardKey: 'X', playerName: 'John Hines', baserunning: 14, stolenBase: 10 }, from: '2B', to: 'HOME' } },
    } as unknown as typeof state.pendingDecision
    expect(getDecisionView(state)?.description).toContain('Throw on John Hines going home: BsR 20 (14 +3 extra base, +3 two out)')
  })
})
