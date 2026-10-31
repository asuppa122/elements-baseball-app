import { supabase } from '../lib/supabase'
import { CARD_COLUMNS, type CardRecord, type CardRow } from '../types/card'
import { normalizeImageUrl } from '../utils/cardHelpers'
import type { GameState } from './types'

export type GameplayLabOpponent = {
  user_id: string
  manager_name: string
  avatar_url: string | null
}

export type GameplayLabLineup = {
  id: string
  name: string
  use_dh: boolean
  player_count: number
  total_points: number
  roster_state: {
    assigned?: Record<string, string>
    rosterFormat?: 'compact' | 'standard25' | 'full'
    useDh?: boolean
    seasonEligibleOnly?: boolean
  } | null
  updated_at: string
}

export type PersistedGameplayLabGame = {
  id: string
  season_id: string
  season_year: number
  status: string
  home_user_id: string
  away_user_id: string
  configuration_snapshot: GameState['configuration']
  home_roster_snapshot: GameState['pregame']['home']['roster']
  away_roster_snapshot: GameState['pregame']['away']['roster']
  home_pregame: GameState['pregame']['home']
  away_pregame: GameState['pregame']['away']
  game_state: GameState
  state_version: number
  created_at: string
  updated_at: string
  /** Set by the database from the game itself (20261031). Two-player games count toward the one-game limit. */
  play_mode?: 'two_player' | 'one_screen'
  /**
   * Fixed by the database when the game is created: `prelaunch` while official
   * tracking is off (every game so far), then `official` or `practice`. Only
   * official games feed persistent rest and milestones.
   */
  progression?: 'prelaunch' | 'practice' | 'official'
  ended_at?: string | null
  ended_by_user_id?: string | null
  end_reason?: 'cancelled_before_first_pitch' | 'admin_terminated' | 'practice_cleanup' | null
  end_note?: string | null
}

export async function hasGameplayLabAccess(): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_gameplay_lab_access')
  if (error) throw error
  return Boolean(data)
}

export async function loadGameplayLabOpponents(): Promise<GameplayLabOpponent[]> {
  const { data, error } = await supabase.rpc('list_gameplay_lab_opponents')
  if (error) throw error
  return (data ?? []) as GameplayLabOpponent[]
}

/** Only opponents with gameplay access -- anyone else could not even open the game. */
export async function loadGameplayOpponents(): Promise<GameplayLabOpponent[]> {
  const { data, error } = await supabase.rpc('list_gameplay_opponents')
  if (error) throw error
  return (data ?? []) as GameplayLabOpponent[]
}

export type RollKind = 'pitch' | 'swing' | 'decision'

/**
 * A die rolled by the server for a two-player game. One roll per (game, state
 * version, kind): asking again returns the same number, so a refresh or a
 * double-click cannot re-roll, and the save is refused unless it uses it.
 */
export async function rollGameplayDie(gameId: string, stateVersion: number, kind: RollKind): Promise<number> {
  const { data, error } = await supabase.rpc('roll_gameplay_die', {
    p_game_id: gameId, p_state_version: stateVersion, p_kind: kind,
  })
  if (error) throw error
  return Number(data)
}

/** Cheap check for "did the other manager move?" -- the version only. */
export async function loadGameplayLabGameVersion(gameId: string): Promise<number> {
  const { data, error } = await supabase.from('games').select('state_version').eq('id', gameId).single()
  if (error) throw error
  return Number(data.state_version)
}

export type GameplayActiveRoster = {
  user_id: string
  manager_name: string
  avatar_url: string | null
  lineup_id: string | null
  lineup_name: string | null
  use_dh: boolean | null
  player_count: number | null
  total_points: number | null
  roster_state: GameplayLabLineup['roster_state']
  updated_at: string | null
}

export async function loadGameplayActiveRosters(): Promise<GameplayActiveRoster[]> {
  const { data, error } = await supabase.rpc('list_gameplay_active_rosters')
  if (error) throw error
  return (data ?? []) as GameplayActiveRoster[]
}

