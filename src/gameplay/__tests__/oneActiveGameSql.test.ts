import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'
import { attachPregameRoster, createInitialGameState, lockPregame, resolvePitchRoll, setPregameSelections, startGame } from '../engine'
import { beginPrePitchDecision, confirmManagerDecision, getDecisionView } from '../decisionEngine'
import { createGameplayDevDb, DEV_USERS, MIGRATIONS, type DevDb } from '../devDb'
import type { GameSide, GameState } from '../types'
import oneActiveGame from '../../../supabase/migrations/20261031_gameplay_one_active_game.sql?raw'
import preview from '../../../supabase/data-fixes/20261031_one_active_game_preview.sql?raw'
import rollbackSql from '../../../supabase/rollbacks/20261031_gameplay_one_active_game_rollback.sql?raw'

/**
 * Stage 3, run for real: 20261031_gameplay_one_active_game.sql on a Postgres
 * (PGlite) with every earlier gameplay migration under it.
 *
 * What PGlite cannot do is hold two connections, so two requests cannot be
 * made to overlap here. What is proved instead is that nothing but the
 * registry's primary key is relied on: every path that skips the server
 * function's friendly pre-check (a direct insert as the database owner, a
 * second insert in the same transaction) is still refused by it, and a
 * refusal leaves nothing behind. Postgres's own unique-index locking is what
 * turns that into a guarantee for concurrent requests -- the second waits for
 * the first to commit, then fails.
 */

const HOME = DEV_USERS.home // Anthony: may create test games and end games without a result
const AWAY = DEV_USERS.away // Will: may create test games, may not end games
const OUTSIDER = DEV_USERS.outsider // no gameplay access
const CARL = '00000000-0000-4000-8000-000000000004'
const DANA = '00000000-0000-4000-8000-000000000005'

let dev: DevDb
let counter = 0

async function addTester(db: DevDb, id: string, name: string) {
  await db.asOwner(() => db.db.exec(`
    insert into auth.users values ('${id}') on conflict do nothing;
    insert into public.profiles values ('${id}', '${name}', null) on conflict do nothing;
    insert into public.gameplay_feature_access (user_id, access_mode) values ('${id}', 'sandbox') on conflict do nothing;
  `))
}

/** A brand-new game as the lab page builds one: pregame, home roster attached. */
function newGame(home: string, away: string, twoPlayer = true): GameState {
  counter += 1
  const fixture = buildNonGbCoverageFixture()
  const s = createInitialGameState({
    gameId: `30000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    configuration: { ...fixture.configuration, seasonId: 'test-season' },
    homeManager: { userId: home, managerName: 'Home' },
    awayManager: { userId: away, managerName: 'Away' },
  })
  if (twoPlayer) s.turnHandshake = true
  return attachPregameRoster(s, 'home', fixture.pregame.home.roster!)
}

const rejects = (p: Promise<unknown>, pattern: RegExp) => expect(p).rejects.toThrow(pattern)
const registry = async () => (await dev.asOwner(() => dev.db.query<{ user_id: string; game_id: string; side: string }>(
  'select user_id, game_id, side from public.gameplay_active_games order by user_id'))).rows
const gameRow = async (id: string) => (await dev.asOwner(() => dev.db.query<Record<string, unknown>>(
  'select * from public.games where id = $1', [id]))).rows[0]
const restRows = async () => (await dev.asOwner(() => dev.db.query('select * from public.player_rest_state order by user_id, card_key'))).rows
async function ownerInsert(s: GameState) {
  await dev.asOwner(() => dev.db.query(
    `insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state, state_version)
     values ($1, 'test-season', 1925, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
    [s.gameId, s.status, s.managers.home.userId, s.managers.away.userId, JSON.stringify(s.configuration), JSON.stringify(s), s.stateVersion]))
}

