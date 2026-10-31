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
import m11 from '../../supabase/migrations/20261031_gameplay_one_active_game.sql?raw'

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

export const MIGRATIONS = [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11]

export type DevDb = {
  db: PGlite
  /** A fixture: inserted as the database owner in whatever state it is in. The triggers still apply. */
  createGame: (asUser: string, state: GameState) => Promise<void>
  /** Through create_gameplay_game, as the app does it. */
  create: (asUser: string, state: GameState) => Promise<PersistedGameplayLabGame>
  /** Ends every unfinished game, as the owner, so a test can start clean. */
  endAll: () => Promise<void>
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
  cancel: (asUser: string, gameId: string) => Promise<PersistedGameplayLabGame>
  terminate: (asUser: string, gameId: string, reason: string) => Promise<PersistedGameplayLabGame>
  activeGame: (asUser: string) => Promise<{ game_id: string; status: string; side: string; opponent_name: string | null } | null>
  /** As the database owner (the SQL Editor): RLS and the auth checks do not apply. */
  asOwner: <T>(fn: () => Promise<T>) => Promise<T>
}

/** `migrations` defaults to all of them; a test of a migration passes the ones before it. */
export async function createGameplayDevDb(migrations: string[] = MIGRATIONS): Promise<DevDb> {
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
  for (const migration of migrations) {
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

  const owner = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      await db.exec(`reset role; select set_config('test.uid', '', false);`)
      try { return await fn() } finally {
        // after a failed statement the transaction is aborted and even SET
        // ROLE is refused; end it so the caller sees the real error
        try { await db.exec('set role authenticated') } catch { await db.exec('rollback; set role authenticated') }
      }
    })
    queue = run.catch(() => undefined)
    return run
  }

  return {
    db,
    // The browser has no insert policy since 20261031_gameplay_one_active_game,
    // so a fixture is inserted as the owner (the SQL Editor's role); the
    // guard and registry triggers run exactly as they do live.
    createGame: (_asUser, s) => owner(async () => {
      await db.query(
        `insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state, state_version)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
        [s.gameId, s.configuration.seasonId, s.configuration.mlbYear, s.status, s.managers.home.userId, s.managers.away.userId,
          JSON.stringify(s.configuration), JSON.stringify(s), s.stateVersion],
      )
    }),
    create: (asUser, s) => as(asUser, async () => {
      const r = await db.query<{ g: PersistedGameplayLabGame }>('select public.create_gameplay_game($1::jsonb) as g', [JSON.stringify(s)])
      return r.rows[0].g
    }),
    endAll: () => owner(async () => {
      await db.exec(`update public.games set status = 'terminated', game_state = jsonb_set(game_state, '{status}', '"terminated"') where not public.gameplay_is_ended(status)`)
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
    cancel: (asUser, gameId) => as(asUser, async () => {
      const r = await db.query<{ g: PersistedGameplayLabGame }>('select public.cancel_gameplay_game($1) as g', [gameId])
      return r.rows[0].g
    }),
    terminate: (asUser, gameId, reason) => as(asUser, async () => {
      const r = await db.query<{ g: PersistedGameplayLabGame }>('select public.terminate_gameplay_game($1, $2) as g', [gameId, reason])
      return r.rows[0].g
    }),
    activeGame: (asUser) => as(asUser, async () => {
      const r = await db.query<{ game_id: string; status: string; side: string; opponent_name: string | null }>('select * from public.get_my_active_game()')
      return r.rows[0] ?? null
    }),
    asOwner: (fn) => owner(fn),
    sideToAct: async (state) => {
      const r = await db.query<{ side: string | null }>('select public.gameplay_side_to_act($1::jsonb) as side', [JSON.stringify(state)])
      return r.rows[0].side
    },
  }
}
