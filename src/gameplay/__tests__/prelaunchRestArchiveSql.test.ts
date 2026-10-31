import { beforeAll, describe, expect, it } from 'vitest'
import archiveSql from '../../../supabase/data-fixes/20261031_prelaunch_rest_archive.sql?raw'
import { createGameplayDevDb, DEV_USERS, type DevDb } from '../devDb'

/**
 * The pre-launch rest archive, run against a real Postgres (PGlite) with the
 * Stage 3 migration under it, before Anthony runs it live: STEP 1 changes
 * nothing, STEP 2 moves every row into the archive unchanged (with the game
 * that wrote it), a second STEP 2 changes nothing, official tracking can then
 * be switched on, and STEP 2 refuses once it is.
 */

const [, afterHeader] = archiveSql.split('-- ===================== STEP 1: preview (read-only) =====================')
const [step1, step2] = afterHeader.split('-- ===================== STEP 2: apply =====================')
const GAME = '60000000-0000-4000-8000-000000000001'
const COMPLETED = '2026-10-30T21:54:00Z'

let dev: DevDb
const q = <T>(sql: string) => dev.asOwner(async () => (await dev.db.query<T>(sql)).rows)
type Rest = { user_id: string; card_key: string; hitter_games_remaining: number; pitcher_games_remaining: number }
const live = () => q<Rest>('select user_id, card_key, hitter_games_remaining, pitcher_games_remaining from public.player_rest_state order by user_id, card_key')
const archived = () => q<Rest & { source_game_id: string | null }>('select user_id, card_key, hitter_games_remaining, pitcher_games_remaining, source_game_id from public.player_rest_state_prelaunch_archive order by user_id, card_key')

beforeAll(async () => {
  dev = await createGameplayDevDb()
  await dev.asOwner(() => dev.db.exec(`
    insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state, completed_at)
    values ('${GAME}', '10.1', 1925, 'complete', '${DEV_USERS.home}', '${DEV_USERS.away}', '{}', '{"turnHandshake": true}', '${COMPLETED}');
    insert into public.player_rest_state (user_id, season_id, card_key, hitter_games_remaining, pitcher_games_remaining, updated_at) values
      ('${DEV_USERS.home}', '10.1', 'Rube Curry', 0, 2, '${COMPLETED}'),
      ('${DEV_USERS.home}', '10.1', 'Nelson Dean', 0, 0, '${COMPLETED}'),
      ('${DEV_USERS.away}', '10.1', 'Hitter One', 3, 0, '${COMPLETED}'),
      ('${DEV_USERS.away}', '10.1-VERIFY', 'Untraced Card', 1, 0, '2026-08-28T16:06:00Z');
  `))
}, 60_000)

describe('pre-launch rest archive', () => {
  it('STEP 1 lists every row, with the game that wrote it, and changes nothing', async () => {
    const before = await live()
    const [preview] = await dev.asOwner(() => dev.db.exec(step1))
    expect(preview.rows).toHaveLength(4)
    const traced = (preview.rows as Array<{ card_key: string; written_by_game: string | null; that_game_is: string | null }>)
    expect(traced.find((r) => r.card_key === 'Rube Curry')).toMatchObject({ written_by_game: GAME, that_game_is: 'prelaunch' })
    expect(traced.find((r) => r.card_key === 'Untraced Card')!.written_by_game).toBeNull()
    expect(await live()).toEqual(before)
  })

  it('STEP 2 moves every row into the archive unchanged; official rest starts empty', async () => {
    const before = await live()
    await dev.asOwner(() => dev.db.exec(step2))
    expect(await live()).toEqual([])
    const kept = await archived()
    expect(kept.map(({ source_game_id: _, ...r }) => r)).toEqual(before)
    expect(kept.find((r) => r.card_key === 'Rube Curry')!.source_game_id).toBe(GAME)
    // the game itself, its result and its log are untouched
    expect(await q('select status from public.games')).toEqual([{ status: 'complete' }])
  })

  it('is safe to run twice', async () => {
    const once = await archived()
    await dev.asOwner(() => dev.db.exec(step2))
    expect(await archived()).toEqual(once)
    expect(await live()).toEqual([])
  })

  it('lets official tracking start from a clean slate, and then refuses to run', async () => {
    await q(`select public.activate_official_tracking('Elements Baseball is officially live')`)
    await expect(dev.asOwner(() => dev.db.exec(step2))).rejects.toThrow(/Official tracking is on/)
  })
})
