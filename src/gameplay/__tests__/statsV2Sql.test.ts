import { beforeAll, describe, expect, it } from 'vitest'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'
import { createGameplayDevDb, DEV_USERS, MIGRATIONS_WITH_PENDING, type DevDb } from '../devDb'
import { startPlayLog } from '../playLog'
import { pitcherRestAdjustmentsFor } from '../restRules'
import { applyGameCompletionRest } from '../restTracking'
import { sideToAct } from '../turnOrder'
import { runDecisionStressHarness } from '../testHarness'
import { buildOfficialPayload } from '../stats/officialPayload'
import type { GameSide, GameState, PitcherRestFacts } from '../types'

/**
 * The local 20261101 migration, run for real on PGlite on top of every applied
 * migration: the rules-v2 rest adjustments in the writer (with TypeScript
 * parity), the exhibition/official classification, the official statistics
 * writer's safeguards and idempotency, and the exhibition cleanup -- previewed,
 * refused without its confirmation, and never touching an official game.
 *
 * NOT applied to the live project. Nothing here touches it.
 */

const HOME = DEV_USERS.home
const AWAY = DEV_USERS.away
const PHRASE = 'Elements Baseball is officially live'

let dev: DevDb
let n = 0
const owner = <T>(sql: string, params: unknown[] = []) => dev.asOwner(async () => (await dev.db.query<T>(sql, params)).rows)
const rejects = (p: Promise<unknown>, pattern: RegExp) => expect(p).rejects.toThrow(pattern)
const restOf = async (userId: string, cardKey: string) =>
  (await owner<{ pitcher_games_remaining: number; last_pitcher_appearance_game_index: number | null }>(
    'select pitcher_games_remaining, last_pitcher_appearance_game_index from public.player_rest_state where user_id = $1 and card_key = $2', [userId, cardKey]))[0]

/** Fixture cards 9-11 get pitcher fatigue scores so the adjustments show. */
function withFatigue(s: GameState): GameState {
  for (const side of ['home', 'away'] as GameSide[]) {
    const cards = s.pregame[side].roster!.cards
    const prefix = side.toUpperCase()
    cards[`${prefix}-9`].pitcher.fatigue = 3
    cards[`${prefix}-10`].pitcher.fatigue = 2
    cards[`${prefix}-11`].pitcher.fatigue = 4
  }
  return s
}