/** Plays a two-player game from creation to the first pitch roll, through the real writer. */
async function playToFirstPitch(home: string, away: string): Promise<GameState> {
  const fixture = buildNonGbCoverageFixture()
  const created = newGame(home, away)
  await dev.create(home, created)
  const id = created.gameId
  let state = (await dev.load(home, id)).game_state
  const step = async (user: string, next: GameState, event: string, payload: Record<string, unknown> = {}) => {
    await dev.save(user, { gameId: id, expectedStateVersion: state.stateVersion, nextState: next, eventType: event, eventPayload: payload })
    state = (await dev.load(home, id)).game_state
  }
  const pick = (side: GameSide) => ({
    startingPitcherCardKey: fixture.pregame[side].startingPitcherCardKey!,
    battingOrderCardKeys: fixture.pregame[side].battingOrderCardKeys,
    defensiveAlignment: fixture.pregame[side].defensiveAlignment,
    defaultBatterCardKeys: [],
  })
  await step(away, attachPregameRoster(state, 'away', fixture.pregame.away.roster!), 'PREGAME_SUBMITTED')
  await step(away, setPregameSelections(state, 'away', pick('away')), 'PREGAME_SUBMITTED')
  await step(away, lockPregame(state, 'away'), 'PREGAME_LOCKED')
  await step(home, setPregameSelections(state, 'home', pick('home')), 'PREGAME_SUBMITTED')
  await step(home, lockPregame(state, 'home'), 'PREGAME_LOCKED')
  await step(home, startGame(state), 'GAME_STARTED')
  return state
}

beforeAll(async () => {
  dev = await createGameplayDevDb()
  await addTester(dev, CARL, 'Carl')
  await addTester(dev, DANA, 'Dana')
}, 60_000)
beforeEach(async () => { await dev.endAll() })

describe('one active two-player game per manager', () => {
  it('registers both managers when a first two-player game is created', async () => {
    const g = newGame(HOME, AWAY)
    const saved = await dev.create(HOME, g)
    expect(saved.status).toBe('pregame')
    expect(await gameRow(g.gameId)).toMatchObject({ play_mode: 'two_player', progression: 'prelaunch' })
    expect(await registry()).toEqual([
      { user_id: HOME, game_id: g.gameId, side: 'home' },
      { user_id: AWAY, game_id: g.gameId, side: 'away' },
    ])
    expect(await dev.activeGame(HOME)).toMatchObject({ game_id: g.gameId, side: 'home', opponent_name: 'Will' })
    expect(await dev.activeGame(AWAY)).toMatchObject({ game_id: g.gameId, side: 'away', opponent_name: 'Anthony' })
    expect(await dev.activeGame(CARL)).toBeNull()
  })

  it('refuses a second game for a manager who is already active, as home', async () => {
    const first = newGame(HOME, AWAY)
    await dev.create(HOME, first)
    const second = newGame(HOME, CARL)
    await rejects(dev.create(HOME, second), /ACTIVE_GAME_HOME/)
    expect(await gameRow(second.gameId)).toBeUndefined()
    expect((await registry()).map((r) => r.game_id)).toEqual([first.gameId, first.gameId])
  })

  it('refuses to make a manager who is home in one game the away manager of another', async () => {
    await dev.create(HOME, newGame(HOME, AWAY))
    await rejects(dev.create(CARL, newGame(CARL, HOME)), /ACTIVE_GAME_AWAY/)
  })

  it('refuses to start a game as home while away in another', async () => {
    await dev.create(HOME, newGame(HOME, AWAY))
    await rejects(dev.create(AWAY, newGame(AWAY, CARL)), /ACTIVE_GAME_HOME/)
  })

  it('refuses to make a manager the away manager of two games', async () => {
    await dev.create(CARL, newGame(CARL, AWAY))
    await rejects(dev.create(DANA, newGame(DANA, AWAY)), /ACTIVE_GAME_AWAY/)
    await rejects(dev.create(HOME, newGame(HOME, AWAY)), /ACTIVE_GAME_AWAY/)
    // and the managers who were refused are still free
    expect(await dev.activeGame(DANA)).toBeNull()
    expect(await dev.activeGame(HOME)).toBeNull()
  })

  it('names the busy side: you, or the opponent you challenged', async () => {
    const busy = newGame(CARL, DANA)
    await dev.create(CARL, busy)
    await rejects(dev.create(HOME, newGame(HOME, CARL)), /ACTIVE_GAME_AWAY/)
    await dev.create(HOME, newGame(HOME, AWAY))
    await rejects(dev.create(HOME, newGame(HOME, DANA)), /ACTIVE_GAME_HOME/)
  })

  it('is enforced by the registry itself, not the server function: a direct insert as the database owner is refused', async () => {
    await dev.create(HOME, newGame(HOME, AWAY))
    const sneaky = newGame(HOME, CARL)
    await rejects(ownerInsert(sneaky), /ACTIVE_GAME_HOME/)
    expect(await gameRow(sneaky.gameId)).toBeUndefined()
  })

  it('refuses two games for one manager in a single transaction -- the second insert waits on and hits the same key a concurrent request would', async () => {
    const a = newGame(CARL, DANA), b = newGame(CARL, AWAY)
    const both = dev.asOwner(async () => {
      await dev.db.exec('begin')
      try {
        for (const s of [a, b]) {
          await dev.db.query(
            `insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state, state_version)
             values ($1, 'test-season', 1925, 'pregame', $2, $3, '{}'::jsonb, $4::jsonb, 1)`,
            [s.gameId, s.managers.home.userId, s.managers.away.userId, JSON.stringify(s)])
        }
        await dev.db.exec('commit')
      } catch (e) { await dev.db.exec('rollback'); throw e }
    })
    await rejects(both, /ACTIVE_GAME_HOME/)
    // the whole transaction rolled back: neither game, no registry rows
    expect(await gameRow(a.gameId)).toBeUndefined()
    expect(await registry()).toEqual([])
  })

  it('leaves no registry entry behind when a creation fails part-way (home registered, away busy)', async () => {
    await dev.create(CARL, newGame(CARL, AWAY))
    const s = newGame(DANA, AWAY)
    await rejects(ownerInsert(s), /ACTIVE_GAME_AWAY/) // Dana's row was written, then Will's failed
    expect(await dev.activeGame(DANA)).toBeNull()
    expect(await gameRow(s.gameId)).toBeUndefined()
  })

  it('refuses a browser insert outright -- there is no insert policy any more', async () => {
    const s = newGame(HOME, AWAY)
    await rejects(dev.asOwner(async () => {
      await dev.db.exec(`set role authenticated; select set_config('test.uid', '${HOME}', false);`)
      await dev.db.query(
        `insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state)
         values ($1, 'test-season', 1925, 'pregame', $2, $3, '{}'::jsonb, $4::jsonb)`, [s.gameId, HOME, AWAY, JSON.stringify(s)])
    }), /row-level security|permission denied/)
  })

  it('checks the creator and the opponent at creation', async () => {
    await rejects(dev.create(AWAY, newGame(HOME, AWAY)), /only create a game as its home manager/)
    await rejects(dev.create(HOME, newGame(HOME, HOME)), /other than yourself/)
    await rejects(dev.create(HOME, newGame(HOME, OUTSIDER)), /does not have gameplay access/)
    await rejects(dev.create(OUTSIDER, newGame(OUTSIDER, HOME)), /access is not enabled/)
    const started = { ...newGame(HOME, AWAY), status: 'in_progress' as const }
    await rejects(dev.create(HOME, started), /must start in pregame/)
    expect(await registry()).toEqual([])
  })

  it('lets a manager reopen their own active game', async () => {
    const g = newGame(HOME, AWAY)
    await dev.create(HOME, g)
    expect((await dev.load(HOME, g.gameId)).id).toBe(g.gameId)
    expect((await dev.load(AWAY, g.gameId)).id).toBe(g.gameId)
  })
})

