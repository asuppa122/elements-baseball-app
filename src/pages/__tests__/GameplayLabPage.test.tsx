// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GameplayLabPage from '../GameplayLabPage'
import { ActiveGameConflict, type ActiveGame, type PersistedGameplayLabGame } from '../../gameplay/gameRepository'
import type { GameState } from '../../gameplay/types'
import midgame from '../../gameplay/sandbox/states/midgame.json'

/**
 * The games page against a stand-in server: what a manager sees with and
 * without an active game, the two refusal messages, and who is offered Cancel
 * and "End without result". The rules themselves are the database's
 * (oneActiveGameSql.test.ts); this is what the page does with its answers.
 */

const ME = 'me-user'
const WILL = 'will-user'

const repo = vi.hoisted(() => ({
  active: null as ActiveGame | null,
  tester: false,
  terminator: false,
  live: false,
  games: [] as PersistedGameplayLabGame[],
  create: vi.fn(),
  cancel: vi.fn(),
  terminate: vi.fn(),
}))

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: ME }, profile: { manager_name: 'Anthony' }, isDemo: false }),
}))
vi.mock('../../gameplay/lineupChoice', () => ({
  loadLineupChoices: async () => [{ lineup: { id: 'l1', name: 'My Team' }, eligibility: { eligible: true, issues: [] } }],
  rosterIssueSummary: () => 'Eligible.',
  snapshotFor: () => ({ cards: {} }),
}))
vi.mock('../../gameplay/engine', async (orig) => ({
  ...(await orig<typeof import('../../gameplay/engine')>()),
  attachPregameRoster: (s: GameState) => s,
}))
vi.mock('../../gameplay/gameRepository', async (orig) => {
  const actual = await orig<typeof import('../../gameplay/gameRepository')>()
  return {
    ...actual,
    hasGameplayLabAccess: async () => true,
    loadGameplayOpponents: async () => [{ user_id: WILL, manager_name: 'Will', avatar_url: null }],
    loadGameplayLabGames: async () => repo.games,
    loadMyActiveGame: async () => repo.active,
    loadGameplayPermissions: async () => ({ can_create_test_games: repo.tester, can_terminate_games: repo.terminator, official_tracking_enabled: repo.live }),
    createGameplayLabGame: repo.create,
    cancelGameplayGame: repo.cancel,
    terminateGameplayGame: repo.terminate,
  }
})

function game(id: string, patch: Partial<GameState>, twoPlayer = true): PersistedGameplayLabGame {
  const s = { ...(structuredClone(midgame) as unknown as GameState), ...patch, gameId: id }
  s.turnHandshake = twoPlayer ? true : undefined
  s.managers = { home: { userId: ME, managerName: 'Anthony' }, away: { userId: WILL, managerName: 'Will' } }
  return { id, status: s.status, game_state: s, state_version: 3, season_id: '1925', created_at: '2026-10-31T00:00:00Z', home_user_id: ME, away_user_id: WILL } as unknown as PersistedGameplayLabGame
}

const show = () => render(<MemoryRouter><GameplayLabPage /></MemoryRouter>)

beforeEach(() => {
  repo.active = null
  repo.tester = false
  repo.terminator = false
  repo.live = false
  repo.games = []
  repo.create.mockReset(); repo.cancel.mockReset(); repo.terminate.mockReset()
})

describe('games page: one active game', () => {
  it('with no active game: no banner, Create enabled, no one-screen option without the tester permission', async () => {
    show()
    const create = await screen.findByRole('button', { name: 'Create Game' })
    expect(create).toBeEnabled()
    expect(screen.queryByText('Your active game')).toBeNull()
    expect(screen.queryByText('Two-player game')).toBeNull()
  })

  it('shows the active game with Resume, explains Exit, and blocks a second competitive game', async () => {
    const pregame = game('g-active', { status: 'pregame' })
    repo.games = [pregame]
    repo.active = { game_id: 'g-active', status: 'pregame', side: 'home', opponent_name: 'Will' }
    show()
    const banner = (await screen.findByText('Your active game')).closest('section')!
    expect(within(banner).getByText('vs. Will')).toBeInTheDocument()
    expect(within(banner).getByText(/Exit only leaves the game screen/)).toBeInTheDocument()
    expect(within(banner).getByRole('link', { name: 'Resume Active Game' })).toHaveAttribute('href', '/games/lab/g-active/pregame')
    expect(screen.getByText('You already have an active game. Finish or exit that game before starting another.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Game' })).toBeDisabled()
    expect(screen.getByText('Active game')).toBeInTheDocument()
  })

  it('shows the server\'s refusal when the opponent is busy, and creates nothing', async () => {
    repo.create.mockRejectedValue(new ActiveGameConflict('opponent', 'other-game'))
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Create Game' }))
    expect(await screen.findByText(/That manager is already playing another unfinished game/)).toBeInTheDocument()
    expect(screen.queryByText('Your active game')).toBeNull()
  })

  it('when the server says the manager is busy (another tab got there first), shows the message and the game to resume', async () => {
    repo.create.mockImplementation(async () => {
      repo.active = { game_id: 'g-other-tab', status: 'pregame', side: 'home', opponent_name: 'Will' }
      throw new ActiveGameConflict('you', 'g-other-tab')
    })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Create Game' }))
    expect(await screen.findByText('Your active game')).toBeInTheDocument()
    expect(screen.getAllByText('You already have an active game. Finish or exit that game before starting another.').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Resume Active Game' })).toHaveAttribute('href', '/games/lab/g-other-tab/screen')
  })

  it('lets an approved tester choose a one-screen test game, which an active game does not block', async () => {
    repo.tester = true
    repo.active = { game_id: 'g-active', status: 'pregame', side: 'home', opponent_name: 'Will' }
    show()
    const toggle = await screen.findByRole('checkbox')
    expect(screen.getByRole('button', { name: 'Create Game' })).toBeDisabled()
    fireEvent.click(toggle) // one-screen
    expect(screen.getByRole('button', { name: 'Create Game' })).toBeEnabled()
  })
})

