// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import GameLogPanel, { type LogEvent } from '../GameLogPanel'

/**
 * The game log reads like a scorer's sheet: one line per roll, the runs as
 * they score and the score right after them -- all from what each saved
 * event recorded.
 */

const managers = { away: 'Will', home: 'Anthony' }
const runner = (cardKey: string, playerName: string) => ({ cardKey, playerName })
const base = { inning: 1, half: 'top', batter: 'Joe Morgan', pitcher: 'Chuck Smith', score: { away: 0, home: 0 }, resultingScore: { away: 0, home: 0 } }

function texts(events: LogEvent[]) {
  render(<GameLogPanel events={events} managers={managers} />)
  return screen.getAllByRole('listitem').map((li) => li.textContent)
}

describe('game log', () => {
  it('a pitch roll names the roll, the Control and who has the advantage', () => {
    expect(texts([{
      state_version: 1, event_type: 'PITCH_ROLLED',
      payload: { ...base, roll: 10, rollView: { title: 'Pitch', roll: 10, modifiers: [{ label: 'Chuck Smith Control', value: 5 }], result: 'Pitcher advantage', tone: 'defense' } },
    }])).toEqual(['Roll: (10) +5, Advantage: Chuck Smith'])
  })

  it('a swing names the batter, the result and the pitcher; the runs follow with the score', () => {
    const lines = texts([{
      state_version: 2, event_type: 'SWING_RESOLVED',
      payload: {
        ...base, roll: 20, chartResult: 'HR',
        bases: { first: runner('A1', 'Rickey Henderson'), second: runner('A2', 'Rodney Scott'), third: null },
        resultingBases: { first: null, second: null, third: null },
        resultingScore: { away: 3, home: 0 },
        rollView: { title: 'Swing', roll: 20, modifiers: [], result: 'HR — homers', tone: 'offense' },
      },
    }])
    expect(lines).toEqual([
      'Roll: (20) Joe Morgan: Home run [Smith]',
      'Rodney Scott: Scored',
      'Rickey Henderson: Scored',
      'Joe Morgan: Scored',
      'Score: Will 3 – 0 Anthony',
    ])
  })

  it('a decision roll shows its modifiers, what it did and the total', () => {
    expect(texts([{
      state_version: 3, event_type: 'DECISION_RESOLVED',
      payload: {
        ...base, roll: 11, resolutionKind: 'ROLL',
        rollView: { title: 'Steal', roll: 11, modifiers: [{ label: 'CA', value: 5 }], total: 16, result: 'Safe', tone: 'offense' },
        play: { lines: ['Eric Young steals second.'], summary: 'Young steals second', paKey: 'x', runs: 0, kind: 'neutral' },
      },
    }])).toEqual(['Roll: (11) CA +5, Young steals second (16)'])
  })

  it('an automatic pitcher advantage, and the current half-inning on top', () => {
    render(<GameLogPanel managers={managers} events={[
      { state_version: 1, event_type: 'DECISION_RESOLVED', payload: { ...base, resolutionKind: 'AUTOMATIC_PITCHER_ADVANTAGE' } },
      { state_version: 2, event_type: 'DECISION_RESOLVED', payload: { ...base, half: 'bottom', pitcher: 'Nelson Dean', resolutionKind: 'AUTOMATIC_PITCHER_ADVANTAGE' } },
    ]} />)
    const headings = screen.getAllByRole('heading').map((h) => h.textContent)
    expect(headings).toEqual(['Bottom 1st · Anthony batting (Current)', 'Top 1st · Will batting'])
    expect(screen.getByText('No pitch, Advantage: Nelson Dean')).toBeTruthy()
  })

  it('leaves out steps that are not plays', () => {
    render(<GameLogPanel managers={managers} events={[{ state_version: 1, event_type: 'OFFENSE_READY', payload: { ...base } }]} />)
    expect(screen.getByText('No plays yet.')).toBeTruthy()
  })
})
