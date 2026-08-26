// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RosterMobileConfirmBar from '../RosterMobileConfirmBar'
import { makeCard } from '../../testUtils/cardFixtures'

describe('RosterMobileConfirmBar', () => {
  it('shows "Add to <slot>" and a disabled button when there is no current card and none selected', () => {
    render(
      <RosterMobileConfirmBar
        hasCurrentCard={false}
        slotLabel="Catcher"
        selectedSubstituteCard={null}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('Add to Catcher')).toBeInTheDocument()
    expect(screen.getByText('Select a player')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm Add' })).toBeDisabled()
  })

  it('shows "Replace with" and "Confirm Swap" when a card is already assigned to the slot', () => {
    render(
      <RosterMobileConfirmBar
        hasCurrentCard
        slotLabel="Catcher"
        selectedSubstituteCard={null}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('Replace with')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm Swap' })).toBeDisabled()
  })

  it('enables the button and shows the selected player once a substitute is chosen', () => {
    const substitute = makeCard({ player_name: 'Luis Torrens' })

    render(
      <RosterMobileConfirmBar
        hasCurrentCard
        slotLabel="Catcher"
        selectedSubstituteCard={substitute}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('Luis Torrens')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm Swap' })).toBeEnabled()
    expect(document.querySelector('.roster-mobile-confirm-bar.is-ready')).toBeInTheDocument()
  })

  it('calls onConfirm with the selected card when clicked', () => {
    const substitute = makeCard({ player_name: 'Luis Torrens' })
    const onConfirm = vi.fn()

    render(
      <RosterMobileConfirmBar
        hasCurrentCard
        slotLabel="Catcher"
        selectedSubstituteCard={substitute}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Swap' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith(substitute)
  })

  it('does not call onConfirm when clicked while disabled (no substitute selected)', () => {
    const onConfirm = vi.fn()

    render(
      <RosterMobileConfirmBar
        hasCurrentCard
        slotLabel="Catcher"
        selectedSubstituteCard={null}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Swap' }))

    expect(onConfirm).not.toHaveBeenCalled()
  })
})
