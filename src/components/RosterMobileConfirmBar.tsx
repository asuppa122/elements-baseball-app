import type { CardRecord } from '../types/card'

// Extracted from RosterPage.tsx: the mobile-only sticky confirm bar for the
// Team Builder replacement/add-player flow. Same markup/classNames as
// before, just given its own testable component. `hasCurrentCard` decides
// "Replace with" vs "Add to <slot>" and "Confirm Swap" vs "Confirm Add";
// the button stays disabled (and onConfirm inert) until a substitute is
// actually selected.
type RosterMobileConfirmBarProps = {
  hasCurrentCard: boolean
  slotLabel: string
  selectedSubstituteCard: CardRecord | null
  onConfirm: (card: CardRecord) => void
}

function RosterMobileConfirmBar({
  hasCurrentCard,
  slotLabel,
  selectedSubstituteCard,
  onConfirm,
}: RosterMobileConfirmBarProps) {
  return (
    <div
      className={`roster-mobile-confirm-bar ${selectedSubstituteCard ? 'is-ready' : ''}`}
    >
      <div>
        <span>{hasCurrentCard ? 'Replace with' : `Add to ${slotLabel}`}</span>
        <strong>{selectedSubstituteCard?.player_name ?? 'Select a player'}</strong>
      </div>
      <button
        type="button"
        disabled={!selectedSubstituteCard}
        onClick={() => selectedSubstituteCard && onConfirm(selectedSubstituteCard)}
      >
        {hasCurrentCard ? 'Confirm Swap' : 'Confirm Add'}
      </button>
    </div>
  )
}

export default RosterMobileConfirmBar