async function midGame(rulesVersion?: number): Promise<GameState> {
  n += 1
  const s = withFatigue(buildNonGbCoverageFixture())
  s.gameId = `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  s.managers = { home: { userId: HOME, managerName: 'Anthony' }, away: { userId: AWAY, managerName: 'Will' } }
  s.configuration.seasonId = 'test-season'
  s.configuration.restMilestones = []
  s.turnHandshake = true
  s.restState = { home: {}, away: {} }
  if (rulesVersion) s.rulesVersion = rulesVersion
  await dev.endAll()
  await dev.createGame(HOME, s)
  return s
}

async function finish(s: GameState, completion: Partial<GameState>) {
  const side = sideToAct(s) as GameSide
  await dev.save(side === 'home' ? HOME : AWAY, {
    gameId: s.gameId, expectedStateVersion: s.stateVersion,
    nextState: { ...s, ...completion, status: 'complete', stateVersion: s.stateVersion + 1 }, eventType: 'DECISION_RESOLVED',
  })
}

const fact = (f: Partial<PitcherRestFacts>): PitcherRestFacts => ({ starter: false, battersFaced: 0, controlAtFirstPitch: 4, pitchedAtNegativeControl: false, outsRecorded: 0, ...f })

/** One finished official game's pitchers: [side, cardKey, facts, expected rest]. */
const CASES: Array<[GameSide, string, PitcherRestFacts, number, string]> = [
  ['home', 'HOME-9', fact({ battersFaced: 20, outsRecorded: 18, controlAtFirstPitch: 4, pitchedAtNegativeControl: true }), 5, 'relief beyond card IP +1, negative Control +1: 3 + 1 + 1'],
  ['home', 'HOME-10', fact({ battersFaced: 3, outsRecorded: 3 }), 1, 'efficiency -1 (BF 3 = outs 3); outs 3 is not beyond 1.0 IP: 2 - 1'],
  ['home', 'HOME-11', fact({ battersFaced: 3, outsRecorded: 2, controlAtFirstPitch: 0, pitchedAtNegativeControl: true }), 4, 'BF > outs: no efficiency; started at Control 0: no negative +1'],
  ['away', 'AWAY-9', fact({ battersFaced: 1, outsRecorded: 2 }), 2, 'efficiency with BF 1 < outs 2 (a double play): 3 - 1'],
  ['away', 'AWAY-11', fact({ battersFaced: 0, outsRecorded: 1 }), 0, 'zero-BF appearance: not a rest appearance (ruling 8), decays from 0'],
]

beforeAll(async () => { dev = await createGameplayDevDb(MIGRATIONS_WITH_PENDING) }, 120_000)

describe('before launch', () => {
  it('every game is an exhibition, and the official writer refuses one', async () => {
    const s = await midGame(2)
    expect((await owner<{ competition_class: string }>('select competition_class from public.games where id = $1', [s.gameId]))[0].competition_class).toBe('exhibition')
    await finish(s, {})
    await rejects(owner('select public.gameplay_write_official_stats($1, $2::jsonb)', [s.gameId, JSON.stringify({ final: s.score })]), /Exhibition games never write official statistics/)
    expect(await owner('select * from public.player_rest_state')).toEqual([])
  })

  it('no app user can call the official writer or write an official table', async () => {
    await rejects(dev.asOwner(async () => {
      await dev.db.exec(`set role authenticated; select set_config('test.uid', '${HOME}', false);`)
      await dev.db.query(`select public.gameplay_write_official_stats('60000000-0000-4000-8000-000000000001', '{}'::jsonb)`)
    }), /permission denied/)
    await rejects(dev.asOwner(async () => {
      await dev.db.exec(`set role authenticated; select set_config('test.uid', '${HOME}', false);`)
      await dev.db.query(`insert into public.official_game_results (game_id, season_id, home_user_id, away_user_id, home_runs, away_runs, winner_side, scoring_version) values ('60000000-0000-4000-8000-000000000001', 's', '${HOME}', '${AWAY}', 1, 0, 'home', 1)`)
    }), /permission denied|row-level security/)
  })
})

describe('after launch: the v2 rest adjustments in the server writer', () => {
  let game: GameState

  beforeAll(async () => {
    await owner(`select public.activate_official_tracking('${PHRASE}')`)
    game = await midGame(2)
    const facts: Record<string, PitcherRestFacts> = {}
    for (const [side, key, f] of CASES) facts[`${side}::${key}`] = f
    await finish(game, {
      pitcherRestFacts: facts,
      pitcherAppearanceCardKeys: { home: ['HOME-9', 'HOME-10', 'HOME-11'], away: ['AWAY-9'] },
    })
  })

  it('the game is official', async () => {
    expect((await owner<{ competition_class: string }>('select competition_class from public.games where id = $1', [game.gameId]))[0].competition_class).toBe('official')
  })

  it.each(CASES)('%s %s -> %i (%s)', async (side, key, _f, expected) => {
    const row = await restOf(side === 'home' ? HOME : AWAY, key)
    expect(row.pitcher_games_remaining).toBe(expected)
  })

  it.each(CASES)('TypeScript parity: %s %s', async (side, key, f) => {
    const state = { ...game, rulesVersion: 2, pitcherRestFacts: { [`${side}::${key}`]: f } } as GameState
    const appeared = !(side === 'away' && key === 'AWAY-11')
    const ts = applyGameCompletionRest({
      priorHitterGamesRemaining: 0, priorPitcherGamesRemaining: 0, hitterFatigueScore: null,
      pitcherFatigueScore: state.pregame[side].roster!.cards[key].pitcher.fatigue, hitterAppeared: false, pitcherAppeared: appeared,
      gmCompletedGamesThisSeason: 1, restMilestones: [],
      pitcherAdjustments: appeared ? pitcherRestAdjustmentsFor(state, side, key) : undefined,
    })
    expect(ts.pitcherGamesRemaining).toBe((await restOf(side === 'home' ? HOME : AWAY, key)).pitcher_games_remaining)
  })

  it('a rest appearance records the GM\'s game count for the back-to-back test', async () => {
    expect((await restOf(AWAY, 'AWAY-9')).last_pitcher_appearance_game_index).toBe(1)
    expect((await restOf(AWAY, 'AWAY-11')).last_pitcher_appearance_game_index).toBeNull()
  })

  it('back-to-back: the same efficient outing in the very next official game gets no efficiency reduction', async () => {
    const next = await midGame(2)
    await finish(next, {
      pitcherRestFacts: { 'away::AWAY-9': fact({ battersFaced: 3, outsRecorded: 3 }) },
      pitcherAppearanceCardKeys: { home: [], away: ['AWAY-9'] },
      restState: { home: {}, away: { 'AWAY-9': { hitterGamesRemaining: 0, pitcherGamesRemaining: 2 } } },
    })
    expect((await restOf(AWAY, 'AWAY-9')).pitcher_games_remaining).toBe(2 + 3)
  })

  it('a rules-v1 game keeps the v1 formula: no adjustments even with facts', async () => {
    const v1 = await midGame()
    await finish(v1, {
      pitcherRestFacts: { 'home::HOME-10': fact({ battersFaced: 3, outsRecorded: 3 }) },
      pitcherAppearanceCardKeys: { home: ['HOME-10'], away: [] },
    })
    // prior 1 (from the first game, not appeared in the second -> 0) ... recompute from the row before:
    const row = await restOf(HOME, 'HOME-10')
    expect(row.pitcher_games_remaining).toBe(0 + 2)
  })
})

describe('the official statistics writer', () => {
  let recorded: GameState

  beforeAll(async () => {
    // A whole rules-v2 game, played by the rules bot, recorded play by play.
    let finalState: GameState | null = null
    runDecisionStressHarness(startPlayLog({ ...buildNonGbCoverageFixture(), rulesVersion: 2 }), 7, 1, 500, (s) => { finalState = s; return [] })
    if (!finalState) throw new Error('The simulated game did not finish.')
    const done = finalState as GameState
    n += 1
    recorded = {
      ...done,
      gameId: `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      managers: { home: { userId: HOME, managerName: 'Anthony' }, away: { userId: AWAY, managerName: 'Will' } },
      configuration: { ...done.configuration, seasonId: 'test-season', restMilestones: [] },
      turnHandshake: true,
      restState: { home: {}, away: {} },
      plateAppearance: { ...done.plateAppearance, pitchRoll: null, swingRoll: null, offenseReady: true },
      pendingDecision: null,
      waitingFor: 'PITCH_ROLL',
      nextActor: done.half === 'top' ? 'home' : 'away',
    }
    await dev.endAll()
    // Saved mid-game, then finished through the real writer on the fielding manager's turn.
    await dev.createGame(HOME, { ...recorded, status: 'in_progress' })
    await finish({ ...recorded, status: 'in_progress' }, { waitingFor: 'GAME_COMPLETE', nextActor: null })
  }, 120_000)

  const write = (payload: unknown) => owner('select public.gameplay_write_official_stats($1, $2::jsonb) as counts', [recorded.gameId, JSON.stringify(payload)])

  it('is off until its own switch is turned on, even with tracking on', async () => {
    await rejects(write(buildOfficialPayload(recorded)), /writer is switched off/)
  })

  it('writes every line once the switch is on, and a second write replaces rather than adds', async () => {
    await owner('update public.gameplay_settings set official_stats_writer_enabled = true')
    const first = (await write(buildOfficialPayload(recorded)))[0]
    const second = (await write(buildOfficialPayload(recorded)))[0]
    expect(second).toEqual(first)
    const results = await owner<{ c: number }>('select count(*)::int c from public.official_game_results where game_id = $1', [recorded.gameId])
    expect(results[0].c).toBe(1)
    const runs = await owner<{ r: number }>('select coalesce(sum(r),0)::int r from public.official_batting_lines where game_id = $1', [recorded.gameId])
    expect(runs[0].r).toBe(recorded.score.home + recorded.score.away)
  })

  it('refuses a payload whose final score differs from the saved game', async () => {
    await rejects(write({ ...buildOfficialPayload(recorded), final: { home: 99, away: 0 } }), /do not match the saved final score/)
  })

  it('refuses a card that is not on that side\'s roster -- atomically: the earlier rows are untouched', async () => {
    const before = await owner<{ c: number }>('select count(*)::int c from public.official_batting_lines where game_id = $1', [recorded.gameId])
    const payload = buildOfficialPayload(recorded)
    payload.batting.home = [{ ...payload.batting.home[0], cardKey: 'NOT-ON-ROSTER' }]
    await rejects(write(payload), /not on the home roster/)
    expect(await owner<{ c: number }>('select count(*)::int c from public.official_batting_lines where game_id = $1', [recorded.gameId])).toEqual(before)
  })

  it('season totals never mix seasons', async () => {
    const other = await owner<{ c: number }>("select count(*)::int c from public.official_season_batting where season_id <> 'test-season'")
    expect(other).toEqual([{ c: 0 }])
  })

  it('season totals are sums of game lines', async () => {
    const season = await owner<{ r: number }>('select coalesce(sum(r),0)::int r from public.official_season_batting where season_id = $1', ['test-season'])
    expect(season[0].r).toBe(recorded.score.home + recorded.score.away)
  })
})

