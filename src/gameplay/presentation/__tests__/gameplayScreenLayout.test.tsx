// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import GameplayScreenView from '../GameplayScreenView'
import { HeaderSlotContext } from '../../../components/headerSlot'
import { getDecisionView } from '../../decisionEngine'
import { sideToAct } from '../../turnOrder'
import type { useGameplayActions } from '../useGameplayActions'
import type { GameSide, GameState } from '../../types'
import midgame from '../../sandbox/states/midgame.json'
import decisionState from '../../sandbox/states/decision.json'

/**
 * D2 desktop layout: where the game bar renders, and which of the calls or
 * the live roll holds the slot under the cards. The pixel measurements live
 * in the browser probe; these pin the structure and the ownership rules, which
 * no screenshot proves.
 */

let desktop = true
beforeEach(() => {
  desktop = true
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width: 1025px') ? desktop : false,
    media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
})

let slot: HTMLDivElement | null = null
afterEach(() => { slot?.remove(); slot = null })

function actionsFor(state: GameState): ReturnType<typeof useGameplayActions> {
  const noop = async () => {}
  return {
    saving: false, error: '', notice: '', selection: [], toggleSelection: () => {},
    decision: getDecisionView(state), editablePrePitchDecision: false,
    noPitch: noop, declareReady: noop, rollPitch: noop, rollSwing: noop, startAction: noop,
    changeAction: noop, confirmDecision: noop, rollDecision: noop, togglePause: noop,
  } as unknown as ReturnType<typeof useGameplayActions>
}

function show(state: GameState, opts: { withSlot?: boolean; viewerSide?: GameSide; acting?: GameSide[] } = {}) {
  if (opts.withSlot !== false) {
    slot = document.createElement('div')
    slot.className = 'global-header-slot'
    document.body.appendChild(slot)
  }
  const view = render(
    <HeaderSlotContext.Provider value={opts.withSlot === false ? null : slot}>
      <GameplayScreenView
        state={state} events={[]} actions={actionsFor(state)}
        transition={null} onDismissTransition={() => {}} onExit={() => {}}
        viewerSide={opts.viewerSide ?? 'home'} actingSides={opts.acting ?? ['home', 'away']}
      />
    </HeaderSlotContext.Provider>,
  )
  return { ...view, screenEl: view.container.querySelector('.gp-screen')! }
}

const clone = (s: unknown) => structuredClone(s) as GameState

describe('D2 desktop: the game bar in the app header', () => {
  it('puts the score, tools and menu in the header slot and drops the tool strip', () => {
    const { screenEl } = show(clone(midgame))
    expect(screenEl).toHaveClass('is-d2')
    const bar = within(slot!)
    expect(slot!.querySelector('.gp-gamebar .gp-scorebug')).not.toBeNull()
    for (const tool of ['Log', 'Pen', 'Bench']) expect(bar.getByTitle(tool)).toBeInTheDocument()
    expect(bar.getByRole('button', { name: 'Exit' })).toBeInTheDocument()
    expect(screenEl.querySelector('.gp-region-rail')).toBeNull()
    expect(screenEl.querySelector('.gp-topbar')).toBeNull()
  })

  it('keeps the header row and the tool strip on tablet and phone', () => {
    desktop = false
    const { screenEl } = show(clone(midgame))
    expect(screenEl).not.toHaveClass('is-d2')
    expect(slot!.childElementCount).toBe(0)
    expect(screenEl.querySelector('.gp-topbar .gp-scorebug')).not.toBeNull()
    expect(screenEl.querySelector('.gp-region-rail .gp-toolbar')).not.toBeNull()
    expect(screen.getByText('Manager decisions')).toBeInTheDocument()
  })

  it('falls back to the header row and tool strip where there is no app header', () => {
    const { screenEl } = show(clone(midgame), { withSlot: false })
    expect(screenEl).not.toHaveClass('is-d2')
    expect(screenEl.querySelector('.gp-topbar')).not.toBeNull()
    expect(screenEl.querySelector('.gp-region-rail')).not.toBeNull()
  })

  it('shows Final in the header once the game is over', () => {
    const state = clone(midgame)
    state.status = 'complete'
    show(state)
    expect(within(slot!).getByTitle('Final')).toBeInTheDocument()
  })
})

describe('D2 desktop: calls and the live roll share one slot', () => {
  it('shows the calls, labelled "Before the pitch", while there are any', () => {
    const { screenEl } = show(clone(midgame))
    const lineup = screenEl.querySelector('.gp-region-lineup')!
    expect(lineup).toHaveClass('has-calls')
    const calls = screenEl.querySelector('.gp-calls')!
    expect(calls).not.toHaveClass('is-empty')
    expect(within(calls as HTMLElement).getByText('Before the pitch')).toBeInTheDocument()
    expect(within(calls as HTMLElement).getByRole('button', { name: 'Natural Steal' })).toHaveClass('is-offence')
    expect(within(calls as HTMLElement).getByRole('button', { name: 'Intentional Walk' })).toHaveClass('is-defence')
  })

  it('gives the slot back to the live roll once the pitch is rolled', () => {
    const state = clone(midgame)
    state.waitingFor = 'SWING_ROLL'
    state.plateAppearance.pitchRoll = 14
    state.plateAppearance.advantage = 'hitter'
    const { screenEl } = show(state)
    expect(screenEl.querySelector('.gp-region-lineup')).not.toHaveClass('has-calls')
    expect(screenEl.querySelector('.gp-calls')).toHaveClass('is-empty')
    const roll = screenEl.querySelector('.gp-matchup > .gp-roll') as HTMLElement
    expect(within(roll).getByText('14')).toBeInTheDocument()
    expect(within(roll).getByText('HITTER')).toBeInTheDocument()
  })

  it('in a two-player game, shows calls only to the manager whose turn it is -- the other sees the live roll', () => {
    const state = clone(midgame)
    state.turnHandshake = true
    const toAct = sideToAct(state)!
    const waiting: GameSide = toAct === 'home' ? 'away' : 'home'
    const mine = show(state, { viewerSide: toAct, acting: [toAct] })
    expect(mine.screenEl.querySelector('.gp-region-lineup')).toHaveClass('has-calls')
    expect(mine.screenEl.querySelectorAll('.gp-calls-list > .gp-action').length).toBeGreaterThan(0)
    mine.unmount(); slot?.remove()
    const theirs = show(state, { viewerSide: waiting, acting: [waiting] })
    expect(theirs.screenEl.querySelector('.gp-region-lineup')).not.toHaveClass('has-calls')
    expect(theirs.screenEl.querySelector('.gp-calls')).toHaveClass('is-empty')
  })
})

