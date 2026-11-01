import { defensiveOutsRecorded } from './engine'
import { outsPitched } from './pitcherMound'
import { pitcherInstanceKey, readPitcherStateValue } from './pitcherStateKey'
import { usesRulesV2 } from './rulesVersion'
import type { GameSide, GameState, PitcherRestFacts } from './types'

/**
 * Per-pitcher facts the post-game rest rules need, kept as the game is played
 * (rules v2). The trusted rest calculation (restRules.ts, and its SQL twin in
 * the server writer) reads them at completion:
 *
 * - efficiency (Rulebook §8 IX-B; Anthony 2026-11-01): BF >= 1 and BF <= outs;
 * - relief distance (IX-C; ruling 7): a reliever past card IP and past 3 outs;
 * - negative Control (IX-C): started at Control 1+ and threw a pitch at -1 or lower.
 *
 * Outs come from the mound bookkeeping (pitcherMound.ts), not from here.
 */

function blank(state: GameState, side: GameSide, cardKey: string): PitcherRestFacts {
  return {
    starter: state.pregame[side].startingPitcherCardKey === cardKey,
    battersFaced: 0,
    controlAtFirstPitch: null,
    pitchedAtNegativeControl: false,
  }
}

function update(state: GameState, side: GameSide, cardKey: string, change: (facts: PitcherRestFacts) => PitcherRestFacts): GameState {
  if (!usesRulesV2(state)) return state
  const key = pitcherInstanceKey(side, cardKey)
  const current = state.pitcherRestFacts?.[key] ?? blank(state, side, cardKey)
  return { ...state, pitcherRestFacts: { ...(state.pitcherRestFacts ?? {}), [key]: change(current) } }
}

/** A completed plate appearance against him. */
export function recordPlateAppearanceFacts(state: GameState, side: GameSide, pitcherKey: string | null): GameState {
  if (!pitcherKey) return state
  return update(state, side, pitcherKey, (facts) => ({ ...facts, battersFaced: facts.battersFaced + 1 }))
}

/** A pitch roll (or automatic advantage) thrown at `effectiveControl`. */
export function recordPitchFacts(state: GameState, side: GameSide, pitcherKey: string | null, effectiveControl: number): GameState {
  if (!pitcherKey) return state
  return update(state, side, pitcherKey, (facts) => ({
    ...facts,
    controlAtFirstPitch: facts.controlAtFirstPitch ?? effectiveControl,
    pitchedAtNegativeControl: facts.pitchedAtNegativeControl || effectiveControl <= -1,
  }))
}

export function restFactsFor(state: GameState, side: GameSide, cardKey: string): PitcherRestFacts | null {
  return state.pitcherRestFacts?.[pitcherInstanceKey(side, cardKey)] ?? null
}

/**
 * At completion: each pitcher's outs for the game, for the rest rules (the
 * server reads them from the saved state). Every stint counts (MLB 5.10).
 */
export function finalizeRestFacts(state: GameState): GameState {
  if (!usesRulesV2(state) || !state.pitcherRestFacts) return state
  const facts = { ...state.pitcherRestFacts }
  for (const key of Object.keys(facts)) {
    const [side, cardKey] = key.split('::') as [GameSide, string]
    const defensiveOuts = defensiveOutsRecorded(state, side)
    const entry = readPitcherStateValue(state.pitcherEntryDefenseOuts, side, cardKey) ?? 0
    const exit = readPitcherStateValue(state.pitcherExitDefenseOuts, side, cardKey)
    const outs = outsPitched(state, side, cardKey) ?? Math.max(0, (exit ?? defensiveOuts) - entry)
    facts[key] = { ...facts[key], outsRecorded: outs }
  }
  return { ...state, pitcherRestFacts: facts }
}