export async function loadOwnGameplayLineups(): Promise<GameplayLabLineup[]> {
  const { data, error } = await supabase
    .from('lineups')
    .select('id, name, use_dh, player_count, total_points, roster_state, updated_at')
    .order('sort_order')
    .order('created_at')

  if (error) throw error
  return (data ?? []) as GameplayLabLineup[]
}

export async function loadCardsForGameplayRoster(cardKeys: string[]): Promise<CardRecord[]> {
  const uniqueKeys = [...new Set(cardKeys.filter(Boolean))]
  if (uniqueKeys.length === 0) return []

  const [{ data: cardRows, error: cardError }, { data: imageRows, error: imageError }] = await Promise.all([
    supabase
      .from('cards')
      .select(CARD_COLUMNS)
      .in('card_key', uniqueKeys),
    supabase
      .from('card_images')
      .select('card_key, image_url')
      .in('card_key', uniqueKeys),
  ])

  if (cardError) throw cardError
  if (imageError) throw imageError

  const images = new Map<string, string>()
  for (const image of imageRows ?? []) {
    const normalized = normalizeImageUrl(image.image_url)
    if (image.card_key && normalized) images.set(image.card_key, normalized)
  }

  return ((cardRows ?? []) as CardRow[]).map((card) => ({
    ...card,
    image_url: images.get(card.card_key) ?? null,
  }))
}

/**
 * The calling manager's own persistent Ftg/Rm rest rows for a season, keyed
 * by card_key. RLS already scopes this to the authenticated user's own
 * rows -- there is no user_id filter here because there does not need to be
 * one; a manager cannot fetch an opponent's rest state through this call
 * regardless of what's asked for. A missing card_key means fully rested
 * (0/0), not an error -- the caller (attachRestState) already treats a
 * missing entry that way, so no row is synthesized here for cards that have
 * never played.
 */
export async function loadPlayerRestState(
  seasonId: string,
  cardKeys: string[],
): Promise<Record<string, { hitterGamesRemaining: number; pitcherGamesRemaining: number }>> {
  const uniqueKeys = [...new Set(cardKeys.filter(Boolean))]
  if (uniqueKeys.length === 0) return {}

  const { data, error } = await supabase
    .from('player_rest_state')
    .select('card_key, hitter_games_remaining, pitcher_games_remaining')
    .eq('season_id', seasonId)
    .in('card_key', uniqueKeys)

  if (error) throw error

  const result: Record<string, { hitterGamesRemaining: number; pitcherGamesRemaining: number }> = {}
  for (const row of data ?? []) {
    result[row.card_key] = {
      hitterGamesRemaining: row.hitter_games_remaining,
      pitcherGamesRemaining: row.pitcher_games_remaining,
    }
  }
  return result
}

/**
 * Creates a game through the server, which enforces one active competitive
 * game per manager (20261031_gameplay_one_active_game.sql). A refusal for
 * that reason comes back as an ActiveGameConflict.
 */
export async function createGameplayLabGame(state: GameState): Promise<PersistedGameplayLabGame> {
  const { data, error } = await supabase.rpc('create_gameplay_game', { p_state: state })
  if (error) throw activeGameConflict(error) ?? error
  return data as PersistedGameplayLabGame
}

/** Who is already in an unfinished competitive game, and which one. */
export class ActiveGameConflict extends Error {
  readonly who: 'you' | 'opponent'
  readonly gameId: string | null
  constructor(who: 'you' | 'opponent', gameId: string | null) {
    super(who === 'you'
      ? 'You already have an active game. Finish or exit that game before starting another.'
      : 'That manager is already playing another unfinished game. Choose a different opponent, or wait until their game ends.')
    this.who = who
    this.gameId = gameId
  }
}

