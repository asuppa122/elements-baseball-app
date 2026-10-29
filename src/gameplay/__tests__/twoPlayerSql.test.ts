// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
// Loaded through Vite's ?raw, like restTrackingSqlParity.test.ts, so this stays
// inside the app's tsconfig rather than needing node:fs.
import m0 from '../../../supabase/migrations/20260818_gameplay_phase1_foundation.sql?raw'
import m1 from '../../../supabase/migrations/20260818_gameplay_phase1a_private_lab.sql?raw'
import m2 from '../../../supabase/migrations/20260818_gameplay_phase1b_pregame_state.sql?raw'
import m3 from '../../../supabase/migrations/20260818_gameplay_phase1d_start_state.sql?raw'
import m4 from '../../../supabase/migrations/20260818_gameplay_phase2a_pitch_roll.sql?raw'
import m5 from '../../../supabase/migrations/20260818_gameplay_build1_core_game.sql?raw'
import m6 from '../../../supabase/migrations/20260826_gameplay_player_rest_state.sql?raw'
import m7 from '../../../supabase/migrations/20260826_gameplay_rest_tracking_on_completion.sql?raw'
import m8 from '../../../supabase/migrations/20260827_gameplay_away_side_access.sql?raw'
import m9 from '../../../supabase/migrations/20261029_gameplay_two_player.sql?raw'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'
import { declareOffenseReady, pauseGame, resolvePitchRoll, resolveSwingRoll, resumeGame } from '../engine'
import { beginPrePitchDecision, confirmManagerDecision, getDecisionView, resolveDecisionRoll } from '../decisionEngine'
import { awaitingOffenseReady, sideToAct } from '../turnOrder'
import { botSelection, maybeBotPrePitchAction } from '../testHarness'
import type { GameSide, GameState } from '../types'

/**
 * The two-player migration, run for real.
 *
 * A Postgres (PGlite, PG 18 compiled to wasm) gets the gameplay migrations in
 * the order they were applied to the live project, then
 * 20261029_gameplay_two_player.sql. Supabase's auth is stubbed down to the one
 * thing the SQL reads -- auth.uid() -- and the calls run as the
 * `authenticated` role, so row-level security is enforced as it is live.
 *
 * Then whole games are played through the real engine, each move submitted by
 * the manager whose turn it is, every die rolled by the server. That is the
 * test that matters: a rule that rejects a legitimate move strands a real game
 * between two people with no way forward, and fixtures cannot find which
 * moves those are. Along the way the wrong manager tries the same move, and
 * TS sideToAct is compared with the SQL gameplay_side_to_act on every state.
 */

// in the order they were applied to the live project
const MIGRATIONS = [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9]

const HOME = '00000000-0000-4000-8000-000000000001'
const AWAY = '00000000-0000-4000-8000-000000000002'
const OUTSIDER = '00000000-0000-4000-8000-000000000003'

let db: PGlite

