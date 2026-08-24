import type { GameSide } from './types'

export function pitcherInstanceKey(side: GameSide, cardKey: string): string {
  return `${side}::${cardKey}`
}

export function readPitcherStateValue(record: Record<string, number> | undefined, side: GameSide, cardKey: string): number | undefined {
  if (!record) return undefined
  const scoped = record[pitcherInstanceKey(side, cardKey)]
  if (scoped !== undefined) return scoped
  // Backward compatibility for games created before pitcher state was side-scoped.
  return record[cardKey]
}
