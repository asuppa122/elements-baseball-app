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

  it('the owner can suspend it with a reason; new games are then untracked again', async () => {
    await rejects(owner(`select public.suspend_official_tracking('')`), /Give a reason/)
    await owner(`select public.suspend_official_tracking('Found a scoring bug, pausing the season')`)
    expect((await owner<{ on: boolean }>('select public.gameplay_official_tracking_enabled() as on'))[0].on).toBe(false)
    const g = await midGame(true)
    expect(await progressionOf(g.gameId)).toBe('prelaunch')
  })
})
