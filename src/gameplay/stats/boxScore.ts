import type { GameSide, GameState } from '../types'
import { computeDecisions, type PitcherDecisions } from './decisions'
import { computeGameStats, hasPlayRecord, type GameStats } from './gameStats'

/**
 * The box score of one game, derived on demand from its saved play log --
 * the same function for a finished game, a game in progress and the official
 * writer, so a box score can never disagree with the statistics. Reading it
 * writes nothing and never triggers progression (STATS_SPEC §11).
 *
 * Games created before the play log (rules v1) get a `legacy` summary of what
 * their saved state reliably holds -- final score, line score, the pitchers
 * used -- and nothing reconstructed or guessed.
 */

export type GameClassification = 'exhibition' | 'official'

export type BoxScore =
  | {
      kind: 'recorded'
      gameId: string
      classification: GameClassification
      complete: boolean
      final: Record<GameSide, number>
      stats: GameStats
      decisions: PitcherDecisions
      qualityStarts: string[]
      completeGames: string[]
      shutouts: string[]
      names: Record<string, string>
    }
  | {
      kind: 'legacy'
      gameId: string
      classification: GameClassification
      complete: boolean
      final: Record<GameSide, number>
      runsByInning: Record<GameSide, number[]> | null
      pitchersUsed: Record<GameSide, string[]>
      names: Record<string, string>
    }

/** Exhibition vs official: only a game the server classified `official` is official (Anthony, 2026-11-01). */
export function classifyProgression(progression: string | null | undefined): GameClassification {
  return progression === 'official' ? 'official' : 'exhibition'
}

function namesFor(state: GameState): Record<string, string> {
  const names: Record<string, string> = {}
  for (const side of ['away', 'home'] as GameSide[]) {
    for (const card of Object.values(state.pregame[side].roster?.cards ?? {})) names[card.cardKey] = card.playerName
  }
  return names
}


export function buildBoxScore(state: GameState, progression?: string | null): BoxScore {
  const classification = classifyProgression(progression)
  const complete = state.status === 'complete'
  const names = namesFor(state)
  if (!hasPlayRecord(state)) {
    const pitchersUsed: Record<GameSide, string[]> = { away: [], home: [] }
    for (const side of ['away', 'home'] as GameSide[]) {
      const starter = state.pregame[side].startingPitcherCardKey
      const keys = new Set<string>(starter ? [starter] : [])
      for (const key of Object.keys(state.pitcherEntryDefenseOuts ?? {})) {
        const [owner, card] = key.includes('::') ? key.split('::') : [null, key]
        if (owner === side && card) keys.add(card)
      }
      pitchersUsed[side] = [...keys]
    }
    return { kind: 'legacy', gameId: state.gameId, classification, complete, final: { ...state.score }, runsByInning: state.runsByInning ?? null, pitchersUsed, names }
  }

  const stats = computeGameStats(state)
  const decisions = computeDecisions({ plays: stats.plays, pitching: stats.pitching, final: state.score, complete })
  const qualityStarts: string[] = []
  const completeGames: string[] = []
  const shutouts: string[] = []
  for (const side of ['away', 'home'] as GameSide[]) {
    const lines = stats.pitching[side]
    const starter = lines.find((l) => l.entryOrder === 0)
    if (!starter) continue
    if (starter.outs >= 18 && starter.ER <= 3) qualityStarts.push(starter.cardKey)
    if (complete && lines.length === 1) {
      completeGames.push(starter.cardKey)
      const opponent = side === 'home' ? 'away' : 'home'
      if (state.score[opponent] === 0) shutouts.push(starter.cardKey)
    }
  }
  return { kind: 'recorded', gameId: state.gameId, classification, complete, final: { ...state.score }, stats, decisions, qualityStarts, completeGames, shutouts, names }
}
