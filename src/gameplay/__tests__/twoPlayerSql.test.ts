// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { buildNonGbCoverageFixture } from '../rulebookCoverage'
import { attachPregameRoster, createInitialGameState, declareOffenseReady, lockPregame, resolvePitchRoll, resolveSwingRoll, resumeGame, setPregameSelections, startGame } from '../engine'
import { beginPrePitchDecision, confirmManagerDecision, getDecisionView, resolveDecisionRoll } from '../decisionEngine'
import { awaitingOffenseReady, sideToAct } from '../turnOrder'
import { botSelection, maybeBotPrePitchAction } from '../testHarness'
import type { GameSide, GameState } from '../types'
import { createGameplayDevDb, DEV_USERS, type DevDb } from '../devDb'

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

const HOME = DEV_USERS.home
const AWAY = DEV_USERS.away
const OUTSIDER = DEV_USERS.outsider

let dev: DevDb

async function save(userId: string, gameId: string, expected: number, next: GameState, eventType: string, payload: Record<string, unknown>) {
  return dev.save(userId, { gameId, expectedStateVersion: expected, nextState: next, eventType, eventPayload: payload })
}

const rollDie = (userId: string, gameId: string, version: number, kind: 'pitch' | 'swing' | 'decision') =>
  dev.roll(userId, gameId, version, kind)

async function loadState(gameId: string): Promise<GameState> {
  return (await dev.load(HOME, gameId)).game_state
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
  s.configuration.seasonId = 'test-season'
  await dev.createGame(HOME, s)
  return s
}

/** A state as the removed pauseGame() wrote it: the status it was paused from is kept. */
const legacyPaused = (prev: GameState, by: string): GameState => ({
  ...prev, status: 'paused', stateVersion: prev.stateVersion + 1,
  paused: { pausedAt: '2026-10-30T00:00:00.000Z', pausedByUserId: by, resumeStatus: prev.status === 'paused' ? null : prev.status },
})

const userFor = (side: GameSide) => (side === 'home' ? HOME : AWAY)
const otherUser = (side: GameSide) => (side === 'home' ? AWAY : HOME)
const bump = (prev: GameState, next: GameState): GameState =>
  next.stateVersion > prev.stateVersion ? next : { ...next, stateVersion: prev.stateVersion + 1 }

beforeAll(async () => { dev = await createGameplayDevDb() }, 60_000)

