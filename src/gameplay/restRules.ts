import { cardIpOuts } from './fatigueEngine'
import { restFactsFor } from './restFacts'
import type { PitcherRestAdjustments } from './restTracking'
import { usesRulesV2 } from './rulesVersion'
import type { GameSide, GameState } from './types'

/**
 * The three Rulebook §8 pitcher rest adjustments for a rules-v2 game (Anthony,
 * 2026-11-01), decided from the facts the game kept (restFacts.ts). The SQL
 * writer applies the same decisions server-side and is authoritative; this is
 * the same rule for previews, pinned to it by restRulesSql.test.ts.
 *
 * - Relief distance +1 (IX-C; ruling 7): not the starter, outs > 3 and outs
 *   > card-IP outs (strictly beyond).
 * - Efficiency -1 (IX-B; audit decision 7): BF >= 1 and BF <= outs, and not
 *   back-to-back (appeared in this GM's previous completed official game).
 * - Negative Control +1 (IX-C): effective Control 1+ at his first pitch and at
 *   least one pitch thrown at -1 or lower.
 */
export function decidePitcherRestAdjustments(input: {
  starter: boolean
  outs: number
  battersFaced: number
  cardIp: number | null
  controlAtFirstPitch: number | null
  pitchedAtNegativeControl: boolean
  backToBack: boolean
}): PitcherRestAdjustments {
  return {
    reliefDistance: !input.starter && input.outs > 3 && input.outs > cardIpOuts(input.cardIp) ? 1 : 0,
    efficiency: input.battersFaced >= 1 && input.battersFaced <= input.outs && !input.backToBack,
    negativeControl: (input.controlAtFirstPitch ?? -99) >= 1 && input.pitchedAtNegativeControl ? 1 : 0,
  }
}

/** The adjustments for one pitcher of a finished game, or undefined for v1 games / pitchers without facts. */
export function pitcherRestAdjustmentsFor(state: GameState, side: GameSide, cardKey: string, backToBack = false): PitcherRestAdjustments | undefined {
  if (!usesRulesV2(state)) return undefined
  const facts = restFactsFor(state, side, cardKey)
  if (!facts) return undefined
  return decidePitcherRestAdjustments({
    starter: facts.starter,
    outs: facts.outsRecorded ?? 0,
    battersFaced: facts.battersFaced,
    cardIp: state.pregame[side].roster?.cards[cardKey]?.pitcher.ip ?? null,
    controlAtFirstPitch: facts.controlAtFirstPitch,
    pitchedAtNegativeControl: facts.pitchedAtNegativeControl,
    backToBack,
  })
}
