import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  CardRecord,
} from '../types/card'
import {
  ACTIVE_SEASON,
  loadSeasonCards,
} from '../services/cardDatabase'
import {
  CURRENT_MANAGER,
  isCardOwnedByManager,
} from '../utils/cardHelpers'

function CollectionPage() {
  const navigate = useNavigate()

  const [
    cards,
    setCards,
  ] = useState<CardRecord[]>([])

  const [
    isLoading,
    setIsLoading,
  ] = useState(true)

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('')

  useEffect(() => {
    async function loadCollection() {
      setIsLoading(true)
      setErrorMessage('')

      try {
        setCards(
          await loadSeasonCards(),
        )
      } catch (error) {
        console.error(
          'Collection loading error:',
          error,
        )

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'The collection could not be loaded.',
        )
      } finally {
        setIsLoading(false)
      }
    }

    void loadCollection()
  }, [])

  const collection =
    useMemo(() => {
      const ownedCards =
        cards.filter((card) =>
          isCardOwnedByManager(
            card.ownership,
            CURRENT_MANAGER,
          ),
        )

      const missingCards =
        cards.filter(
          (card) =>
            !isCardOwnedByManager(
              card.ownership,
              CURRENT_MANAGER,
            ),
        )

      const completion =
        cards.length > 0
          ? (ownedCards.length /
              cards.length) *
            100
          : 0

      return {
        ownedCards,
        missingCards,
        completion,
      }
    }, [cards])

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="back-button"
          onClick={() =>
            navigate('/')
          }
        >
          <span aria-hidden="true">
            ←
          </span>

          <span>Home</span>
        </button>

        <div className="page-heading">
          <p className="eyebrow">
            Elements Baseball
          </p>

          <h1>
            My Collection
          </h1>

          <p className="page-description">
            Anthony's 2025 Elements cards.
          </p>
        </div>

        <button
          type="button"
          className="collection-header-button"
          onClick={() =>
            navigate('/cards')
          }
        >
          All Cards
        </button>
      </header>

      <main className="collection-page">
        {isLoading && (
          <section className="status-panel">
            <div className="loading-spinner" />

            <h3>
              Loading collection
            </h3>

            <p>
              Counting Anthony's 2025
              cards.
            </p>
          </section>
        )}

        {!isLoading &&
          errorMessage && (
            <section className="status-panel error-panel">
              <h3>
                Collection could not be loaded
              </h3>

              <p>
                {errorMessage}
              </p>
            </section>
          )}

        {!isLoading &&
          !errorMessage && (
            <>
              <section className="collection-hero">
                <p className="section-label">
                  {ACTIVE_SEASON} Collection
                </p>

                <h2>
                  {collection.ownedCards.length.toLocaleString()}{' '}
                  of{' '}
                  {cards.length.toLocaleString()}{' '}
                  cards owned
                </h2>

                <div className="collection-progress-track">
                  <div
                    className="collection-progress-fill"
                    style={{
                      width: `${collection.completion}%`,
                    }}
                  />
                </div>

                <strong className="collection-percentage">
                  {collection.completion.toFixed(
                    1,
                  )}
                  % complete
                </strong>
              </section>

              <section className="collection-summary-grid">
                <article className="collection-summary-card">
                  <span>Total Cards</span>
                  <strong>
                    {cards.length.toLocaleString()}
                  </strong>
                  <p>
                    Every released card in
                    the 2025 set.
                  </p>
                </article>

                <article className="collection-summary-card owned-summary">
                  <span>Anthony Owns</span>
                  <strong>
                    {collection.ownedCards.length.toLocaleString()}
                  </strong>
                  <p>
                    Cards currently listed
                    under Anthony.
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        '/cards?ownership=owned',
                      )
                    }
                  >
                    View Owned Cards
                  </button>
                </article>

                <article className="collection-summary-card missing-summary">
                  <span>Anthony Is Missing</span>
                  <strong>
                    {collection.missingCards.length.toLocaleString()}
                  </strong>
                  <p>
                    Cards not currently
                    listed under Anthony.
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        '/cards?ownership=not-owned',
                      )
                    }
                  >
                    View Missing Cards
                  </button>
                </article>
              </section>
            </>
          )}
      </main>
    </div>
  )
}

export default CollectionPage
