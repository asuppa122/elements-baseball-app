// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import fixSql from '../../../supabase/data-fixes/20261030_first_live_game_rest_correction.sql?raw'
import { createGameplayDevDb, DEV_USERS, type DevDb } from '../devDb'

/**
 * The one-time correction for the first live game's rest rows, run against a
 * real Postgres before Anthony runs it live. The game and its rest rows are
 * built exactly as the old completion left them; the test then runs STEP 1
 * (preview) and STEP 2 (apply) from the file itself, and STEP 2 again.
 */

const GAME = '5f851eed-a521-4b96-9dba-446ea0b2a506'
const COMPLETED = '2026-10-29T23:40:00Z'
const [, afterHeader] = fixSql.split('-- ===================== STEP 1: preview (read-only) =====================')
const [step1, step2] = afterHeader.split('-- ===================== STEP 2: apply =====================')

const card = (hitterFatigue: number | null, pitcherFatigue: number | null) => ({
  hitter: { fatigue: hitterFatigue }, pitcher: { fatigue: pitcherFatigue },
})

let dev: DevDb
type Row = { card_key: string; hitter_games_remaining: number; pitcher_games_remaining: number }
const rows = async () => (await dev.db.query<Row>(
  'select card_key, hitter_games_remaining, pitcher_games_remaining from public.player_rest_state order by card_key')).rows

beforeAll(async () => {
  dev = await createGameplayDevDb()
  await dev.db.exec('reset role')
  const state = {
    gameId: GAME,
    configuration: { restMilestones: [{ gamesPlayed: 8, bonusRestDays: 1 }] },
    pregame: {
      home: { defaultBatterCardKeys: [], defaultPitcherCardKeys: [], roster: { cards: {
        'Hitter Appeared': card(3, null),
        'Rube Curry': card(null, 3),
        'Nelson Dean': card(null, 2),
        'Zero Fatigue': card(0, null),
      } } },
      away: { defaultBatterCardKeys: [], defaultPitcherCardKeys: [], roster: { cards: {
        'Away Later': card(2, null),
      } } },
    },
    hitterPlateAppearanceCardKeys: { home: ['Hitter Appeared', 'Zero Fatigue'], away: ['Away Later'] },
    pitcherAppearanceCardKeys: { home: ['Rube Curry'], away: [] },
  }
  await dev.db.query(
    `insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state, state_version, completed_at)
     values ($1, '10.1', 1925, 'complete', $2, $3, '{}'::jsonb, $4::jsonb, 324, $5)`,
    [GAME, DEV_USERS.home, DEV_USERS.away, JSON.stringify(state), COMPLETED])
  // As the old rule left them: appearing players one short; Dean sat (correct).
  const insert = (user: string, key: string, h: number, p: number, at = COMPLETED) => dev.db.query(
    `insert into public.player_rest_state (user_id, season_id, card_key, hitter_games_remaining, pitcher_games_remaining, updated_at)
     values ($1, '10.1', $2, $3, $4, $5)`, [user, key, h, p, at])
  await insert(DEV_USERS.home, 'Hitter Appeared', 2, 0)
  await insert(DEV_USERS.home, 'Rube Curry', 0, 2)
  await insert(DEV_USERS.home, 'Nelson Dean', 0, 2)
  await insert(DEV_USERS.home, 'Zero Fatigue', 0, 0)
  await insert(DEV_USERS.away, 'Away Later', 5, 0, '2026-10-30T12:00:00Z') // a later game touched it
}, 60_000)

describe('first live game rest correction', () => {
  it('previews exactly what it will change and why it skips the rest', async () => {
    const r = await dev.db.query<{ card_key: string; track: string; action: string; corrected_value: number | null }>(step1)
    const by = Object.fromEntries(r.rows.map((x) => [`${x.card_key}/${x.track}`, x]))
    expect(by['Rube Curry/pitcher']).toMatchObject({ action: 'add 1', corrected_value: 3 })
    expect(by['Hitter Appeared/hitter']).toMatchObject({ action: 'add 1', corrected_value: 3 })
    expect(by['Zero Fatigue/hitter'].action).toMatch(/^skip: saved 0/)
    expect(by['Away Later/hitter'].action).toMatch(/^skip: row changed/)
    expect(by['Nelson Dean/pitcher']).toBeUndefined() // did not appear
  })

  it('applies +1 only to the rows it previewed, and running it again changes nothing', async () => {
    await dev.db.exec(step2)
    const after = await rows()
    const val = (k: string) => after.find((x) => x.card_key === k)!
    expect(val('Rube Curry').pitcher_games_remaining).toBe(3)
    expect(val('Hitter Appeared').hitter_games_remaining).toBe(3)
    expect(val('Nelson Dean').pitcher_games_remaining).toBe(2)
    expect(val('Zero Fatigue').hitter_games_remaining).toBe(0)
    expect(val('Away Later').hitter_games_remaining).toBe(5)
    await dev.db.exec(step2)
    expect(await rows()).toEqual(after)
  })
})