describe('games page: pre-launch', () => {
  it('says every game is pre-launch testing while official tracking is off, and stops saying it once on', async () => {
    const view = show()
    expect(await screen.findByText(/nothing counts toward official/)).toBeInTheDocument()
    view.unmount()
    repo.live = true
    show()
    await screen.findByRole('button', { name: 'Create Game' })
    expect(screen.queryByText(/nothing counts toward official/)).toBeNull()
  })

  it('a tester who is not an administrator gets the one-screen option but never "End without result"', async () => {
    repo.tester = true
    repo.games = [game('g-started', { status: 'in_progress', firstPitchThrown: true })]
    show()
    expect(await screen.findByRole('checkbox')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'End without result' })).toBeNull()
  })
})

describe('games page: cancelling and ending', () => {
  it('offers Cancel on a game before its first pitch, and not after', async () => {
    repo.games = [
      game('g-pregame', { status: 'pregame' }),
      game('g-started', { status: 'in_progress', firstPitchThrown: true }),
    ]
    show()
    const [pre, started] = await Promise.all(['g-pregame', 'g-started'].map(async (id) => (await screen.findByRole('link', { name: id === 'g-pregame' ? 'Open Pregame' : 'Play' })).closest('article')!))
    expect(within(pre).getByRole('button', { name: 'Cancel game' })).toBeInTheDocument()
    expect(within(started).queryByRole('button', { name: 'Cancel game' })).toBeNull()
    expect(within(started).queryByRole('button', { name: 'End without result' })).toBeNull() // not an admin
  })

  it('cancels after confirmation and shows it as cancelled with no result', async () => {
    const g = game('g-pregame', { status: 'pregame' })
    repo.games = [g]
    repo.active = { game_id: 'g-pregame', status: 'pregame', side: 'home', opponent_name: 'Will' }
    repo.cancel.mockImplementation(async () => { repo.active = null; return { ...g, status: 'cancelled', game_state: { ...g.game_state, status: 'cancelled' } } })
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    show()
    const button = await screen.findByRole('button', { name: 'Cancel game' })
    fireEvent.click(button) // declined
    expect(repo.cancel).not.toHaveBeenCalled()
    fireEvent.click(button)
    await waitFor(() => expect(repo.cancel).toHaveBeenCalledWith('g-pregame'))
    expect(await screen.findByText('Cancelled before the first pitch — no result')).toBeInTheDocument()
    expect(screen.getByText(/Game cancelled before the first pitch/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Your active game')).toBeNull())
    expect(screen.getByRole('button', { name: 'Create Game' })).toBeEnabled()
  })

  it('offers an authorized administrator "End without result" on a started game, with a reason', async () => {
    repo.terminator = true
    const g = game('g-started', { status: 'in_progress', firstPitchThrown: true })
    repo.games = [g]
    repo.terminate.mockResolvedValue({ ...g, status: 'terminated', end_reason: 'admin_terminated', game_state: { ...g.game_state, status: 'terminated' } })
    vi.spyOn(window, 'prompt').mockReturnValue('Opponent stopped responding')
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'End without result' }))
    await waitFor(() => expect(repo.terminate).toHaveBeenCalledWith('g-started', 'Opponent stopped responding'))
    expect(await screen.findByText('Ended by an admin — no result')).toBeInTheDocument()
  })

  it('still lists ended and historical games, with a way to view them', async () => {
    repo.games = [
      { ...game('g-old', { status: 'terminated' }), status: 'terminated', end_reason: 'practice_cleanup' } as PersistedGameplayLabGame,
      game('g-final', { status: 'complete' }),
    ]
    show()
    expect(await screen.findByText('Practice game closed — no result')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Game' })).toHaveAttribute('href', '/games/lab/g-old/screen')
    expect(screen.getByRole('link', { name: 'View Final' })).toBeInTheDocument()
  })
})
