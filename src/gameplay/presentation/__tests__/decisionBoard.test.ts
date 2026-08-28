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
