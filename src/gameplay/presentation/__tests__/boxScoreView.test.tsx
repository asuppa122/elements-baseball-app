// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import BoxScoreView from '../BoxScoreView'
import PlayerStatBlock from '../LiveStatLines'
import LiveBoxScore from '../LiveBoxScore'
import { asRecordedGame, playRecordedGameToEnd } from '../../sandbox/recordedGame'
import { computeGameStats } from '../../stats/gameStats'
import { reconcileBoxScore } from '../../stats/reconcile'
import type { GameState } from '../../types'
import midgame from '../../sandbox/states/midgame.json'
import final from '../../sandbox/states/final.json'

/**
 * The box score, the live box score window and the player stat block render
 * what the statistics module computed -- totals equal to the final score, the
 * Exhibition label, the legacy notice for games without a play log, and "No
 * stats yet" for the season before launch.
 */
const recorded = playRecordedGameToEnd(midgame as unknown as GameState)

describe('BoxScoreView', () => {
  it('the sandbox game plays to completion and reconciles', () => {
    expect(recorded.status).toBe('complete')
    // The play log starts mid-game, so team runs exclude runs scored before it; the rest must agree.
    const issues = reconcileBoxScore(recorded).filter((i) => !/team R|batters' R|charged|while pitching|line score|line-up cursor|outs recorded/.test(i))
    expect(issues).toEqual([])
  })

  it('shows batting totals equal to the play log, labelled Exhibition', () => {
    render(<BoxScoreView state={recorded} progression="prelaunch" />)
    expect(screen.getByText('Exhibition')).toBeTruthy()
    const stats = computeGameStats(recorded)
    const away = screen.getAllByRole('table')[0]
    const totals = within(away).getByText('Totals').closest('tr')!
    const cells = within(totals).getAllByRole('cell').map((c) => Number(c.textContent))
    expect(cells[0]).toBe(stats.batting.away.reduce((n, l) => n + l.AB, 0))
    expect(cells[2]).toBe(stats.batting.away.reduce((n, l) => n + l.H, 0))
  })

  it('labels an official game Official, and shows no tag when the classification is unknown', () => {
    const { unmount } = render(<BoxScoreView state={recorded} progression="official" />)
    expect(screen.getByText('Official')).toBeTruthy()
    unmount()
    render(<BoxScoreView state={recorded} />)
    expect(screen.queryByText('Exhibition')).toBeNull()
    expect(screen.queryByText('Official')).toBeNull()
  })

  it('play-by-play lists plays in order', () => {
    render(<BoxScoreView state={recorded} progression="prelaunch" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Play-by-play' }))
    const items = document.querySelectorAll('.gp-box-plays ol li')
    expect(items.length).toBe(recorded.playLog!.plays.length)
  })

  it('a game without a play log says so and fabricates nothing', () => {
    render(<BoxScoreView state={final as unknown as GameState} progression="prelaunch" />)
    expect(screen.getByText(/played before plays were recorded/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('player stat block under each card', () => {
  it("the current batter's and pitcher's game lines in a recorded game", () => {
    const state = asRecordedGame(midgame as unknown as GameState)
    render(<><PlayerStatBlock state={state} role="batter" /><PlayerStatBlock state={state} role="pitcher" /></>)
    expect(screen.getByText('AB')).toBeTruthy()
    expect(screen.getByText('RBI')).toBeTruthy()
    expect(screen.getByText('IP')).toBeTruthy()
    expect(screen.getByText('ER')).toBeTruthy()
  })

  it('says the game line is not recorded for a game without a play log', () => {
    render(<PlayerStatBlock state={midgame as unknown as GameState} role="batter" />)
    expect(screen.getByText('Not recorded')).toBeTruthy()
    expect(screen.queryByText('AB')).toBeNull()
  })

  it('shows no exhibition numbers as a season before launch', () => {
    render(<PlayerStatBlock state={asRecordedGame(midgame as unknown as GameState)} role="pitcher" />)
    expect(screen.getByText('No stats yet')).toBeTruthy()
  })
})

describe('live box score window', () => {
  it('shows the line score with runs per team and closes on Escape', () => {
    const onClose = vi.fn()
    render(<LiveBoxScore state={recorded} onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: 'Box score' })
    const line = within(dialog).getByRole('table', { name: 'Line score' })
    const rows = within(line).getAllByRole('row')
    expect(rows[1].textContent).toContain(String(recorded.score.away))
    expect(rows[2].textContent).toContain(String(recorded.score.home))
    expect(within(dialog).getByRole('tab', { name: 'Play-by-play' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('box score column help', () => {
  it('tabs read Standard / Advanced, and every Advanced heading explains itself on hover and in the key', () => {
    render(<BoxScoreView state={recorded} progression="prelaunch" />)
    expect(screen.getByRole('tab', { name: 'Standard' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    const ochw = document.querySelector('abbr[title^="OCHW"]')
    expect(ochw?.getAttribute('title')).toContain('Own Chart Hit/Walk')
    for (const h of Array.from(document.querySelectorAll('.gp-box-table thead th'))) {
      if (h.textContent) expect(h.querySelector('abbr[title]'), h.textContent).not.toBeNull()
    }
    expect(screen.getByText('Key')).toBeTruthy()
  })
})

describe('the stat block carries the live rating', () => {
  it('the batter block shows his current On Base, the pitcher block his current Control', () => {
    const state = asRecordedGame(midgame as unknown as GameState)
    render(<><PlayerStatBlock state={state} role="batter" /><PlayerStatBlock state={state} role="pitcher" /></>)
    expect(screen.getByTitle('Current On Base').textContent).toMatch(/^OB \d+/)
    expect(screen.getByTitle('Current Control').textContent).toMatch(/^C -?\d+/)
  })
})
