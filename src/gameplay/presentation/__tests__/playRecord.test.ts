import { describe, expect, it } from 'vitest'
import { buildNonGbCoverageFixture } from '../../rulebookCoverage'
import { beginPrePitchDecision, confirmManagerDecision, getPrePitchActions, resolveDecisionRoll } from '../../decisionEngine'
import { decisionRollView, describePlay } from '../playRecord'
import type { BaseRunnerState, GameState, PendingDecision } from '../../types'

// The scenarios from the first live game's feedback (2026-10-30). Before/after
// states are either driven through the real resolvers or are the exact shape
// the engine leaves; the assertion is always on what the text claims.

function game(): GameState {
  const s = buildNonGbCoverageFixture()
  const away = s.pregame.away.roster!.cards
  away['AWAY-0'].playerName = 'David Wright'
  away['AWAY-1'].playerName = 'Jose Reyes'
  away['AWAY-2'].playerName = 'Carlos Beltran'
  s.pregame.home.roster!.cards['HOME-0'].playerName = 'Yadier Molina'
  s.managers.away.managerName = 'Will'
  s.managers.home.managerName = 'Anthony'
  s.inning = 5; s.half = 'top'; s.outs = 0
  s.plateAppearance.batterCardKey = 'AWAY-0'
  return s
}
const runner = (key: string, name: string, sb = 14): BaseRunnerState => ({ cardKey: key, playerName: name, baserunning: 14, stolenBase: sb })
const reyes = runner('AWAY-1', 'Jose Reyes', 18)
const wright = runner('AWAY-0', 'David Wright')
function pending(s: GameState, type: string, context: Record<string, unknown>): GameState {
  const d: PendingDecision = { id: 't', ruleCondition: 'RC5_CONDITIONAL_GAME_STATE', decisionType: type, actingSide: 'home', legalActions: [], context, createdAt: '' }
  return { ...s, status: 'awaiting_decision', waitingFor: 'CONDITIONAL_DECISION', pendingDecision: d }
}