describe('test games: exempt, and only as the database decides', () => {
  it('lets an approved tester create one-screen test games that block nobody', async () => {
    const t1 = newGame(HOME, AWAY, false), t2 = newGame(HOME, AWAY, false)
    await dev.create(HOME, t1)
    await dev.create(HOME, t2)
    expect(await gameRow(t1.gameId)).toMatchObject({ play_mode: 'one_screen', progression: 'prelaunch' })
    expect(await registry()).toEqual([])
    // and a real game alongside them is fine
    await dev.create(HOME, newGame(HOME, AWAY))
  })

  it('lets Will create test games, and refuses them from a manager without the tester permission', async () => {
    expect((await dev.create(AWAY, newGame(AWAY, HOME, false))).play_mode).toBe('one_screen')
    await rejects(dev.create(CARL, newGame(CARL, HOME, false)), /approved tester/)
  })

  it('ignores a forged play mode or progression: a two-player game inserted as one-screen and official is two-player, pre-launch, and counted', async () => {
    await dev.create(HOME, newGame(HOME, AWAY))
    const forged = newGame(HOME, CARL)
    await rejects(dev.asOwner(() => dev.db.query(
      `insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state, play_mode, progression)
       values ($1, 'test-season', 1925, 'pregame', $2, $3, '{}'::jsonb, $4::jsonb, 'one_screen', 'official')`,
      [forged.gameId, HOME, CARL, JSON.stringify(forged)])), /ACTIVE_GAME_HOME/)
  })

  it('never lets a game change type, by save or by direct write', async () => {
    const t = newGame(HOME, AWAY, false)
    await dev.create(HOME, t)
    const promoted = { ...t, turnHandshake: true, stateVersion: t.stateVersion + 1 }
    await rejects(dev.save(HOME, { gameId: t.gameId, expectedStateVersion: t.stateVersion, nextState: promoted, eventType: 'PREGAME_SUBMITTED' }), /play mode cannot change/)
    await rejects(dev.asOwner(() => dev.db.exec(`update public.games set play_mode = 'two_player' where id = '${t.gameId}'`)), /play mode cannot change/)
    const c = newGame(HOME, AWAY)
    await dev.create(HOME, c)
    await rejects(dev.asOwner(() => dev.db.exec(`update public.games set play_mode = 'one_screen' where id = '${c.gameId}'`)), /play mode cannot change/)
    await rejects(dev.asOwner(() => dev.db.exec(`update public.games set away_user_id = '${CARL}' where id = '${c.gameId}'`)), /managers cannot change/)
  })

  it('does not write persistent rest when a test game completes', async () => {
    const before = await restRows()
    const fixture = buildNonGbCoverageFixture()
    const t = { ...fixture, gameId: '30000000-0000-4000-8000-0000000000aa', turnHandshake: undefined,
      managers: { home: { userId: HOME, managerName: 'Anthony' }, away: { userId: AWAY, managerName: 'Will' } },
      configuration: { ...fixture.configuration, seasonId: 'test-season' }, restState: { home: {}, away: {} } } as GameState
    await ownerInsert(t)
    await dev.save(HOME, { gameId: t.gameId, expectedStateVersion: t.stateVersion, nextState: { ...t, status: 'complete', stateVersion: t.stateVersion + 1 }, eventType: 'DECISION_RESOLVED' })
    expect((await gameRow(t.gameId)).status).toBe('complete')
    expect(await restRows()).toEqual(before)
  })
})