describe('two-player migration (real Postgres)', () => {
  it('lists only opponents who can play', async () => {
    await dev.load(HOME, '00000000-0000-0000-0000-000000000000').catch(() => undefined) // sets the session user
    const r = await dev.db.query<{ manager_name: string }>('select manager_name from public.list_gameplay_opponents()')
    expect(r.rows.map((x) => x.manager_name)).toEqual(['Will'])
  })

  it('leaves one-screen lab games on the old rule: home writes, away cannot', async () => {
    const s = await createGame(false)
    const next = resolvePitchRoll(s, 12)
    await rejects(save(AWAY, s.gameId, 1, next, 'PITCH_ROLLED', { roll: 12 }), /does not belong/)
    await save(HOME, s.gameId, 1, next, 'PITCH_ROLLED', { roll: 12 })
    await rejects(rollDie(HOME, s.gameId, 2, 'swing'), /only used in two-player/)
  })

  it('runs the two-sided pregame: away attaches its own roster, both lock, either starts', async () => {
    const fixture = buildNonGbCoverageFixture()
    const initial = createInitialGameState({
      gameId: '20000000-0000-4000-8000-000000000001',
      configuration: { ...fixture.configuration, seasonId: 'test-season' },
      homeManager: { userId: HOME, managerName: 'Anthony' },
      awayManager: { userId: AWAY, managerName: 'Will' },
    })
    initial.turnHandshake = true
    const created = attachPregameRoster(initial, 'home', fixture.pregame.home.roster!)
    await dev.createGame(HOME, created)
    const id = created.gameId
    let state = await loadState(id)

    // nobody may attach or edit the other side's roster
    await rejects(save(HOME, id, state.stateVersion, attachPregameRoster(state, 'away', fixture.pregame.away.roster!), 'PREGAME_SUBMITTED', {}), /other manager's team/)

    const pick = (side: GameSide) => ({
      startingPitcherCardKey: fixture.pregame[side].startingPitcherCardKey!,
      battingOrderCardKeys: fixture.pregame[side].battingOrderCardKeys,
      defensiveAlignment: fixture.pregame[side].defensiveAlignment,
      defaultBatterCardKeys: [],
    })
    const step = async (user: string, next: GameState, event: string) => {
      await save(user, id, state.stateVersion, next, event, {})
      state = await loadState(id)
    }
    await step(AWAY, attachPregameRoster(state, 'away', fixture.pregame.away.roster!), 'PREGAME_SUBMITTED')
    await rejects(save(AWAY, id, state.stateVersion, setPregameSelections(state, 'home', pick('home')), 'PREGAME_SUBMITTED', {}), /other manager's team/)
    await step(AWAY, setPregameSelections(state, 'away', pick('away')), 'PREGAME_SUBMITTED')
    await step(AWAY, lockPregame(state, 'away'), 'PREGAME_LOCKED')
    expect(state.status).toBe('pregame')
    await step(HOME, setPregameSelections(state, 'home', pick('home')), 'PREGAME_SUBMITTED')
    await step(HOME, lockPregame(state, 'home'), 'PREGAME_LOCKED')
    expect(state.status).toBe('ready')
    await step(AWAY, startGame(state), 'GAME_STARTED')
    expect(state.status).toBe('in_progress')
    expect(sideToAct(state)).toBe('away') // top of the 1st: the visitors ready up first
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

    // A game paused before Pause was removed (the server still holds the
    // status and accepts the old event, so such games exist): resuming it
    // belongs to neither turn -- either manager may -- and to nobody else.
    await save(HOME, s.gameId, 3, legacyPaused(state, HOME), 'GAME_PAUSED', {})
    state = await loadState(s.gameId)
    expect(state.status).toBe('paused')
    await rejects(save(OUTSIDER, s.gameId, 4, resumeGame(state), 'GAME_RESUMED', {}), /not a manager|access is not enabled/)
    await save(AWAY, s.gameId, 4, resumeGame(state), 'GAME_RESUMED', {})
    state = await loadState(s.gameId)
    expect(state.status).toBe('in_progress')
    expect(state.plateAppearance.pitchRoll).toBe(roll)
  })

  it('resumes a one-screen game paused before Pause was removed for its home tester only', async () => {
    const s = await createGame(false)
    await save(HOME, s.gameId, s.stateVersion, legacyPaused(s, HOME), 'GAME_PAUSED', {})
    let state = await loadState(s.gameId)
    expect(state.status).toBe('paused')
    // its away manager is only a name in a one-screen game
    await rejects(save(AWAY, s.gameId, state.stateVersion, resumeGame(state), 'GAME_RESUMED', {}), /does not belong/)
    await save(HOME, s.gameId, state.stateVersion, resumeGame(state), 'GAME_RESUMED', {})
    state = await loadState(s.gameId)
    expect(state.status).toBe(s.status)
    expect(state.paused).toEqual({ pausedAt: null, pausedByUserId: null, resumeStatus: null })
  })

  it.each([1925, 77, 4242])('plays a complete game, seed %i, every move by the right manager', async (seed) => {
    const next = rng(seed)
    let state = await createGame(true)
    const id = state.gameId
    let probes = 0
    for (let step = 0; step < 4000 && state.status !== 'complete'; step += 1) {
      const side = sideToAct(state)
      expect(side, `${state.status}/${state.waitingFor}`).not.toBeNull()
      expect(await dev.sideToAct(state)).toBe(side)
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
    await dev.load(HOME, id) // sets the session user for RLS
    const rest = await dev.db.query<{ n: number }>(
      `select count(*)::int as n from public.player_rest_state where season_id = 'test-season' and user_id = $1`, [HOME])
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
