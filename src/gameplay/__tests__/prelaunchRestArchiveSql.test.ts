import { beforeAll, describe, expect, it } from 'vitest'
import archiveSql from '../../../supabase/data-fixes/20261031_prelaunch_rest_archive.sql?raw'
import { createGameplayDevDb, DEV_USERS, type DevDb } from '../devDb'

/**
 * The pre-launch rest archive, run against a real Postgres (PGlite) with the
 * Stage 3 migration under it, step by step as Anthony will run it: STEP 1
 * changes nothing; STEP 2 copies every row unchanged (with the game that wrote
 * it) and removes nothing; STEP 3 confirms the copy; STEP 4 removes the live
 * rows only after re-checking the copy, and refuses if any row was not
 * copied; STEP 5 confirms the result. Re-running is harmless; once launched,
 * the copy and removal steps refuse.
 */

const steps = archiveSql.split(/-- ===================== STEP \d: [^\n]*=====================/).slice(1)
const [step1, step2, step3, step4, step5] = steps
const GAME = '60000000-0000-4000-8000-000000000001'
const COMPLETED = '2026-10-30T21:54:00Z'

let dev: DevDb
const q = <T>(sql: string) => dev.asOwner(async () => (await dev.db.query<T>(sql)).rows)
const run = (sql: string) => dev.asOwner(() => dev.db.exec(sql))
type Rest = { user_id: string; card_key: string; hitter_games_remaining: number; pitcher_games_remaining: number }
const live = () => q<Rest>('select user_id, card_key, hitter_games_remaining, pitcher_games_remaining from public.player_rest_state order by user_id, card_key')
const archived = () => q<Rest & { source_game_id: string | null }>('select user_id, card_key, hitter_games_remaining, pitcher_games_remaining, source_game_id from public.player_rest_state_prelaunch_archive order by user_id, card_key')
const lastRow = async (sql: string) => { const res = await run(sql); return res[res.length - 1].rows[0] as Record<string, number> }

beforeAll(async () => {
  dev = await createGameplayDevDb()
  await run(`
    insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state, completed_at)
    values ('${GAME}', '10.1', 1925, 'complete', '${DEV_USERS.home}', '${DEV_USERS.away}', '{}', '{"turnHandshake": true}', '${COMPLETED}');
    insert into public.player_rest_state (user_id, season_id, card_key, hitter_games_remaining, pitcher_games_remaining, updated_at) values
      ('${DEV_USERS.home}', '10.1', 'Rube Curry', 0, 2, '${COMPLETED}'),
      ('${DEV_USERS.home}', '10.1', 'Nelson Dean', 0, 0, '${COMPLETED}'),
      ('${DEV_USERS.away}', '10.1', 'Hitter One', 3, 0, '${COMPLETED}'),
      ('${DEV_USERS.away}', '10.1-VERIFY', 'Untraced Card', 1, 0, '2026-08-28T16:06:00Z');
  `)
}, 60_000)

describe('pre-launch rest archive', () => {
  it('has the five steps', () => {
    expect(steps).toHaveLength(5)
  })

  it('STEP 1 lists every row, with the game that wrote it, and changes nothing', async () => {
    const before = await live()
    const [preview] = await run(step1)
    const rows = preview.rows as Array<{ card_key: string; written_by_game: string | null; that_game_is: string | null }>
    expect(rows).toHaveLength(4)
    expect(rows.find((r) => r.card_key === 'Rube Curry')).toMatchObject({ written_by_game: GAME, that_game_is: 'prelaunch' })
    expect(rows.find((r) => r.card_key === 'Untraced Card')!.written_by_game).toBeNull()
    expect(await live()).toEqual(before)
  })

  it('STEP 2 copies every row unchanged, with its source game, and removes nothing', async () => {
    const before = await live()
    await run(step2)
    expect(await live()).toEqual(before)
    const kept = await archived()
    expect(kept.map(({ source_game_id: _, ...r }) => r)).toEqual(before)
    expect(kept.find((r) => r.card_key === 'Rube Curry')!.source_game_id).toBe(GAME)
  })

  it('STEP 3 confirms the copy is complete', async () => {
    expect(await lastRow(step3)).toEqual({ live_rows: 4, archived_rows: 4, rows_missing_from_archive: 0, archived_rows_traced_to_a_game: 3 })
  })

  it('STEP 4 refuses, removing nothing, if a live row has no identical archived copy', async () => {
    await q(`update public.player_rest_state set pitcher_games_remaining = 5 where card_key = 'Rube Curry'`) // changed after the copy
    await expect(run(step4)).rejects.toThrow(/1 live rest row\(s\) have no identical archived copy/)
    expect(await live()).toHaveLength(4)
    await q(`update public.player_rest_state set pitcher_games_remaining = 2 where card_key = 'Rube Curry'`)
  })

  it('STEP 4 then removes the archived rows; STEP 5 shows a clean slate with the history kept', async () => {
    const before = await live()
    await run(step4)
    expect(await live()).toEqual([])
    expect((await archived()).map(({ source_game_id: _, ...r }) => r)).toEqual(before)
    expect(await lastRow(step5)).toEqual({ live_rows: 0, archived_rows: 4, source_games: 1 })
    // the game itself, its result and its log are untouched
    expect(await q('select status from public.games')).toEqual([{ status: 'complete' }])
  })

  it('is safe to re-run', async () => {
    const once = await archived()
    await run(step2)
    await run(step4)
    expect(await archived()).toEqual(once)
    expect(await live()).toEqual([])
  })

  it('lets official tracking start from a clean slate, after which copying and removing refuse', async () => {
    await q(`select public.activate_official_tracking('Elements Baseball is officially live')`)
    await expect(run(step2)).rejects.toThrow(/has launched/)
    await expect(run(step4)).rejects.toThrow(/has launched/)
  })
})