export function activeGameConflict(error: unknown): ActiveGameConflict | null {
  const e = error as { message?: string; hint?: string } | null
  if (e?.message === 'ACTIVE_GAME_HOME') return new ActiveGameConflict('you', e.hint || null)
  if (e?.message === 'ACTIVE_GAME_AWAY') return new ActiveGameConflict('opponent', e.hint || null)
  return null
}

export type ActiveGame = { game_id: string; status: string; side: 'home' | 'away'; opponent_name: string | null }

/** The signed-in manager's unfinished competitive game, if any. */
export async function loadMyActiveGame(): Promise<ActiveGame | null> {
  const { data, error } = await supabase.rpc('get_my_active_game')
  if (error) throw error
  return ((data as ActiveGame[] | null) ?? [])[0] ?? null
}

/** Either manager, before the first pitch. No result; both managers are released. */
export async function cancelGameplayGame(gameId: string): Promise<PersistedGameplayLabGame> {
  const { data, error } = await supabase.rpc('cancel_gameplay_game', { p_game_id: gameId })
  if (error) throw error
  return data as PersistedGameplayLabGame
}

/** Gameplay admins only: ends a stuck game without a result, with a reason. */
export async function terminateGameplayGame(gameId: string, reason: string): Promise<PersistedGameplayLabGame> {
  const { data, error } = await supabase.rpc('terminate_gameplay_game', { p_game_id: gameId, p_reason: reason })
  if (error) throw error
  return data as PersistedGameplayLabGame
}

export type GameplayPermissions = {
  /** May create one-screen test games (Anthony, Will). */
  can_create_test_games: boolean
  /** May end a game without a result (Anthony). */
  can_terminate_games: boolean
  /** Off until Anthony declares Elements Baseball live; nothing counts while off. */
  official_tracking_enabled: boolean
}

export async function loadGameplayPermissions(): Promise<GameplayPermissions> {
  const { data, error } = await supabase.rpc('get_my_gameplay_permissions')
  if (error) throw error
  const row = ((data as GameplayPermissions[] | null) ?? [])[0]
  return row ?? { can_create_test_games: false, can_terminate_games: false, official_tracking_enabled: false }
}

export async function loadGameplayLabGames(): Promise<PersistedGameplayLabGame[]> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as PersistedGameplayLabGame[]
}


export async function loadGameplayLabGame(gameId: string): Promise<PersistedGameplayLabGame> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single()

  if (error) throw error
  return data as PersistedGameplayLabGame
}

export async function saveGameplayLabState(args: {
  gameId: string
  expectedStateVersion: number
  nextState: GameState
  eventType: 'PREGAME_SUBMITTED' | 'PREGAME_LOCKED' | 'GAME_READY' | 'GAME_STARTED' | 'OFFENSE_READY' | 'PITCH_ROLLED' | 'SWING_RESOLVED' | 'DECISION_RESOLVED' | 'GAME_RESUMED'
  eventPayload?: Record<string, unknown>
}): Promise<PersistedGameplayLabGame> {
  const { data, error } = await supabase.rpc('save_gameplay_lab_state', {
    p_game_id: args.gameId,
    p_expected_state_version: args.expectedStateVersion,
    p_next_state: args.nextState,
    p_event_type: args.eventType,
    p_event_payload: args.eventPayload ?? {},
  })

  if (error) throw error
  return data as PersistedGameplayLabGame
}


export type GameplayLabEvent = {
  id: string
  game_id: string
  state_version: number
  event_type: string
  actor_user_id: string | null
  payload: Record<string, unknown>
  created_at: string
}

export async function loadGameplayLabEvents(gameId: string): Promise<GameplayLabEvent[]> {
  const { data, error } = await supabase
    .from('game_events')
    .select('id, game_id, state_version, event_type, actor_user_id, payload, created_at')
    .eq('game_id', gameId)
    .order('state_version', { ascending: true })
  if (error) throw error
  return (data ?? []) as GameplayLabEvent[]
}