describe('describePlay', () => {
  it('a single that scores the runner from second says who scored and the score', () => {
    const before = game(); before.bases.second = reyes
    const after = structuredClone(before)
    after.bases = { first: wright, second: null, third: null }
    after.score.away = 1
    const p = describePlay(before, after, '1B')
    expect(p.lines).toEqual([
      'David Wright singles.',
      'Jose Reyes scores from second.',
      'Will scores a run — Will 1, Anthony 0.',
    ])
    expect(p.kind).toBe('scoring')
  })

  it('a ground-ball double play names the force and the batter, and counts the outs', () => {
    const before = game(); before.bases.first = reyes
    const after = structuredClone(before)
    after.bases = { first: null, second: null, third: null }; after.outs = 2
    expect(describePlay(before, after, 'GB').lines).toEqual([
      'David Wright grounds into a double play.',
      'Jose Reyes is forced out at second.',
      'David Wright is retired at first.',
      'Two outs on the play.',
    ])
  })

  it('a successful sacrifice bunt through the real resolver', () => {
    let s = game(); s.bases.first = reyes
    s = pending(s, 'SAC_BUNT_RTS', {})
    // find a roll the Rulebook table calls a success
    for (let r = 1; r <= 20; r++) {
      const after = resolveDecisionRoll(s, r)
      if (after.outs === 1 && after.bases.second?.cardKey === 'AWAY-1') {
        expect(describePlay(s, after).lines).toEqual([
          'David Wright lays down a successful sacrifice bunt.',
          'Jose Reyes goes to second.',
          'David Wright is retired at first.',
        ])
        return
      }
    }
    throw new Error('No sacrifice-success roll found')
  })

  it('a stolen base, and a caught stealing that names the catcher', () => {
    const s = game(); s.bases.first = reyes
    const att = { runner: reyes, from: '1B', to: '2B' }
    const roll = pending(s, 'CATCHER_FIELDING_ROLL', { attempts: [att], target: att, kind: 'NATURAL_STEAL' })
    expect(describePlay(roll, resolveDecisionRoll(roll, 1)).lines).toEqual(['Jose Reyes steals second.'])
    expect(describePlay(roll, resolveDecisionRoll(roll, 20)).lines).toEqual(['Jose Reyes tries to steal second and is thrown out by Yadier Molina.'])
  })

  it('a steal of home shows the +15 in the roll view and says when it decided the play', () => {
    const s = game(); s.bases.third = reyes
    const att = { runner: reyes, from: '3B', to: 'HOME' }
    const roll = pending(s, 'CATCHER_FIELDING_ROLL', { attempts: [att], target: att, kind: 'NATURAL_STEAL' })
    // catcher DEF +1; SB 18: a 5 is 21 with the bonus (out), 6 without (safe)
    const after = resolveDecisionRoll(roll, 5)
    const play = describePlay(roll, after)
    expect(play.lines[0]).toBe('Jose Reyes tries to steal home and is thrown out by Yadier Molina.')
    const view = decisionRollView(roll, 5, play)
    expect(view.modifiers).toContainEqual({ label: 'Steal-home bonus', value: 15 })
    expect(view.total).toBe(21)
    expect(view.versus).toEqual({ label: 'Jose Reyes SB', value: 18 })
    expect(view.decisive).toContain('Steal-home bonus')
    expect(view.result.startsWith('Out')).toBe(true)
  })

  it('a sacrifice fly: the fly out, then the tag-up throw', () => {
    const before = game(); before.bases.third = reyes
    const fly = structuredClone(before)
    expect(describePlay(before, { ...fly, outs: 1 }, 'FB').lines).toEqual(['David Wright flies out.'])
    const tagBefore = { ...structuredClone(before), outs: 1 as const }
    const att = { runner: reyes, from: '3B', to: 'HOME' }
    const roll = pending(tagBefore, 'OUTFIELD_FIELDING_ROLL', { attempts: [att], target: att, outfielder: 'CF', kind: 'TAG_UP' })
    const safe = resolveDecisionRoll(roll, 1)
    const lines = describePlay(roll, safe).lines
    expect(lines[0]).toMatch(/^Jose Reyes tags and scores, beating the throw home from CF .+\.$/)
    expect(lines).toContain('Will scores a run — Will 1, Anthony 0.')
  })

  it('a third out says the inning is over without guessing who was stranded', () => {
    const before = game(); before.outs = 2; before.bases.first = reyes
    const after = structuredClone(before)
    after.half = 'bottom'; after.outs = 0; after.bases = { first: null, second: null, third: null }
    expect(describePlay(before, after, 'K').lines).toEqual(['David Wright strikes out.', 'That ends the inning.'])
  })

  it('a ground ball that opens the defence\'s choice says nothing about outs yet', () => {
    const before = game(); before.bases.first = reyes
    const after = pending(structuredClone(before), 'GROUND_BALL_RESOLUTION', { preBases: structuredClone(before.bases) })
    expect(describePlay(before, after, 'GB').lines).toEqual(['David Wright hits a ground ball.'])
  })

  it('a plain ground out is said once', () => {
    const before = game()
    const after = structuredClone(before); after.outs = 1
    expect(describePlay(before, after, 'GB').lines).toEqual(['David Wright grounds out.'])
  })

  it('a swap that ends the DH says so', () => {
    let s = game()
    s.hitterPlateAppearanceCardKeys = { away: ['AWAY-0'], home: [] }
    s.pregame.home.roster!.useDh = true
    const order = s.pregame.home.battingOrderCardKeys
    order[order.indexOf('HOME-8')] = 'HOME-9'
    s.pregame.home.defensiveAlignment.DH = 'HOME-9'
    s = beginPrePitchDecision(s, 'POSITION_SWAP')
    s = confirmManagerDecision(s, ['LF::HOME-5'])
    const mid = s
    s = confirmManagerDecision(s, ['LF'])
    expect(describePlay(mid, s).lines).toContain('The DH is over: home fixture 9 leaves the game and home fixture 8 bats in his spot.')
  })

  it('says nothing about runners who did not move', () => {
    const before = game(); before.bases.second = reyes
    const after = structuredClone(before); after.outs = 1
    expect(describePlay(before, after, 'PU').lines).toEqual(['David Wright pops out.'])
  })

  it('a fielder-to-pitcher swap reads as moves, not entries', () => {
    let s = game(); s.half = 'top'
    s.hitterPlateAppearanceCardKeys = { away: ['AWAY-0'], home: [] }
    expect(getPrePitchActions(s).some((a) => a.id === 'POSITION_SWAP')).toBe(true)
    const before = s
    s = beginPrePitchDecision(s, 'POSITION_SWAP')
    s = confirmManagerDecision(s, ['LF::HOME-5'])
    const mid = s
    s = confirmManagerDecision(s, ['LF'])
    const lines = describePlay(mid, s).lines
    expect(lines).toContain('home fixture 5 moves from LF to pitch.')
    expect(lines).toContain('home fixture 8 moves from the mound to LF.')
    expect(describePlay(before, before).lines).toEqual([])
  })
})