describe('D2 desktop: decision ownership on the Call button', () => {
  it('lights Call for the manager who owns the decision', () => {
    const state = clone(decisionState)
    state.turnHandshake = true
    const owner = getDecisionView(state)!.actingSide
    show(state, { viewerSide: owner, acting: [owner] })
    const call = within(slot!).getByTitle('Call')
    expect(call).toHaveClass('is-hot')
  })

  it('shows a muted "Waiting" to the other manager, with no decision board open', () => {
    const state = clone(decisionState)
    state.turnHandshake = true
    const owner = getDecisionView(state)!.actingSide
    const other: GameSide = owner === 'home' ? 'away' : 'home'
    const { screenEl } = show(state, { viewerSide: other, acting: [other] })
    expect(within(slot!).getByTitle('Waiting')).toHaveClass('is-muted')
    expect(screenEl.querySelector('.gp-mp')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(/Waiting on/)
  })
})

describe('the header slot is the game screen\'s only while it is mounted', () => {
  it('empties when the game screen unmounts (leaving gameplay for any other page)', () => {
    const view = show(clone(midgame))
    expect(slot!.querySelector('.gp-gamebar')).not.toBeNull()
    view.unmount()
    expect(slot!.childElementCount).toBe(0)
  })

  it('holds one game bar, for the current game, when the screen switches games', () => {
    const first = clone(midgame)
    const view = show(first)
    const second = clone(midgame)
    second.gameId = 'another-game'
    second.score = { away: 7, home: 3 }
    view.rerender(
      <HeaderSlotContext.Provider value={slot}>
        <GameplayScreenView state={second} events={[]} actions={actionsFor(second)}
          transition={null} onDismissTransition={() => {}} onExit={() => {}} viewerSide="home" actingSides={['home', 'away']} />
      </HeaderSlotContext.Provider>,
    )
    expect(slot!.querySelectorAll('.gp-gamebar')).toHaveLength(1)
    const runs = Array.from(slot!.querySelectorAll('.gp-scorebug-runs'), (r) => r.textContent)
    expect(runs).toEqual(['7', '3'])
  })

  it('empties when the window narrows to tablet width (the bar moves back into the screen)', () => {
    const view = show(clone(midgame))
    desktop = false
    view.rerender(
      <HeaderSlotContext.Provider value={slot}>
        <GameplayScreenView state={clone(midgame)} events={[]} actions={actionsFor(clone(midgame))}
          transition={null} onDismissTransition={() => {}} onExit={() => {}} viewerSide="home" actingSides={['home', 'away']} />
      </HeaderSlotContext.Provider>,
    )
    expect(slot!.childElementCount).toBe(0)
    expect(view.container.querySelector('.gp-topbar')).not.toBeNull()
  })
})

describe('no Pause', () => {
  it('offers Exit and nothing else in the game menu, on desktop and tablet', () => {
    show(clone(midgame))
    expect(within(slot!).getByRole('button', { name: 'Exit' })).toBeInTheDocument()
    expect(within(slot!).queryByRole('button', { name: /pause|resume/i })).toBeNull()
    slot!.remove(); slot = null
    desktop = false
    show(clone(midgame))
    expect(screen.queryByRole('button', { name: /pause|resume/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument()
  })
})

describe('ended and cancellable games on the screen', () => {
  it('offers Cancel game beside Exit only when the page passes it, and keeps them distinct', () => {
    const state = clone(midgame)
    const onCancel = vi.fn()
    const view = render(
      <HeaderSlotContext.Provider value={(slot = Object.assign(document.createElement('div'), { className: 'global-header-slot' }), document.body.appendChild(slot), slot)}>
        <GameplayScreenView state={state} events={[]} actions={actionsFor(state)} transition={null}
          onDismissTransition={() => {}} onExit={() => {}} onCancel={onCancel} viewerSide="home" actingSides={['home', 'away']} />
      </HeaderSlotContext.Provider>,
    )
    const cancel = within(slot!).getByRole('button', { name: 'Cancel game' })
    expect(cancel).toHaveClass('is-danger')
    expect(within(slot!).getByRole('button', { name: 'Exit' })).not.toHaveClass('is-danger')
    cancel.click()
    expect(onCancel).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('a cancelled or admin-ended game says so and offers no Roll', () => {
    for (const [status, text] of [['cancelled', 'Cancelled before the first pitch — no result.'], ['terminated', 'Ended by an admin — no result.']] as const) {
      const state = { ...clone(midgame), status }
      const view = show(state)
      expect(view.screenEl.querySelector('.gp-rollbox')).toHaveTextContent(text)
      expect(screen.queryByRole('button', { name: /roll|ready/i })).toBeNull()
      view.unmount(); slot?.remove(); slot = null
    }
  })
})
