import { useNavigate } from 'react-router-dom'
import type { CardRecord } from '../types/card'
import {
  CURRENT_MANAGER,
  getCardYear,
  isCardOwnedByManager,
} from '../utils/cardHelpers'

type CardTileProps = {
  card: CardRecord
}

function CardTile({
  card,
}: CardTileProps) {
  const navigate = useNavigate()

  const year = getCardYear(card)

  const owned = isCardOwnedByManager(
    card.ownership,
    CURRENT_MANAGER,
  )

  return (
    <button
      type="button"
      className="database-card"
      onClick={() =>
        navigate(
          `/cards/${encodeURIComponent(
            card.card_key,
          )}`,
        )
      }
      aria-label={`Open ${card.player_name} card profile`}
    >
      <div className="card-image-area">
        {card.image_url ? (
          <img
            src={card.image_url}
            alt={`${card.player_name} baseball card`}
            className="card-preview-image"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(event) => {
              event.currentTarget.style.display =
                'none'

              const placeholder =
                event.currentTarget
                  .nextElementSibling

              if (
                placeholder instanceof
                HTMLElement
              ) {
                placeholder.style.display =
                  'flex'
              }
            }}
          />
        ) : null}

        <div
          className="card-image-placeholder"
          style={{
            display: card.image_url
              ? 'none'
              : 'flex',
          }}
        >
          <span className="placeholder-mark">
            E
          </span>

          <strong>
            {card.player_name}
          </strong>

          <span>
            Card image unavailable
          </span>
        </div>
      </div>

      <footer className="card-metadata">
        <span className="metadata-year">
          {year ?? 'Unknown'}
        </span>

        <span
          className={
            owned
              ? 'ownership-badge owned'
              : 'ownership-badge not-owned'
          }
        >
          <span
            className="ownership-dot"
            aria-hidden="true"
          />

          {owned
            ? 'Owned'
            : 'Not Owned'}
        </span>
      </footer>
    </button>
  )
}

export default CardTile
