import { beforeAll, describe, expect, it } from 'vitest'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'
import { attachPregameRoster, createInitialGameState } from '../engine'
import { sideToAct } from '../turnOrder'
import { createGameplayDevDb, DEV_USERS, type DevDb } from '../devDb'
import type { GameSide, GameState } from '../types'

/**
 * "Nothing counts until Elements Baseball is declared live", run for real
 * (20261031_gameplay_one_active_game.sql on PGlite). Its own database, because
 * the tests switch official tracking on, and it stays on.
 *
 * Proved here: the switch is OFF by default and only the database owner can
 * turn it on, with the exact confirmation and only from a clean slate; a game
 * is classified once, when it is created, and a writer can never upgrade it;
 * and only an official game completed while tracking is on writes persistent
 * rest -- not a pre-launch game that finishes after launch, not a practice
 * game. Gameplay itself (saving, finishing) is the same for all three.
 */

const HOME = DEV_USERS.home
const AWAY = DEV_USERS.away
const PHRASE = 'Elements Baseball is officially live'

let dev: DevDb
let n = 0
const rejects = (p: Promise<unknown>, pattern: RegExp) => expect(p).rejects.toThrow(pattern)
const owner = <T>(sql: string, params: unknown[] = []) => dev.asOwner(async () => (await dev.db.query<T>(sql, params)).rows)
const restRows = () => owner<{ user_id: string; card_key: string }>('select user_id, card_key from public.player_rest_state')
const progressionOf = async (id: string) => (await owner<{ progression: string }>('select progression from public.games where id = $1', [id]))[0].progression

