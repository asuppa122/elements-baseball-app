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

export async function createGameplayLabGame(state: GameState): Promise<PersistedGameplayLabGame> {
  const { data, error } = await supabase
    .from('games')
    .insert({
      id: state.gameId,
      season_id: state.configuration.seasonId,
      season_year: state.configuration.mlbYear,
      status: state.status,
      home_user_id: state.managers.home.userId,
      away_user_id: state.managers.away.userId,
      configuration_snapshot: state.configuration,
      home_roster_snapshot: state.pregame.home.roster,
      away_roster_snapshot: state.pregame.away.roster,
      home_pregame: state.pregame.home,
      away_pregame: state.pregame.away,
      game_state: state,
      state_version: state.stateVersion,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as PersistedGameplayLabGame
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
  eventType: 'PREGAME_SUBMITTED' | 'PREGAME_LOCKED' | 'GAME_READY' | 'GAME_STARTED' | 'PITCH_ROLLED' | 'SWING_RESOLVED' | 'DECISION_RESOLVED' | 'GAME_PAUSED' | 'GAME_RESUMED'
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
