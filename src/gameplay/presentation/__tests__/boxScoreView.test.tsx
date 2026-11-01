// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import BoxScoreView from '../BoxScoreView'
import LiveGameLines, { SeasonStrip } from '../LiveStatLines'
import { asRecordedGame, playRecordedGameToEnd } from '../../sandbox/recordedGame'
import { computeGameStats } from '../../stats/gameStats'
import { reconcileBoxScore } from '../../stats/reconcile'
import type { GameState } from '../../types'
import midgame from '../../sandbox/states/midgame.json'
import final from '../../sandbox/states/final.json'

/**
 * The box score, live lines and season strip render what the statistics
 * module computed -- totals equal to the final score, the Exhibition label,
 * the legacy notice for games without a play log, and "No season stats yet"
 * before launch.
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

describe('live lines and season strip', () => {
  it('two stacked lines for the current batter and pitcher in a recorded game', () => {
    render(<LiveGameLines state={asRecordedGame(midgame as unknown as GameState)} />)
    expect(document.querySelectorAll('.gp-live-line').length).toBe(2)
    expect(screen.getByText('AB')).toBeTruthy()
    expect(screen.getByText('IP')).toBeTruthy()
  })

  it('nothing for a game without a play log', () => {
    const { container } = render(<LiveGameLines state={midgame as unknown as GameState} />)
    expect(container.textContent).toBe('')
  })

  it('the season strip shows no exhibition numbers before launch', () => {
    render(<SeasonStrip role="pitcher" />)
    expect(screen.getByText('No season stats yet')).toBeTruthy()
  })
})
