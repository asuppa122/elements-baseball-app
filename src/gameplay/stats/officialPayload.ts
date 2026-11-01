import type { GameSide, GameState } from '../types'
import { buildBoxScore } from './boxScore'

/**
 * What the trusted server sends to gameplay_write_official_stats for one
 * completed official game: every line the statistics module derived from the
 * play log, with decisions folded into the pitching lines. The database
 * re-checks the final score and every card against the saved game, replaces
 * the game's rows, and refuses outright unless the game is official, complete,
 * official tracking is on and the writer switch is on.
 *
 * Bump SCORING_VERSION whenever a scoring definition changes; a re-score of a
 * game replaces its rows under the stated version (STATS_SPEC §1.5).
 */
export const SCORING_VERSION = 1

export function buildOfficialPayload(state: GameState) {
  const box = buildBoxScore(state, 'official')
  if (box.kind !== 'recorded') throw new Error('Only a game with a play record can have official statistics.')
  if (!box.complete) throw new Error('Only a completed game can have official statistics.')
  const { stats, decisions } = box
  const flag = (key: string | null, cardKey: string) => (key === cardKey ? 1 : 0)
  const listed = (list: Array<{ side: GameSide; cardKey: string }>, side: GameSide, cardKey: string) => (list.some((e) => e.side === side && e.cardKey === cardKey) ? 1 : 0)
  const sides: GameSide[] = ['home', 'away']
  const winner = decisions.winner
  const per = <T>(build: (side: GameSide) => T) => Object.fromEntries(sides.map((side) => [side, build(side)])) as Record<GameSide, T>
  return {
    scoringVersion: SCORING_VERSION,
    final: box.final,
    batting: per((side) => stats.batting[side].map((line) => ({ ...line }))),
    pitching: per((side) => stats.pitching[side].map((line) => ({
      ...line,
      QS: listed(box.qualityStarts, side, line.cardKey),
      CG: listed(box.completeGames, side, line.cardKey),
      SHO: listed(box.shutouts, side, line.cardKey),
      W: winner === side ? flag(decisions.W, line.cardKey) : 0,
      L: winner && winner !== side ? flag(decisions.L, line.cardKey) : 0,
      SV: winner === side ? flag(decisions.SV, line.cardKey) : 0,
      HLD: listed(decisions.HLD, side, line.cardKey),
      BSV: listed(decisions.BSV, side, line.cardKey),
    }))),
    fielding: per((side) => stats.fielding[side].map((line) => ({ ...line }))),
  }
}