describe('ending a game releases both managers', () => {
  it('completion releases both', async () => {
    const g = newGame(HOME, AWAY)
    await dev.create(HOME, g)
    await dev.asOwner(() => dev.db.exec(`update public.games set status = 'complete' where id = '${g.gameId}'`))
    expect(await registry()).toEqual([])
    await dev.create(HOME, newGame(HOME, AWAY))
  })

  it('either manager can cancel before the first pitch; both are released, both see it, nothing is scored', async () => {
    for (const canceller of [HOME, AWAY]) {
      await dev.endAll()
      const restBefore = await restRows()
      const g = newGame(HOME, AWAY)
      await dev.create(HOME, g)
      const cancelled = await dev.cancel(canceller, g.gameId)
      expect(cancelled.status).toBe('cancelled')
      expect(await registry()).toEqual([])
      for (const viewer of [HOME, AWAY]) {
        const row = await dev.load(viewer, g.gameId)
        expect(row.status).toBe('cancelled')
        expect(row.game_state.status).toBe('cancelled')
      }
      const row = await gameRow(g.gameId)
      expect(row).toMatchObject({ end_reason: 'cancelled_before_first_pitch', ended_by_user_id: canceller, completed_at: null })
      const events = await dev.events(HOME, g.gameId)
      expect(events.at(-1)).toMatchObject({ event_type: 'GAME_CANCELLED', actor_user_id: canceller })
      expect(await restRows()).toEqual(restBefore)
      // released: either can start again straight away
      await dev.create(canceller, newGame(canceller, canceller === HOME ? AWAY : HOME))
    }
  })

  it('allows cancelling a started game whose first pitch has not been rolled', async () => {
    const state = await playToFirstPitch(HOME, AWAY)
    expect(state.status).toBe('in_progress')
    expect((await dev.cancel(AWAY, state.gameId)).status).toBe('cancelled')
  })

  it('refuses to cancel once the first pitch has been rolled', async () => {
    const state = await playToFirstPitch(HOME, AWAY)
    const id = state.gameId
    const ready = await dev.load(HOME, id)
    // the offense readies up, then the server issues the pitch die
    const { declareOffenseReady } = await import('../engine')
    await dev.save(AWAY, { gameId: id, expectedStateVersion: ready.state_version, nextState: declareOffenseReady(ready.game_state), eventType: 'OFFENSE_READY' })
    const afterReady = await dev.load(HOME, id)
    expect((await dev.cancel(HOME, id)).status).toBe('cancelled') // still nothing rolled
    // a fresh game, rolled this time
    await dev.endAll()
    const s2 = await playToFirstPitch(HOME, AWAY)
    const r2 = await dev.load(HOME, s2.gameId)
    await dev.save(AWAY, { gameId: s2.gameId, expectedStateVersion: r2.state_version, nextState: declareOffenseReady(r2.game_state), eventType: 'OFFENSE_READY' })
    const r3 = await dev.load(HOME, s2.gameId)
    const roll = await dev.roll(HOME, s2.gameId, r3.state_version, 'pitch')
    await rejects(dev.cancel(AWAY, s2.gameId), /already begun/) // a die was issued
    await dev.save(HOME, { gameId: s2.gameId, expectedStateVersion: r3.state_version, nextState: resolvePitchRoll(r3.game_state, roll), eventType: 'PITCH_ROLLED', eventPayload: { roll } })
    await rejects(dev.cancel(HOME, s2.gameId), /already begun/)
    expect(afterReady.status).toBe('in_progress')
  })

  it('refuses to cancel after a leadoff intentional walk (the engine marks the first pitch thrown)', async () => {
    const state = await playToFirstPitch(HOME, AWAY)
    const id = state.gameId
    let row = await dev.load(HOME, id)
    const { declareOffenseReady } = await import('../engine')
    await dev.save(AWAY, { gameId: id, expectedStateVersion: row.state_version, nextState: declareOffenseReady(row.game_state), eventType: 'OFFENSE_READY' })
    row = await dev.load(HOME, id)
    const started = beginPrePitchDecision(row.game_state, 'INTENTIONAL_WALK')
    started.stateVersion = row.state_version + 1
    await dev.save(HOME, { gameId: id, expectedStateVersion: row.state_version, nextState: started, eventType: 'DECISION_RESOLVED', eventPayload: { resolutionKind: 'PRE_PITCH_ACTION_STARTED' } })
    row = await dev.load(HOME, id)
    const walked = confirmManagerDecision(row.game_state, [getDecisionView(row.game_state)!.options[0].id])
    walked.stateVersion = Math.max(walked.stateVersion, row.state_version + 1)
    await dev.save(HOME, { gameId: id, expectedStateVersion: row.state_version, nextState: walked, eventType: 'DECISION_RESOLVED', eventPayload: {} })
    row = await dev.load(HOME, id)
    expect(row.game_state.firstPitchThrown).toBe(true)
    await rejects(dev.cancel(AWAY, id), /already begun/)
  })

  it('refuses cancellation by anyone who is not a manager who can save the game', async () => {
    const g = newGame(HOME, AWAY)
    await dev.create(HOME, g)
    await rejects(dev.cancel(CARL, g.gameId), /not a manager/)
    await rejects(dev.cancel(OUTSIDER, g.gameId), /access is not enabled/)
    const t = newGame(HOME, AWAY, false)
    await dev.create(HOME, t)
    await rejects(dev.cancel(AWAY, t.gameId), /not a manager/) // a one-screen game's away manager is only a name
    expect((await dev.cancel(HOME, t.gameId)).status).toBe('cancelled')
  })

  it('an ended game takes no more moves and cannot be reopened or cancelled again', async () => {
    const g = newGame(HOME, AWAY)
    await dev.create(HOME, g)
    await dev.cancel(HOME, g.gameId)
    const row = await dev.load(HOME, g.gameId)
    await rejects(dev.cancel(AWAY, g.gameId), /already ended/)
    await rejects(dev.save(HOME, { gameId: g.gameId, expectedStateVersion: row.state_version, nextState: { ...row.game_state, status: 'pregame', stateVersion: row.state_version + 1 }, eventType: 'PREGAME_SUBMITTED' }), /has ended/)
    await rejects(dev.asOwner(() => dev.db.exec(`update public.games set status = 'pregame' where id = '${g.gameId}'`)), /cannot be reopened/)
  })

  it('a save cannot end a game without a result -- only the two functions can', async () => {
    const g = newGame(HOME, AWAY)
    await dev.create(HOME, g)
    const row = await dev.load(HOME, g.gameId)
    for (const status of ['cancelled', 'terminated'] as const) {
      await rejects(dev.save(HOME, { gameId: g.gameId, expectedStateVersion: row.state_version, nextState: { ...row.game_state, status, stateVersion: row.state_version + 1 }, eventType: 'PREGAME_SUBMITTED' }), /Use cancel_gameplay_game/)
    }
  })

  it('an authorized administrator can end a game in progress without a result, with a recorded reason -- a tester cannot', async () => {
    const state = await playToFirstPitch(CARL, DANA)
    const restBefore = await restRows()
    await rejects(dev.terminate(AWAY, state.gameId, 'Opponent stopped responding'), /authorized administrator/)
    await rejects(dev.terminate(CARL, state.gameId, 'Opponent stopped responding'), /authorized administrator/)
    await rejects(dev.terminate(HOME, state.gameId, '  '), /Give a reason/)
    const ended = await dev.terminate(HOME, state.gameId, 'Opponent stopped responding for a week')
    expect(ended.status).toBe('terminated')
    expect(await gameRow(state.gameId)).toMatchObject({ end_reason: 'admin_terminated', end_note: 'Opponent stopped responding for a week', ended_by_user_id: HOME, completed_at: null })
    const events = await dev.events(CARL, state.gameId)
    expect(events.at(-1)).toMatchObject({ event_type: 'GAME_TERMINATED', actor_user_id: HOME })
    expect(events.at(-1)!.payload).toMatchObject({ reason: 'admin_terminated', note: 'Opponent stopped responding for a week' })
    expect(await dev.activeGame(CARL)).toBeNull()
    expect(await dev.activeGame(DANA)).toBeNull()
    expect(await restRows()).toEqual(restBefore)
    await rejects(dev.terminate(HOME, state.gameId, 'again, twice'), /already ended/)
  })
})