// The one line under the roll button. Same before/after states as the lines
// above, so it can only claim what actually changed.
describe('describePlay summary', () => {
  it('a run-scoring single names who scored', () => {
    const before = game(); before.bases.second = reyes
    const after = structuredClone(before)
    after.bases = { first: wright, second: null, third: null }; after.score.away = 1
    expect(describePlay(before, after, '1B').summary).toBe('Single — Reyes scores')
  })

  it('a strikeout gives the out count, and a third out says the inning is over', () => {
    const before = game()
    expect(describePlay(before, { ...structuredClone(before), outs: 1 }, 'K').summary).toBe('Strikeout — first out')
    const two = game(); two.outs = 2
    const over = structuredClone(two); over.half = 'bottom'; over.outs = 0
    expect(describePlay(two, over, 'K').summary).toBe('Strikeout — inning over')
  })

  it('a double play, a groundout, and a ground ball still waiting on the defence', () => {
    const before = game(); before.bases.first = reyes
    const dp = structuredClone(before); dp.bases.first = null; dp.outs = 2
    expect(describePlay(before, dp, 'GB').summary).toBe('Double play — outs at second and first, second out')
    const plain = game()
    expect(describePlay(plain, { ...structuredClone(plain), outs: 1 }, 'GB').summary).toBe('Groundout — first out')
    const open = pending(structuredClone(before), 'GROUND_BALL_RESOLUTION', { preBases: structuredClone(before.bases) })
    expect(describePlay(before, open, 'GB').summary).toBe('Ground ball')
  })

  it('a walk that moves the runner, and a bases-loaded double that clears them', () => {
    const before = game(); before.bases.first = reyes
    const walk = structuredClone(before); walk.bases = { first: wright, second: reyes, third: null }
    expect(describePlay(before, walk, 'BB').summary).toBe('Walk — Reyes to second')
    const loaded = game()
    loaded.bases = { first: runner('AWAY-1', 'Jose Reyes'), second: runner('AWAY-2', 'Carlos Beltran'), third: runner('AWAY-3', 'Mike Piazza') }
    const cleared = structuredClone(loaded); cleared.bases = { first: null, second: wright, third: null }; cleared.score.away = 3
    expect(describePlay(loaded, cleared, '2B').summary).toBe('Double — 3 runs score')
  })

  it('a steal and a caught stealing lead with the runner', () => {
    const s = game(); s.bases.first = reyes
    const att = { runner: reyes, from: '1B', to: '2B' }
    const roll = pending(s, 'CATCHER_FIELDING_ROLL', { attempts: [att], target: att, kind: 'NATURAL_STEAL' })
    expect(describePlay(roll, resolveDecisionRoll(roll, 1)).summary).toBe('Reyes steals second')
    expect(describePlay(roll, resolveDecisionRoll(roll, 20)).summary).toBe('Reyes caught stealing second — first out')
  })
})