/** A mid-game two-player (or one-screen) fixture, inserted as the owner. */
async function midGame(twoPlayer = true): Promise<GameState> {
  n += 1
  const s = buildNonGbCoverageFixture()
  s.gameId = `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  s.managers = { home: { userId: HOME, managerName: 'Anthony' }, away: { userId: AWAY, managerName: 'Will' } }
  s.configuration.seasonId = 'test-season'
  s.turnHandshake = twoPlayer ? true : undefined
  s.restState = { home: {}, away: {} }
  await dev.endAll()
  await dev.createGame(HOME, s)
  return s
}

/** Finishes it through the real writer, as the manager whose turn it is. */
async function finish(s: GameState) {
  const side = (s.turnHandshake ? sideToAct(s) : 'home') as GameSide
  await dev.save(side === 'home' ? HOME : AWAY, {
    gameId: s.gameId, expectedStateVersion: s.stateVersion,
    nextState: { ...s, status: 'complete', stateVersion: s.stateVersion + 1 }, eventType: 'DECISION_RESOLVED',
  })
}

beforeAll(async () => { dev = await createGameplayDevDb() }, 60_000)

describe('before launch (the default)', () => {
  it('official tracking is OFF, and everyone signed in can see that', async () => {
    const settings = await dev.asOwner(async () => {
      await dev.db.exec(`set role authenticated; select set_config('test.uid', '${AWAY}', false);`)
      return (await dev.db.query<{ official_tracking_enabled: boolean }>('select official_tracking_enabled from public.gameplay_settings')).rows
    })
    expect(settings).toEqual([{ official_tracking_enabled: false }])
  })

  it('no app user can turn it on or change the setting -- not even an administrator', async () => {
    for (const sql of [
      `select public.activate_official_tracking('${PHRASE}')`,
      `select public.suspend_official_tracking('no reason at all')`,
    ]) {
      await rejects(dev.asOwner(async () => {
        await dev.db.exec(`set role authenticated; select set_config('test.uid', '${HOME}', false);`)
        await dev.db.query(sql)
      }), /permission denied/)
    }
    const updated = await dev.asOwner(async () => {
      await dev.db.exec(`set role authenticated; select set_config('test.uid', '${HOME}', false);`)
      return (await dev.db.query('update public.gameplay_settings set official_tracking_enabled = true returning id')).rows
    })
    expect(updated).toEqual([]) // RLS: no row is writable
    expect((await owner<{ on: boolean }>('select public.gameplay_official_tracking_enabled() as on'))[0].on).toBe(false)
  })

  it('every game is pre-launch -- two-player, one-screen, or asked to be official -- and completing one writes no persistent rest', async () => {
    const two = await midGame(true)
    expect(await progressionOf(two.gameId)).toBe('prelaunch')
    await finish(two)
    expect((await dev.load(HOME, two.gameId)).status).toBe('complete') // the game itself finishes normally
    const one = await midGame(false)
    expect(await progressionOf(one.gameId)).toBe('prelaunch')
    await finish(one)
    await rejects(owner(`update public.games set progression = 'official' where id = $1`, [two.gameId]), /fixed when it is created/)
    expect(await restRows()).toEqual([])
  })

  it('cannot be suspended or resumed before launch', async () => {
    await rejects(owner(`select public.suspend_official_tracking('not launched yet')`), /nothing to suspend/)
    await rejects(owner(`select public.resume_official_tracking('not launched yet')`), /has not launched yet/)
  })

  it('the owner\'s activation needs the exact confirmation and a clean slate', async () => {
    await rejects(owner(`select public.activate_official_tracking('yes')`), /pass exactly/)
    await owner(`insert into public.player_rest_state (user_id, season_id, card_key, hitter_games_remaining) values ($1, 'test-season', 'Old Card', 2)`, [HOME])
    await rejects(owner(`select public.activate_official_tracking('${PHRASE}')`), /pre-launch row\(s\). Archive them first/)
    await owner('delete from public.player_rest_state')
    expect((await owner<{ on: boolean }>('select public.gameplay_official_tracking_enabled() as on'))[0].on).toBe(false)
  })
})

describe('after the owner declares it live', () => {
  let startedBefore: GameState

  beforeAll(async () => {
    startedBefore = await midGame(true) // created before launch, still unfinished
    await owner(`select public.activate_official_tracking('${PHRASE}')`)
  })

  it('is on, recorded with the time and the confirmation, and cannot be activated twice', async () => {
    const [s] = await owner<{ official_tracking_enabled: boolean; official_tracking_started_at: string | null; note: string }>('select * from public.gameplay_settings')
    expect(s).toMatchObject({ official_tracking_enabled: true, note: PHRASE })
    expect(s.official_tracking_started_at).not.toBeNull()
    expect(await owner('select official_tracking_enabled, note from public.gameplay_settings_history')).toEqual([{ official_tracking_enabled: true, note: PHRASE }])
    await rejects(owner(`select public.activate_official_tracking('${PHRASE}')`), /already on/)
  })

  it('a game started before launch stays pre-launch, and finishing it now writes nothing', async () => {
    expect(await progressionOf(startedBefore.gameId)).toBe('prelaunch')
    await finish(startedBefore)
    expect(await restRows()).toEqual([])
  })

  it('a new two-player game is official, a one-screen game is practice, and a friendly is practice', async () => {
    const official = await midGame(true)
    expect(await progressionOf(official.gameId)).toBe('official')
    const oneScreen = await midGame(false)
    expect(await progressionOf(oneScreen.gameId)).toBe('practice')
    await dev.endAll()
    const fixture = buildNonGbCoverageFixture()
    const friendly = attachPregameRoster(createInitialGameState({
      gameId: '50000000-0000-4000-8000-0000000000f1', configuration: { ...fixture.configuration, seasonId: 'test-season' },
      homeManager: { userId: HOME, managerName: 'Anthony' }, awayManager: { userId: AWAY, managerName: 'Will' },
    }), 'home', fixture.pregame.home.roster!)
    friendly.turnHandshake = true
    await dev.asOwner(() => Promise.resolve()) // keep the queue order
    const saved = await dev.asOwner(async () => {
      await dev.db.exec(`set role authenticated; select set_config('test.uid', '${HOME}', false);`)
      return (await dev.db.query<{ g: { progression: string } }>('select public.create_gameplay_game($1::jsonb, true) as g', [JSON.stringify(friendly)])).rows[0].g
    })
    expect(saved.progression).toBe('practice')
    // a practice game still counts toward the one-unfinished-game limit
    expect(await dev.activeGame(HOME)).toMatchObject({ game_id: friendly.gameId })
  })

  it('a forged one-screen "official" game is practice', async () => {
    await dev.endAll()
    const s = buildNonGbCoverageFixture()
    s.gameId = '50000000-0000-4000-8000-0000000000f2'
    s.managers = { home: { userId: HOME, managerName: 'Anthony' }, away: { userId: AWAY, managerName: 'Will' } }
    await owner(`insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state, progression)
      values ($1, 'test-season', 1925, 'in_progress', $2, $3, '{}'::jsonb, $4::jsonb, 'official')`, [s.gameId, HOME, AWAY, JSON.stringify(s)])
    expect(await progressionOf(s.gameId)).toBe('practice')
  })

  it('only an official game completed now writes persistent rest; practice games still write none', async () => {
    const practice = await midGame(false)
    await finish(practice)
    expect(await restRows()).toEqual([])
    const official = await midGame(true)
    await finish(official)
    const rows = await restRows()
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([HOME, AWAY]))
  })

  it('a two-player friendly counts toward the one-unfinished-game limit but never toward progression', async () => {
    await dev.endAll()
    const fixture = buildNonGbCoverageFixture()
    const friendly = attachPregameRoster(createInitialGameState({
      gameId: '50000000-0000-4000-8000-0000000000f3', configuration: { ...fixture.configuration, seasonId: 'test-season' },
      homeManager: { userId: HOME, managerName: 'Anthony' }, awayManager: { userId: AWAY, managerName: 'Will' },
    }), 'home', fixture.pregame.home.roster!)
    friendly.turnHandshake = true
    await dev.asOwner(async () => {
      await dev.db.exec(`set role authenticated; select set_config('test.uid', '${HOME}', false);`)
      await dev.db.query('select public.create_gameplay_game($1::jsonb, true)', [JSON.stringify(friendly)])
    })
    expect(await progressionOf(friendly.gameId)).toBe('practice')
    // neither manager can start another game, official or friendly, while it is unfinished
    const another = { ...friendly, gameId: '50000000-0000-4000-8000-0000000000f4' }
    await rejects(dev.create(HOME, another), /ACTIVE_GAME_HOME/)
    await rejects(dev.create(AWAY, { ...another, managers: { home: friendly.managers.away, away: friendly.managers.home } }), /ACTIVE_GAME_HOME/)
    // finished as a friendly: no rest written
    const restBefore = await restRows()
    await dev.endAll()
    const f2 = buildNonGbCoverageFixture()
    f2.gameId = '50000000-0000-4000-8000-0000000000f5'
    f2.managers = { home: { userId: HOME, managerName: 'Anthony' }, away: { userId: AWAY, managerName: 'Will' } }
    f2.configuration.seasonId = 'test-season'
    f2.turnHandshake = true
    f2.restState = { home: {}, away: {} }
    await owner(`insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state, progression)
      values ($1, 'test-season', 1925, 'in_progress', $2, $3, '{}'::jsonb, $4::jsonb, 'practice')`, [f2.gameId, HOME, AWAY, JSON.stringify(f2)])
    expect(await progressionOf(f2.gameId)).toBe('practice')
    await finish(f2)
    expect(await restRows()).toEqual(restBefore)
  })

  describe('an emergency suspension', () => {
    let officialBefore: GameState

    beforeAll(async () => {
      officialBefore = await midGame(true) // official, unfinished when the suspension starts
      await rejects(owner(`select public.suspend_official_tracking('')`), /Give a reason/)
      await owner(`select public.suspend_official_tracking('Found a scoring bug, pausing the season')`)
    })

    it('is recorded, and only the owner can do it', async () => {
      expect((await owner<{ on: boolean }>('select public.gameplay_official_tracking_enabled() as on'))[0].on).toBe(false)
      const notes = (await owner<{ note: string }>('select note from public.gameplay_settings_history order by id')).map((r) => r.note)
      expect(notes.at(-1)).toBe('SUSPENDED: Found a scoring bug, pausing the season')
      await rejects(dev.asOwner(async () => {
        await dev.db.exec(`set role authenticated; select set_config('test.uid', '${HOME}', false);`)
        await dev.db.query(`select public.resume_official_tracking('let me back in')`)
      }), /permission denied/)
      await rejects(owner(`select public.suspend_official_tracking('twice in a row')`), /nothing to suspend/)
      await rejects(owner(`select public.activate_official_tracking('${PHRASE}')`), /already launched/)
    })

    it('classifies games created meanwhile as untracked, not pre-launch, and they finish without progression', async () => {
      const officialId = officialBefore.gameId
      await owner(`update public.games set status = 'terminated' where id <> $1 and not public.gameplay_is_ended(status)`, [officialId])
      await owner(`update public.games set status = 'terminated' where id = $1`, [officialId]) // free the managers for this check
      const g = await midGame(true)
      expect(await progressionOf(g.gameId)).toBe('untracked')
      const restBefore = await restRows()
      await finish(g)
      expect((await dev.load(HOME, g.gameId)).status).toBe('complete')
      expect(await restRows()).toEqual(restBefore)
    })

    it('lets an official game play on but not finish; nothing is saved, and the same move finishes it after resuming', async () => {
      // a fresh official game: created while on, then suspended mid-game
      await owner(`select public.resume_official_tracking('bug fixed, back on')`)
      const g = await midGame(true)
      expect(await progressionOf(g.gameId)).toBe('official')
      await owner(`select public.suspend_official_tracking('second scare, pausing again')`)
      const restBefore = await restRows()
      const before = await dev.load(HOME, g.gameId)
      await rejects(finish(g), /OFFICIAL_TRACKING_SUSPENDED/)
      const after = await dev.load(HOME, g.gameId)
      expect(after.status).toBe(before.status)
      expect(after.state_version).toBe(before.state_version)
      expect(await restRows()).toEqual(restBefore)
      expect(await dev.activeGame(HOME)).toMatchObject({ game_id: g.gameId }) // still the managers' active game
      // resumed: the same final move finishes it, and its progression is recorded
      await rejects(owner(`select public.resume_official_tracking('')`), /Give a reason/)
      await owner(`select public.resume_official_tracking('all clear')`)
      const [{ t }] = await owner<{ t: string }>('select clock_timestamp() as t')
      await finish(g)
      expect((await dev.load(HOME, g.gameId)).status).toBe('complete')
      const written = await owner<{ user_id: string }>('select distinct user_id from public.player_rest_state where updated_at >= $1', [t])
      expect(new Set(written.map((r) => r.user_id))).toEqual(new Set([HOME, AWAY]))
      expect(await dev.activeGame(HOME)).toBeNull()
    })
  })
})
