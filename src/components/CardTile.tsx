import { useNavigate } from 'react-router-dom'
import type { CardRecord } from '../types/card'
import {
  getCardYear,
  isCardOwnedByManager,
} from '../utils/cardHelpers'
import { useAuth } from '../auth/AuthContext'
import { appPath } from '../lib/appPaths'

type CardTileProps = {
  card: CardRecord
}

function CardTile({
  card,
}: CardTileProps) {
  const navigate = useNavigate()
  const { profile, isDemo } = useAuth()

  const year = getCardYear(card)

  const owned = isCardOwnedByManager(
    card.ownership,
    profile?.manager_name ?? '',
  )

  return (
    <button
      type="button"
      className="database-card"
      onClick={() =>
        navigate(
          appPath(`/cards/${encodeURIComponent(
            card.card_key,
          )}`, isDemo),
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

        {!isDemo && <span
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
        </span>}
      </footer>
    </button>
  )
}

export default CardTile
