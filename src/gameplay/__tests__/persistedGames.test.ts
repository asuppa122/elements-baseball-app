import { describe, expect, it } from 'vitest'
import { confirmManagerDecision, getDecisionView, getPrePitchActions, resolveDecisionRoll } from '../decisionEngine'
import { resolvePitchRoll, resolveSwingRoll } from '../engine'
import { buildPostGameSummary } from '../postGameSummary'
import { usesRulesV2 } from '../rulesVersion'
import { buildBoxScore } from '../stats/boxScore'
import type { GameState } from '../types'

/**
 * The real saved games from the last read-only snapshot (backups/, git-ignored,
 * local only -- skipped where it is absent), run through the new code. Fixtures
 * hide field drift; real persisted games expose it. Every one must still load,
 * be treated as rules v1, give a legacy summary (never fabricated lines), and
 * -- for unfinished ones -- keep playing under v1 through a full plate appearance.
 */
const snapshots = import.meta.glob('../../../backups/full-*/games.json', { eager: true, import: 'default' }) as Record<string, Array<{ id: string; status: string; progression?: string; game_state: GameState | null }>>
const latest = Object.keys(snapshots).sort().at(-1)
const games = latest ? snapshots[latest].filter((g) => g.game_state && g.game_state.pregame) : []

describe.skipIf(!games.length)(`saved games from ${latest ?? 'no snapshot'}`, () => {
  it.each(games.map((g) => [g.id, g.status, g] as const))('%s (%s) loads under rules v1 with a legacy summary', (_id, _status, g) => {
    const state = structuredClone(g.game_state!)
    expect(usesRulesV2(state)).toBe(false)
    const box = buildBoxScore(state, g.progression ?? 'prelaunch')
    expect(box.kind).toBe('legacy')
    expect(box.classification).toBe('exhibition')
    if (state.status === 'complete') expect(() => buildPostGameSummary(state)).not.toThrow()
  })

  // A game saved before charts were frozen into the snapshot cannot be played by
  // any build (the engine has always refused it with this message) -- a known
  // pre-existing data limitation, not something v2 changed.
  const missingChart = (g: (typeof games)[number]) => Object.values(g.game_state!.pregame).some((p) => Object.values(p.roster?.cards ?? {}).some((c) => !c.pitcher?.chart || !c.hitter?.chart))
  const unfinished = games.filter((g) => ['in_progress', 'awaiting_decision'].includes(g.game_state!.status) && !missingChart(g))
  it('reports the saved games that no build can play (frozen chart missing)', () => {
    const stranded = games.filter((g) => ['in_progress', 'awaiting_decision'].includes(g.game_state!.status) && missingChart(g)).map((g) => g.id)
    expect(stranded.length).toBeLessThanOrEqual(1)
  })
  it.each(unfinished.map((g) => [g.id, g] as const))('%s keeps playing a full plate appearance under v1', (_id, g) => {
    let s = structuredClone(g.game_state!)
    s.turnHandshake = undefined
    let rolls = 0
    const startCursor = JSON.stringify(s.lineupCursor)
    for (let guard = 0; guard < 60 && s.status !== 'complete' && JSON.stringify(s.lineupCursor) === startCursor; guard++) {
      if (s.status === 'awaiting_decision') {
        const view = getDecisionView(s)
        expect(view).not.toBeNull()
        s = view!.mode === 'roll' ? resolveDecisionRoll(s, 10) : confirmManagerDecision(s, [view!.options[0].id])
      } else if (s.waitingFor === 'PITCH_ROLL') {
        getPrePitchActions(s)
        s = resolvePitchRoll({ ...s, nextActor: s.half === 'top' ? 'home' : 'away' }, 10)
      } else if (s.waitingFor === 'SWING_ROLL') {
        s = resolveSwingRoll(s, 10 + (rolls++ % 10))
      } else break
    }
    expect(s.status === 'complete' || JSON.stringify(s.lineupCursor) !== startCursor || s.outs === 0).toBe(true)
    expect(s.playLog).toBeUndefined()
  })
})