async function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('test.uid', $1, false)`, [userId])
  return fn()
}

async function save(userId: string, gameId: string, expected: number, next: GameState, eventType: string, payload: Record<string, unknown>) {
  return as(userId, () => db.query(
    'select public.save_gameplay_lab_state($1, $2, $3::jsonb, $4, $5::jsonb) as saved',
    [gameId, expected, JSON.stringify(next), eventType, JSON.stringify(payload)],
  ))
}

async function rollDie(userId: string, gameId: string, version: number, kind: 'pitch' | 'swing' | 'decision'): Promise<number> {
  const r = await as(userId, () => db.query<{ roll: number }>(
    'select public.roll_gameplay_die($1, $2, $3) as roll', [gameId, version, kind]))
  return r.rows[0].roll
}

async function loadState(gameId: string): Promise<GameState> {
  const r = await as(HOME, () => db.query<{ game_state: GameState }>('select game_state from public.games where id = $1', [gameId]))
  return r.rows[0].game_state
}

async function sqlSideToAct(state: GameState): Promise<string | null> {
  const r = await db.query<{ side: string | null }>('select public.gameplay_side_to_act($1::jsonb) as side', [JSON.stringify(state)])
  return r.rows[0].side
}

async function rejects(p: Promise<unknown>, pattern: RegExp) {
  await expect(p).rejects.toThrow(pattern)
}

function rng(seed: number) {
  let x = seed >>> 0
  return () => { x = (1664525 * x + 1013904223) >>> 0; return x / 4294967296 }
}

let gameCounter = 0
const decisionsPlayed = new Set<string>()
async function createGame(twoPlayer: boolean): Promise<GameState> {
  gameCounter += 1
  const id = `10000000-0000-4000-8000-${String(gameCounter).padStart(12, '0')}`
  const s = buildNonGbCoverageFixture()
  s.gameId = id
  s.managers = { home: { userId: HOME, managerName: 'Anthony' }, away: { userId: AWAY, managerName: 'Will' } }
  s.firstPitchThrown = false
  if (twoPlayer) s.turnHandshake = true
  s.restState = { home: {}, away: {} }
  await as(HOME, () => db.query(
    `insert into public.games (id, season_id, season_year, status, home_user_id, away_user_id, configuration_snapshot, game_state, state_version)
     values ($1, 'test-season', 1925, $2, $3, $4, $5::jsonb, $6::jsonb, 1)`,
    [id, s.status, HOME, AWAY, JSON.stringify(s.configuration), JSON.stringify(s)],
  ))
  return s
}

const userFor = (side: GameSide) => (side === 'home' ? HOME : AWAY)
const otherUser = (side: GameSide) => (side === 'home' ? AWAY : HOME)
const bump = (prev: GameState, next: GameState): GameState =>
  next.stateVersion > prev.stateVersion ? next : { ...next, stateVersion: prev.stateVersion + 1 }

beforeAll(async () => {
  db = new PGlite()
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
    insert into auth.users values ('${HOME}'), ('${AWAY}'), ('${OUTSIDER}');
    insert into public.profiles values ('${HOME}', 'Anthony', null), ('${AWAY}', 'Will', null), ('${OUTSIDER}', 'Outsider', null);
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
}, 60_000)

describe('two-player migration (real Postgres)', () => {
  it('lists only opponents who can play', async () => {
    const r = await as(HOME, () => db.query<{ manager_name: string }>('select manager_name from public.list_gameplay_opponents()'))
    expect(r.rows.map((x) => x.manager_name)).toEqual(['Will'])
  })

  it('leaves one-screen lab games on the old rule: home writes, away cannot', async () => {
    const s = await createGame(false)
    const next = resolvePitchRoll(s, 12)
    await rejects(save(AWAY, s.gameId, 1, next, 'PITCH_ROLLED', { roll: 12 }), /does not belong/)
    await save(HOME, s.gameId, 1, next, 'PITCH_ROLLED', { roll: 12 })
    await rejects(rollDie(HOME, s.gameId, 2, 'swing'), /only used in two-player/)
  })

  it('rejects a manager changing the other team, the managers, or the turn mode', async () => {
    const s = await createGame(true)
    const ready = declareOffenseReady(s) // top of the 1st: away bats
    const tampered = structuredClone(ready)
    tampered.pregame.home.battingOrderCardKeys = [...tampered.pregame.home.battingOrderCardKeys].reverse()
    await rejects(save(AWAY, s.gameId, 1, tampered, 'OFFENSE_READY', {}), /other manager's team/)
    const renamed = structuredClone(ready)
    renamed.managers.home.managerName = 'Someone else'
    await rejects(save(AWAY, s.gameId, 1, renamed, 'OFFENSE_READY', {}), /managers or turn mode/)
    const flipped = structuredClone(ready)
    delete flipped.turnHandshake
    await rejects(save(AWAY, s.gameId, 1, flipped, 'OFFENSE_READY', {}), /managers or turn mode/)
    await rejects(save(OUTSIDER, s.gameId, 1, ready, 'OFFENSE_READY', {}), /lab access|not a manager/)
  })

  it('enforces the turn, server dice, and no peeking at a roll', async () => {
    const s = await createGame(true)
    // the defence cannot pitch, or even roll, before the offence readies
    await rejects(rollDie(HOME, s.gameId, 1, 'pitch'), /not your turn/)
    const ready = declareOffenseReady(s)
    await rejects(save(HOME, s.gameId, 1, ready, 'OFFENSE_READY', {}), /not your turn/)
    await save(AWAY, s.gameId, 1, ready, 'OFFENSE_READY', {})
    let state = await loadState(s.gameId)

    await rejects(rollDie(AWAY, s.gameId, 2, 'pitch'), /not your turn/)
    const roll = await rollDie(HOME, s.gameId, 2, 'pitch')
    expect(await rollDie(HOME, s.gameId, 2, 'pitch')).toBe(roll) // no re-roll
    // seen the roll: walking the batter instead is refused
    const ibb = bump(state, beginPrePitchDecision(state, 'INTENTIONAL_WALK'))
    await rejects(save(HOME, s.gameId, 2, ibb, 'DECISION_RESOLVED', { resolutionKind: 'PRE_PITCH_ACTION_STARTED' }), /that roll must be used/)
    // a different number is refused
    const other = roll === 20 ? 1 : roll + 1
    await rejects(save(HOME, s.gameId, 2, resolvePitchRoll(state, other), 'PITCH_ROLLED', { roll: other }), /does not match/)
    await save(HOME, s.gameId, 2, resolvePitchRoll(state, roll), 'PITCH_ROLLED', { roll })
    state = await loadState(s.gameId)
    expect(state.plateAppearance.pitchRoll).toBe(roll)

    // pause and resume belong to neither turn
    await save(HOME, s.gameId, 3, pauseGame(state, HOME), 'GAME_PAUSED', {})
    state = await loadState(s.gameId)
    await save(AWAY, s.gameId, 4, resumeGame(state), 'GAME_RESUMED', {})
  })

  it.each([1925, 77, 4242])('plays a complete game, seed %i, every move by the right manager', async (seed) => {
    const next = rng(seed)
    let state = await createGame(true)
    const id = state.gameId
    let probes = 0
    for (let step = 0; step < 4000 && state.status !== 'complete'; step += 1) {
      const side = sideToAct(state)
      expect(side, `${state.status}/${state.waitingFor}`).not.toBeNull()
      expect(await sqlSideToAct(state)).toBe(side)
      const me = userFor(side as GameSide)
      const v = state.stateVersion
      let after: GameState
      let event: string
      let payload: Record<string, unknown> = {}

      if (state.pendingDecision) {
        decisionsPlayed.add(state.pendingDecision.decisionType)
        const view = getDecisionView(state)
        if (!view) throw new Error(`no view for ${state.pendingDecision.decisionType}`)
        if (view.mode === 'roll') {
          const roll = await rollDie(me, id, v, 'decision')
          after = resolveDecisionRoll(state, roll); event = 'DECISION_RESOLVED'; payload = { resolutionKind: 'ROLL', roll }
        } else {
          after = confirmManagerDecision(state, botSelection(state, next)); event = 'DECISION_RESOLVED'
          payload = { decisionType: state.pendingDecision.decisionType }
        }
      } else if (state.waitingFor === 'PITCH_ROLL') {
        const call = maybeBotPrePitchAction(state, next)
        if (call.pendingDecision) {
          after = call; event = 'DECISION_RESOLVED'; payload = { resolutionKind: 'PRE_PITCH_ACTION_STARTED' }
        } else if (awaitingOffenseReady(state)) {
          after = declareOffenseReady(state); event = 'OFFENSE_READY'
        } else {
          const roll = await rollDie(me, id, v, 'pitch')
          after = resolvePitchRoll(state, roll); event = 'PITCH_ROLLED'; payload = { roll }
        }
      } else if (state.waitingFor === 'SWING_ROLL') {
        const roll = await rollDie(me, id, v, 'swing')
        after = resolveSwingRoll(state, roll); event = 'SWING_RESOLVED'; payload = { roll }
      } else {
        throw new Error(`unhandled state ${state.status}/${state.waitingFor}`)
      }
      after = bump(state, after)

      // the wrong manager making the same move is refused, every kind of move
      if (probes < 40 && step % 3 === 0) {
        probes += 1
        await rejects(save(otherUser(side as GameSide), id, v, after, event, payload), /not your turn|other manager's team/)
      }
      await save(me, id, v, after, event, payload)
      state = await loadState(id)
      expect(state.stateVersion).toBe(v + 1)
    }
    expect(state.status).toBe('complete')

    // rest tracking still fires on completion, for both managers
    const rest = await as(HOME, () => db.query<{ n: number }>(
      `select count(*)::int as n from public.player_rest_state where season_id = 'test-season' and user_id = $1`, [HOME]))
    expect(rest.rows[0].n).toBeGreaterThan(0)
  }, 120_000)

  // The games above are only evidence for the moves they actually made. The
  // ones most likely to trip the other-team rule are roster moves, which
  // rewrite the acting side's pregame -- so they must have been exercised.
  it('the played games covered roster moves and decisions from both sides', () => {
    for (const t of ['PINCH_HITTER_SELECTION', 'DEF_SUB_REPLACEMENT', 'INTENTIONAL_WALK_CONFIRM', 'ENTRY_ATTRIBUTE_MODE'])
      expect([...decisionsPlayed], t).toContain(t)
  })
})
