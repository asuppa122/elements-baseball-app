// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import RosterPointsStatus from '../RosterPointsStatus'

// Direct regression coverage for health-audit findings 8.1 (wrong roster
// point totals shown) and 8.2 (going over the cap clamped the display to
// "0 remaining" instead of showing the real overage).
describe('RosterPointsStatus', () => {
  it('shows points remaining when under the cap', () => {
    render(<RosterPointsStatus totalPoints={3500} pointCap={4000} />)

    expect(screen.getByText('3,500 / 4,000')).toBeInTheDocument()
    expect(screen.getByText('500 remaining')).toBeInTheDocument()
    expect(screen.queryByText(/over cap/)).not.toBeInTheDocument()
  })

  it('shows the real overage, not a clamped "0 remaining", when over the cap (8.2)', () => {
    render(<RosterPointsStatus totalPoints={6113} pointCap={6000} />)

    expect(screen.getByText('6,113 / 6,000')).toBeInTheDocument()
    expect(screen.getByText('113 over cap')).toBeInTheDocument()
    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument()
  })

  it('applies the over-cap styling class only when over the cap', () => {
    const { rerender } = render(<RosterPointsStatus totalPoints={100} pointCap={200} />)
    expect(document.querySelector('.roster-points-over')).not.toBeInTheDocument()

    rerender(<RosterPointsStatus totalPoints={250} pointCap={200} />)
    expect(document.querySelector('.roster-points-over')).toBeInTheDocument()
  })

  it('treats exactly meeting the cap as not over (boundary)', () => {
    render(<RosterPointsStatus totalPoints={4000} pointCap={4000} />)

    expect(screen.getByText('0 remaining')).toBeInTheDocument()
    expect(screen.queryByText(/over cap/)).not.toBeInTheDocument()
  })
})