describe('the migration on existing data', () => {
  const LISTED = [
    'd7a84ae8-8702-485c-8b99-60503b6ca7d8', '9faac0a3-9a67-4b0e-9b40-b53028e99c5d', 'a96cc687-4f0e-4d8e-b8b7-961a09e3499c',
    '7c0dd0a3-41f2-41a7-a07f-ce92c1a2057e', '6883c8ea-4ed3-4bd3-a597-c72da823f845', 'adba4077-3b9e-445d-9a68-cafd54e71b70',
    '794058a4-806f-410e-8ad4-464e915c52f4', 'a3c8f3a2-a172-4102-8058-79063140623f', 'bee9a8b1-beed-4352-b7c1-774ae2bce27d',
    '9edee9f1-b3f2-4157-bf36-df4544456d2f', 'a906e567-a2c0-4048-8e3a-e5cedfb08d51', '6a1b94ed-40bf-45de-a2fb-31b30b214f4a',
    '1ed608fb-febb-4c4c-8129-c57751ae9708', '0c37ba41-42a4-41e8-9f12-605398d7d6ec',
  ]
  const LATER = '40000000-0000-4000-8000-000000000001' // created after the inventory
  const DONE = '40000000-0000-4000-8000-000000000002'

  /** The live database just before this migration: every earlier migration, the inventory's games. */
  async function before(extra: (db: DevDb) => Promise<void> = async () => {}): Promise<DevDb> {
    const db = await createGameplayDevDb(MIGRATIONS.slice(0, -1))
    const fixture = buildNonGbCoverageFixture()
    const state = (id: string, status: string, twoPlayer: boolean, home: string = HOME, away: string = AWAY) => ({
      ...fixture, gameId: id, status, turnHandshake: twoPlayer ? true : undefined,
      managers: { home: { userId: home, managerName: 'H' }, away: { userId: away, managerName: 'A' } },
    })
    const rows: Array<[string, string, boolean, string?, string?]> = [
      [LISTED[0], 'pregame', false], [LISTED[1], 'pregame', false], [LISTED[2], 'awaiting_decision', false],
      [LISTED[3], 'pregame', true], [LISTED[4], 'pregame', true, AWAY, HOME], [LISTED[5], 'awaiting_decision', false, AWAY, HOME],
      [LISTED[6], 'in_progress', false], [DONE, 'complete', true],
      ...LISTED.slice(7).map((id, i): [string, string, boolean] => [id, ['pregame', 'in_progress', 'awaiting_decision'][i % 3], false]),
    ]
    await db.asOwner(async () => {
      for (const [id, status, two, home, away] of rows) {
        await db.db.query(
          `insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state, state_version, completed_at)
           values ($1, 'test-season', 1925, $2, $3, $4, '{}'::jsonb, $5::jsonb, 7, case when $2 = 'complete' then now() end)`,
          [id, status, home ?? HOME, away ?? AWAY, JSON.stringify(state(id, status, two, home, away))])
        await db.db.query(`insert into public.game_events (game_id, state_version, event_type, payload) values ($1, 7, 'PREGAME_SUBMITTED', '{"kept":true}')`, [id])
      }
      await db.db.exec(`insert into public.player_rest_state (user_id, season_id, card_key, hitter_games_remaining, pitcher_games_remaining) values ('${HOME}', 'test-season', 'Some Card', 3, 2)`)
    })
    await extra(db)
    return db
  }
  const run = (db: DevDb) => db.asOwner(() => db.db.exec(oneActiveGame))
  const snapshot = (db: DevDb) => db.asOwner(async () => ({
    games: (await db.db.query('select id, status, play_mode, progression, state_version, end_reason, completed_at, game_state from public.games order by id')).rows,
    events: (await db.db.query('select game_id, state_version, event_type, payload from public.game_events order by game_id, state_version, event_type')).rows,
    rest: (await db.db.query('select * from public.player_rest_state')).rows,
    registry: (await db.db.query('select * from public.gameplay_active_games order by user_id')).rows,
  }))

  it('closes exactly the listed practice games, keeps their history, and records no result', async () => {
    const db = await before()
    const restBefore = await db.asOwner(async () => (await db.db.query('select * from public.player_rest_state')).rows)
    await run(db)
    const after = await snapshot(db)
    type G = { id: string; status: string; play_mode: string; progression: string; state_version: number; end_reason: string | null; completed_at: unknown; game_state: GameState }
    const games = after.games as G[]
    for (const id of LISTED) {
      const g = games.find((x) => x.id === id)!
      expect(g).toMatchObject({ status: 'terminated', end_reason: 'practice_cleanup', completed_at: null, state_version: 8 })
      expect(g.game_state.status).toBe('terminated')
      // the old event is still there, and the closing is recorded
      expect(after.events.filter((e) => (e as { game_id: string }).game_id === id).map((e) => (e as { event_type: string }).event_type))
        .toEqual(['PREGAME_SUBMITTED', 'GAME_TERMINATED'])
    }
    expect(games.filter((x) => x.status === 'terminated').map((x) => x.id).sort()).toEqual(LISTED.slice().sort()) // exactly the 14
    expect(games.find((x) => x.id === DONE)!.status).toBe('complete')
    expect(games.find((x) => x.id === LISTED[3])!.play_mode).toBe('two_player')
    expect(games.find((x) => x.id === LISTED[0])!.play_mode).toBe('one_screen')
    // every existing game, finished or not, is pre-launch -- including the completed two-player game
    expect(new Set(games.map((x) => x.progression))).toEqual(new Set(['prelaunch']))
    expect(after.rest).toEqual(restBefore)
    expect(after.registry).toEqual([]) // nobody is still locked in
  })

  it('has a read-only preview that predicts exactly what the migration closes, and finds no conflicts', async () => {
    const db = await before()
    const [list, conflicts] = await db.asOwner(() => db.db.exec(preview))
    const actions = Object.fromEntries((list.rows as Array<{ id: string; action: string }>).map((r) => [r.id, r.action]))
    for (const id of LISTED) expect(actions[id]).toBe('CLOSE')
    expect(actions[DONE]).toBeUndefined()
    expect(conflicts.rows).toEqual([])
    // and it changed nothing
    expect((await db.asOwner(async () => (await db.db.query(`select count(*)::int as n from public.games where status = 'terminated'`)).rows[0])) as { n: number }).toEqual({ n: 0 })
    // the migration's own list is the preview's list
    const migrationIds = [...oneActiveGame.matchAll(/^\s+'([0-9a-f-]{36})',?$/gm)].map((m) => m[1])
    const previewIds = [...new Set([...preview.matchAll(/\('([0-9a-f-]{36})'/g)].map((m) => m[1]))]
    expect(migrationIds.sort()).toEqual(LISTED.slice().sort())
    expect(previewIds.sort()).toEqual(LISTED.slice().sort())
  })

  it('is safe to run again: nothing changes the second time', async () => {
    const db = await before()
    await run(db)
    const once = await snapshot(db)
    await run(db)
    expect(await snapshot(db)).toEqual(once)
  })

  it('leaves a game created after the inventory alone, and registers it', async () => {
    const db = await before(async (d) => {
      const fixture = buildNonGbCoverageFixture()
      await d.asOwner(() => d.db.query(
        `insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state)
         values ($1, 'test-season', 1925, 'pregame', $2, $3, '{}'::jsonb, $4::jsonb)`,
        [LATER, CARL_SEED, DANA_SEED, JSON.stringify({ ...fixture, gameId: LATER, status: 'pregame', turnHandshake: true })]))
    })
    await run(db)
    const after = await snapshot(db)
    expect((after.games as Array<{ id: string; status: string }>).find((g) => g.id === LATER)!.status).toBe('pregame')
    expect((after.registry as Array<{ game_id: string }>).map((r) => r.game_id)).toEqual([LATER, LATER])
  })

  it('refuses to run, changing nothing, if unlisted games would leave a manager in two unfinished two-player games', async () => {
    const db = await before(async (d) => {
      const fixture = buildNonGbCoverageFixture()
      for (const id of ['40000000-0000-4000-8000-0000000000c1', '40000000-0000-4000-8000-0000000000c2']) {
        await d.asOwner(() => d.db.query(
          `insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state)
           values ($1, 'test-season', 1925, 'in_progress', $2, $3, '{}'::jsonb, $4::jsonb)`,
          [id, CARL_SEED, DANA_SEED, JSON.stringify({ ...fixture, gameId: id, turnHandshake: true })]))
      }
    })
    const beforeRun = await db.asOwner(async () => (await db.db.query('select id, status from public.games order by id')).rows)
    await expect(run(db)).rejects.toThrow(/more than one unfinished two-player game/)
    expect(await db.asOwner(async () => (await db.db.query('select id, status from public.games order by id')).rows)).toEqual(beforeRun)
    const hasMode = await db.asOwner(async () => (await db.db.query(`select 1 from information_schema.columns where table_name = 'games' and column_name = 'play_mode'`)).rows.length)
    expect(hasMode).toBe(0)
  })
})

// Users that exist before the migration in the "before" databases.
const CARL_SEED = DEV_USERS.outsider
const DANA_SEED = DEV_USERS.away

describe('the rollback', () => {
  it('restores the old behaviour, keeps the closed games closed, and the migration can be re-applied', async () => {
    const db = await createGameplayDevDb()
    const oldWriter = MIGRATIONS[MIGRATIONS.length - 2]
    const run = (sql: string) => db.asOwner(() => db.db.exec(sql))
    const fixture = buildNonGbCoverageFixture()
    const closedId = '70000000-0000-4000-8000-000000000001'
    await db.asOwner(() => db.db.query(
      `insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state)
       values ($1, 's', 1925, 'terminated', $2, $3, '{}', $4::jsonb)`, [closedId, HOME, AWAY, JSON.stringify({ ...fixture, gameId: closedId, status: 'terminated' })]))
    await run(rollbackSql)
    await run(oldWriter)
    // the old app's direct insert works again, for two two-player games at once
    const insertAs = (id: string) => db.asOwner(async () => {
      await db.db.exec(`set role authenticated; select set_config('test.uid', '${HOME}', false);`)
      await db.db.query(`insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state, state_version)
        values ($1, 's', 1925, 'in_progress', $2, $3, '{}', $4::jsonb, 1)`, [id, HOME, AWAY, JSON.stringify({ ...fixture, gameId: id, stateVersion: 1, turnHandshake: true })])
    })
    await insertAs('70000000-0000-4000-8000-000000000002')
    await insertAs('70000000-0000-4000-8000-000000000003')
    expect((await db.asOwner(async () => (await db.db.query<{ status: string }>('select status from public.games where id = $1', [closedId])).rows))[0].status).toBe('terminated')
    // re-applying refuses (two unfinished two-player games), as it should, until one is ended
    await expect(run(oneActiveGame)).rejects.toThrow(/more than one unfinished two-player game/)
    await run(`update public.games set status = 'terminated' where id = '70000000-0000-4000-8000-000000000003'`)
    await run(oneActiveGame)
    const rows = await db.asOwner(async () => (await db.db.query<{ play_mode: string; progression: string }>(`select play_mode, progression from public.games where id = '70000000-0000-4000-8000-000000000002'`)).rows)
    expect(rows).toEqual([{ play_mode: 'two_player', progression: 'prelaunch' }])
    expect(await db.activeGame(HOME)).toMatchObject({ game_id: '70000000-0000-4000-8000-000000000002' })
  })
})