describe('exhibition cleanup (prepared, never run live)', () => {
  it('previews exactly what it would delete', async () => {
    const [preview] = await owner<{ exhibition_games: number; official_games_untouched: number }>('select * from public.gameplay_exhibition_cleanup_preview()')
    expect(Number(preview.exhibition_games)).toBeGreaterThan(0)
    expect(Number(preview.official_games_untouched)).toBeGreaterThan(0)
  })

  it('refuses without the exact phrase or with a stale count, and no app user can run it', async () => {
    const [preview] = await owner<{ exhibition_games: number }>('select * from public.gameplay_exhibition_cleanup_preview()')
    await rejects(owner(`select public.gameplay_exhibition_cleanup_execute('yes', $1)`, [preview.exhibition_games]), /Confirmation phrase/)
    await rejects(owner(`select public.gameplay_exhibition_cleanup_execute('Delete all exhibition games', $1)`, [Number(preview.exhibition_games) + 1]), /re-run the preview/)
    await rejects(dev.asOwner(async () => {
      await dev.db.exec(`set role authenticated; select set_config('test.uid', '${HOME}', false);`)
      await dev.db.query(`select * from public.gameplay_exhibition_cleanup_preview()`)
    }), /permission denied/)
  })

  it('deletes only exhibition games; official games, their statistics and rest state remain', async () => {
    const officialBefore = await owner<{ c: number }>(`select count(*)::int c from public.games where competition_class = 'official'`)
    const linesBefore = await owner<{ c: number }>('select count(*)::int c from public.official_batting_lines')
    const restBefore = await owner<{ c: number }>('select count(*)::int c from public.player_rest_state')
    const [preview] = await owner<{ exhibition_games: number }>('select * from public.gameplay_exhibition_cleanup_preview()')
    const deleted = await owner<{ n: number }>(`select public.gameplay_exhibition_cleanup_execute('Delete all exhibition games', $1) as n`, [preview.exhibition_games])
    expect(Number(deleted[0].n)).toBe(Number(preview.exhibition_games))
    expect(await owner<{ c: number }>(`select count(*)::int c from public.games where competition_class = 'exhibition'`)).toEqual([{ c: 0 }])
    expect(await owner<{ c: number }>(`select count(*)::int c from public.games where competition_class = 'official'`)).toEqual(officialBefore)
    expect(await owner<{ c: number }>('select count(*)::int c from public.official_batting_lines')).toEqual(linesBefore)
    expect(await owner<{ c: number }>('select count(*)::int c from public.player_rest_state')).toEqual(restBefore)
  })
})