describe('describePlay summary after a ground-ball decision', () => {
  it('leads with the play, not the first runner who moved', () => {
    const before = pending(game(), 'GB_SINGULAR_RFO', {})
    before.outs = 1
    before.bases = { first: runner('AWAY-1', 'Jose Reyes'), second: runner('AWAY-2', 'Carlos Beltran'), third: runner('AWAY-3', 'Mike Piazza') }
    const after = structuredClone(before)
    after.pendingDecision = null; after.status = 'in_progress'
    after.bases = { first: null, second: runner('AWAY-1', 'Jose Reyes'), third: runner('AWAY-2', 'Carlos Beltran') }
    after.outs = 2; after.score.away = 1
    expect(describePlay(before, after).summary).toBe('Groundout — Piazza scores, runners advance, second out')
  })

  it("a second check that retires the batter is a double play; a batter safe with a force is a fielder's choice", () => {
    const before = pending(game(), 'GB_STANDARD_SECOND_CHECK', {})
    before.outs = 1
    const dp = structuredClone(before); dp.pendingDecision = null; dp.half = 'bottom'; dp.outs = 0
    expect(describePlay(before, dp).summary).toBe('Double play — inning over')
    const fc0 = pending(game(), 'GB_STANDARD_SECOND_CHECK', {})
    const fc = structuredClone(fc0); fc.pendingDecision = null; fc.outs = 1; fc.bases.first = wright
    expect(describePlay(fc0, fc).summary).toBe("Fielder's choice — first out")
  })

  it("says where a fielder's choice or force was made: the runner out at the next base", () => {
    const before = pending(game(), 'GB_SINGULAR_RFO', {})
    before.bases = { first: runner('AWAY-1', 'Jose Reyes'), second: runner('AWAY-2', 'Carlos Beltran'), third: null }
    const atSecond = structuredClone(before)
    atSecond.pendingDecision = null; atSecond.outs = 1
    atSecond.bases = { first: wright, second: null, third: runner('AWAY-2', 'Carlos Beltran') }
    expect(describePlay(before, atSecond).summary).toBe("Fielder's choice — out at second, Beltran to third, first out")
    const atThird = structuredClone(before)
    atThird.pendingDecision = null; atThird.outs = 1
    atThird.bases = { first: wright, second: runner('AWAY-1', 'Jose Reyes'), third: null }
    expect(describePlay(before, atThird).summary).toBe("Fielder's choice — out at third, Reyes to second, first out")
  })
})

describe('describePlay summary while a decision follows', () => {
  it('a fly out keeps its out count before the tag-up call', () => {
    const before = game(); before.bases.third = reyes
    const after = pending({ ...structuredClone(before), outs: 1 }, 'TAG_UP_DECISION', {})
    expect(describePlay(before, after, 'FB').summary).toBe('Fly out — first out')
  })
})

describe('describePlay summary: runs and advances together', () => {
  it('a single that scores one runner and moves another says both', () => {
    const before = game(); before.bases.second = reyes; before.bases.first = runner('AWAY-2', 'Carlos Beltran')
    const after = structuredClone(before)
    after.bases = { first: wright, second: null, third: runner('AWAY-2', 'Carlos Beltran') }; after.score.away = 1
    expect(describePlay(before, after, '1B').summary).toBe('Single — Reyes scores, Beltran to third')
  })
})

describe('the runner-on-2B roll to hold is announced either way', () => {
  it('1–10 the runner advances to third; 11–20 he holds at second -- and the hold is said, not left out', () => {
    const r2 = runner('AWAY-2', 'Carlos Beltran')
    const s = game(); s.outs = 1; s.bases.second = r2
    const roll = pending(s, 'GB_RUNNER_2B_RTH', { preBases: structuredClone(s.bases), outs: 1, result: 'GB' })
    const advanced = describePlay(roll, resolveDecisionRoll(roll, 5))
    expect(advanced.summary).toBe('Roll to hold — Beltran advances to third')
    const held = describePlay(roll, resolveDecisionRoll(roll, 15))
    expect(held.summary).toBe('Roll to hold — Beltran holds at second')
    expect(held.lines).toContain('Carlos Beltran holds at second.')
  })
})
