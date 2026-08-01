import { useEffect, useMemo, useState } from 'react'
import logo from './assets/elements-baseball-logo.png'
import { supabase } from './lib/supabase'
import './App.css'

type Page = 'home' | 'cards'

type CardRow = {
  card_key: string
  player_name: string
  team_name: string | null
  league: string | null
  hitter_year: number | null
  pitcher_year: number | null
  hitter_team_code: string | null
  pitcher_team_code: string | null
  hitter_on_base: number | null
  hitter_points: number | null
  pitcher_control: number | null
  pitcher_ip: number | null
  ownership: string | null
}

type CardImageRow = {
  card_key: string
  image_url: string | null
}

type CardRecord = CardRow & {
  image_url: string | null
}

const CARD_BATCH_SIZE = 1000

async function fetchAllCards(): Promise<CardRow[]> {
  const allCards: CardRow[] = []
  let startingRow = 0

  while (true) {
    const endingRow = startingRow + CARD_BATCH_SIZE - 1

    const { data, error } = await supabase
      .from('cards')
      .select(`
        card_key,
        player_name,
        team_name,
        league,
        hitter_year,
        pitcher_year,
        hitter_team_code,
        pitcher_team_code,
        hitter_on_base,
        hitter_points,
        pitcher_control,
        pitcher_ip,
        ownership
      `)
      .order('all_number', { ascending: true })
      .range(startingRow, endingRow)

    if (error) {
      throw error
    }

    const batch = (data ?? []) as CardRow[]

    allCards.push(...batch)

    if (batch.length < CARD_BATCH_SIZE) {
      break
    }

    startingRow += CARD_BATCH_SIZE
  }

  return allCards
}

