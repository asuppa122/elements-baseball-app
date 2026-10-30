import { PGlite } from '@electric-sql/pglite'
import type { PersistedGameplayLabGame, RollKind } from './gameRepository'
import type { GameState } from './types'

// The gameplay migrations, in the order they were applied to the live project.
// Loaded through Vite's ?raw so the SQL that runs here is the file itself, not
// a copy of it.
import m0 from '../../supabase/migrations/20260818_gameplay_phase1_foundation.sql?raw'
import m1 from '../../supabase/migrations/20260818_gameplay_phase1a_private_lab.sql?raw'
import m2 from '../../supabase/migrations/20260818_gameplay_phase1b_pregame_state.sql?raw'
import m3 from '../../supabase/migrations/20260818_gameplay_phase1d_start_state.sql?raw'
import m4 from '../../supabase/migrations/20260818_gameplay_phase2a_pitch_roll.sql?raw'
import m5 from '../../supabase/migrations/20260818_gameplay_build1_core_game.sql?raw'
import m6 from '../../supabase/migrations/20260826_gameplay_player_rest_state.sql?raw'
import m7 from '../../supabase/migrations/20260826_gameplay_rest_tracking_on_completion.sql?raw'
import m8 from '../../supabase/migrations/20260827_gameplay_away_side_access.sql?raw'
import m9 from '../../supabase/migrations/20261029_gameplay_two_player.sql?raw'
import m10 from '../../supabase/migrations/20261030_gameplay_rest_appearance_fix.sql?raw'

/**
 * A real Postgres with the gameplay schema, for development only.
 *
 * PGlite is Postgres 18 compiled to wasm; it runs in Node (the two-player SQL
 * test) and in the browser (the dev-only duel page). Supabase's auth is
 * stubbed down to the one thing the SQL reads -- auth.uid(), taken from a
 * session setting -- and every call runs as the `authenticated` role, so the
 * row-level security policies apply exactly as they do live.
 *
 * Never imported by anything in the production bundle.
 */

export const DEV_USERS = {
  home: '00000000-0000-4000-8000-000000000001',
  away: '00000000-0000-4000-8000-000000000002',
  outsider: '00000000-0000-4000-8000-000000000003',
} as const

export const MIGRATIONS = [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10]

export type DevDb = {
  db: PGlite
  createGame: (asUser: string, state: GameState) => Promise<void>
  save: (asUser: string, args: {
    gameId: string
    expectedStateVersion: number
    nextState: GameState
    eventType: string
    eventPayload?: Record<string, unknown>
  }) => Promise<PersistedGameplayLabGame>
  roll: (asUser: string, gameId: string, stateVersion: number, kind: RollKind) => Promise<number>
  load: (asUser: string, gameId: string) => Promise<PersistedGameplayLabGame>
  events: (asUser: string, gameId: string) => Promise<Array<Record<string, unknown>>>
  sideToAct: (state: GameState) => Promise<string | null>
}

export async function createGameplayDevDb(): Promise<DevDb> {
  const db = new PGlite()
  await db.exec(`
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.profiles (
      user_id uuid primary key references auth.users(id),
      manager_name text not null unique,
      avatar_url text
    );
    insert into auth.users values ('${DEV_USERS.home}'), ('${DEV_USERS.away}'), ('${DEV_USERS.outsider}');
    insert into public.profiles values
      ('${DEV_USERS.home}', 'Anthony', null), ('${DEV_USERS.away}', 'Will', null), ('${DEV_USERS.outsider}', 'Outsider', null);
    grant usage on schema public, auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `)
  for (const migration of MIGRATIONS) {
    // pgcrypto is not built into PGlite; gen_random_uuid() is core since PG 13
    await db.exec(migration.replace(/create extension if not exists pgcrypto;/gi, ''))
  }
  // Supabase grants these to `authenticated` by default; RLS then decides.
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    set role authenticated;
  `)

  // One connection, so set-then-call must not interleave with another caller.
  let queue: Promise<unknown> = Promise.resolve()
  const as = <T>(userId: string, fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      await db.query(`select set_config('test.uid', $1, false)`, [userId])
      return fn()
    })
    queue = run.catch(() => undefined)
    return run
  }

  return {
    db,
    createGame: (asUser, s) => as(asUser, async () => {
      await db.query(
        `insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state, state_version)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
        [s.gameId, s.configuration.seasonId, s.configuration.mlbYear, s.status, s.managers.home.userId, s.managers.away.userId,
          JSON.stringify(s.configuration), JSON.stringify(s), s.stateVersion],
      )
    }),
    save: (asUser, a) => as(asUser, async () => {
      const r = await db.query<{ saved: PersistedGameplayLabGame }>(
        'select public.save_gameplay_lab_state($1, $2, $3::jsonb, $4, $5::jsonb) as saved',
        [a.gameId, a.expectedStateVersion, JSON.stringify(a.nextState), a.eventType, JSON.stringify(a.eventPayload ?? {})],
      )
      return r.rows[0].saved
    }),
    roll: (asUser, gameId, stateVersion, kind) => as(asUser, async () => {
      const r = await db.query<{ roll: number }>('select public.roll_gameplay_die($1, $2, $3) as roll', [gameId, stateVersion, kind])
      return r.rows[0].roll
    }),
    load: (asUser, gameId) => as(asUser, async () => {
      const r = await db.query<PersistedGameplayLabGame>('select * from public.games where id = $1', [gameId])
      if (!r.rows[0]) throw new Error('Game not found.')
      return r.rows[0]
    }),
    events: (asUser, gameId) => as(asUser, async () => {
      const r = await db.query<Record<string, unknown>>(
        'select id, game_id, state_version, event_type, actor_user_id, payload, created_at from public.game_events where game_id = $1 order by state_version', [gameId])
      return r.rows
    }),
    sideToAct: async (state) => {
      const r = await db.query<{ side: string | null }>('select public.gameplay_side_to_act($1::jsonb) as side', [JSON.stringify(state)])
      return r.rows[0].side
    },
  }
}
