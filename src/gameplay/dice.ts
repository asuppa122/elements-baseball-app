export interface DiceProvider {
  rollD20(): number
}

export class RandomDiceProvider implements DiceProvider {
  rollD20(): number {
    return Math.floor(Math.random() * 20) + 1
  }
}

/**
 * Development/test-only deterministic provider. It is intentionally not wired to
 * any public UI. Scenario tests can queue exact d20 results without changing the
 * production game rules, where all rolls occur inside the app.
 */
export class QueuedTestDiceProvider implements DiceProvider {
  private readonly rolls: number[]

  constructor(rolls: number[]) {
    if (rolls.some((roll) => !Number.isInteger(roll) || roll < 1 || roll > 20)) {
      throw new Error('Queued test d20 rolls must be integers from 1 through 20.')
    }

    this.rolls = [...rolls]
  }

  rollD20(): number {
    const nextRoll = this.rolls.shift()

    if (nextRoll === undefined) {
      throw new Error('No deterministic test rolls remain in the queue.')
    }

    return nextRoll
  }

  remaining(): number {
    return this.rolls.length
  }
}