async function fetchAllCardImages(): Promise<CardImageRow[]> {
  const { data, error } = await supabase
    .from('card_images')
    .select(`
      card_key,
      image_url
    `)

  if (error) {
    throw error
  }

  return (data ?? []) as CardImageRow[]
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [cards, setCards] = useState<CardRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showImagesOnly, setShowImagesOnly] = useState(false)

  useEffect(() => {
    if (page !== 'cards') {
      return
    }

    async function loadCards() {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const [cardRows, imageRows] = await Promise.all([
          fetchAllCards(),
          fetchAllCardImages(),
        ])

        const imageMap = new Map<string, string>()

        for (const image of imageRows) {
          if (image.card_key && image.image_url) {
            imageMap.set(image.card_key, image.image_url)
          }
        }

        const combinedCards: CardRecord[] = cardRows.map((card) => ({
          ...card,
          image_url: imageMap.get(card.card_key) ?? null,
        }))

        setCards(combinedCards)
      } catch (error) {
        console.error('Card loading error:', error)

        if (error instanceof Error) {
          setErrorMessage(error.message)
        } else {
          setErrorMessage('An unknown error occurred while loading cards.')
        }

        setCards([])
      } finally {
        setIsLoading(false)
      }
    }

    void loadCards()
  }, [page])

  const filteredCards = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return cards.filter((card) => {
      if (showImagesOnly && !card.image_url) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const year = card.hitter_year ?? card.pitcher_year
      const teamCode =
        card.hitter_team_code ?? card.pitcher_team_code

      const searchableText = [
        card.player_name,
        card.team_name,
        card.league,
        teamCode,
        year,
        card.card_key,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ')

      return searchableText.includes(normalizedSearch)
    })
  }, [cards, searchTerm, showImagesOnly])

  const imageCount = useMemo(() => {
    return cards.filter((card) => Boolean(card.image_url)).length
  }, [cards])

  if (page === 'cards') {
    return (
      <div className="app">
        <header className="topbar">
          <button
            type="button"
            className="back-button"
            onClick={() => setPage('home')}
          >
            ← Home
          </button>

          <div className="page-heading">
            <p className="eyebrow">ELEMENTS BASEBALL</p>
            <h1>Card Database</h1>
          </div>
        </header>

        <main className="cards-page">
          <section className="cards-intro">
            <div>
              <h2>Real card data</h2>

              <p>
                Browse every card currently stored in Supabase.
              </p>
            </div>

            <div className="record-badge">
              {isLoading
                ? 'Loading...'
                : `${filteredCards.length} of ${cards.length} cards`}
            </div>
          </section>

          <section className="card-tools">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search player, team, year, or card key..."
              aria-label="Search cards"
            />

            <label className="image-filter">
              <input
                type="checkbox"
                checked={showImagesOnly}
                onChange={(event) =>
                  setShowImagesOnly(event.target.checked)
                }
              />

              <span>
                Show cards with images only ({imageCount})
              </span>
            </label>
          </section>

          {isLoading && (
            <section className="status-panel">
              <h3>Loading cards...</h3>

              <p>
                Retrieving all card records and image previews from Supabase.
              </p>
            </section>
          )}

          {!isLoading && errorMessage && (
            <section className="status-panel error-panel">
              <h3>Cards could not be loaded</h3>
              <p>{errorMessage}</p>
            </section>
          )}

          {!isLoading &&
            !errorMessage &&
            filteredCards.length === 0 && (
              <section className="status-panel">
                <h3>No cards found</h3>

                <p>
                  No cards matched your current search or filters.
                </p>
              </section>
            )}

          {!isLoading &&
            !errorMessage &&
            filteredCards.length > 0 && (
              <section className="cards-grid">
                {filteredCards.map((card) => {
                  const year =
                    card.hitter_year ?? card.pitcher_year

                  const teamCode =
                    card.hitter_team_code ??
                    card.pitcher_team_code

                  const isHitter =
                    card.hitter_on_base !== null

                  const isPitcher =
                    card.pitcher_control !== null

                  return (
                    <article
                      className="database-card"
                      key={card.card_key}
                    >
                      <div className="card-image-area">
                        {card.image_url ? (
                          <img
                            src={card.image_url}
                            alt={`${card.player_name} baseball card`}
                            className="card-preview-image"
                            loading="lazy"
                          />
                        ) : (
                          <div className="card-image-placeholder">
                            <strong>{card.player_name}</strong>
                            <span>Image not available</span>
                          </div>
                        )}
                      </div>

                      <div className="card-content">
                        <div className="card-topline">
                          <span className="card-year">
                            {year ?? 'Year unknown'}
                          </span>

                          <span className="card-league">
                            {card.league ?? '—'}
                          </span>
                        </div>

                        <div className="player-section">
                          <p className="team-code">
                            {teamCode ?? '—'}
                          </p>

                          <h3>{card.player_name}</h3>

                          <p className="team-name">
                            {card.team_name ??
                              'Team unavailable'}
                          </p>
                        </div>

                        <div className="card-stat-grid">
                          {isHitter && (
                            <>
                              <div className="stat-box">
                                <span>On Base</span>

                                <strong>
                                  {card.hitter_on_base}
                                </strong>
                              </div>

                              <div className="stat-box">
                                <span>Points</span>

                                <strong>
                                  {card.hitter_points ?? '—'}
                                </strong>
                              </div>
                            </>
                          )}

                          {isPitcher && (
                            <>
                              <div className="stat-box">
                                <span>Control</span>

                                <strong>
                                  {card.pitcher_control}
                                </strong>
                              </div>

                              <div className="stat-box">
                                <span>IP</span>

                                <strong>
                                  {card.pitcher_ip ?? '—'}
                                </strong>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="card-footer">
                          <span>
                            {isHitter && isPitcher
                              ? 'Two-way'
                              : isHitter
                                ? 'Hitter'
                                : 'Pitcher'}
                          </span>

                          <span>
                            {card.ownership
                              ? 'Owned'
                              : 'Unowned'}
                          </span>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </section>
            )}
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <img
          src={logo}
          alt="Elements Baseball"
          className="brand-logo"
        />

        <p>The home of your custom baseball league.</p>
      </header>

      <main className="home-grid">
        <button
          type="button"
          className="feature-card"
          onClick={() => setPage('cards')}
        >
          <h2>Cards</h2>
          <p>Browse every player card.</p>
        </button>

        <button type="button" className="feature-card">
          <h2>Rosters</h2>
          <p>Build and manage your teams.</p>
        </button>

        <button type="button" className="feature-card">
          <h2>League</h2>
          <p>Standings, leaders, and history.</p>
        </button>

        <button type="button" className="feature-card">
          <h2>Simulator</h2>
          <p>Play games and track stats automatically.</p>
        </button>
      </main>
    </div>
  )
}

export default App