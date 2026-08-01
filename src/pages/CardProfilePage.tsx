import {
  useEffect,
  useState,
} from 'react'
import {
  useNavigate,
  useParams,
} from 'react-router-dom'
import {
  loadCardByKey,
} from '../services/cardDatabase'
import type {
  CardRecord,
} from '../types/card'
import {
  getCardOwners,
} from '../utils/cardHelpers'

type ProfileTab =
  | 'ownership'
  | 'hitting'
  | 'defense'
  | 'pitching'

type StatItem = {
  label: string
  value: string
}

const HITTING_SECTIONS: Array<{
  title: string
  stats: StatItem[]
}> = [
  {
    title: 'Traditional',
    stats: [
      { label: 'G', value: '—' },
      { label: 'PA', value: '—' },
      { label: 'AB', value: '—' },
      { label: 'BA', value: '—' },
      { label: 'OBP', value: '—' },
      { label: 'SLG', value: '—' },
    ],
  },
  {
    title: 'Counting',
    stats: [
      { label: 'R', value: '—' },
      { label: 'H', value: '—' },
      { label: 'BB', value: '—' },
      { label: 'SO', value: '—' },
      { label: '2B', value: '—' },
      { label: '3B', value: '—' },
      { label: 'HR', value: '—' },
      { label: 'RBI', value: '—' },
    ],
  },
  {
    title: 'Situational',
    stats: [
      { label: 'SB', value: '—' },
      { label: 'CS', value: '—' },
      { label: 'GIDP', value: '—' },
      { label: 'SAC', value: '—' },
      { label: 'SF', value: '—' },
    ],
  },
  {
    title: 'Advanced',
    stats: [
      { label: 'OBA', value: '—' },
      { label: 'OCHW', value: '—' },
      { label: 'PCHW', value: '—' },
    ],
  },
]

const DEFENSE_SECTIONS: Array<{
  title: string
  stats: StatItem[]
}> = [
  {
    title: 'Games by Position',
    stats: [
      { label: 'C', value: '—' },
      { label: '1B', value: '—' },
      { label: '2B', value: '—' },
      { label: '3B', value: '—' },
      { label: 'SS', value: '—' },
      { label: 'LF', value: '—' },
      { label: 'CF', value: '—' },
      { label: 'RF', value: '—' },
    ],
  },
  {
    title: 'Infield',
    stats: [
      { label: 'DBP', value: '—' },
      { label: 'DBP ATT', value: '—' },
    ],
  },
  {
    title: 'Outfield',
    stats: [
      { label: 'OFA', value: '—' },
    ],
  },
  {
    title: 'Catching',
    stats: [
      { label: 'CS', value: '—' },
    ],
  },
]

const PITCHING_SECTIONS: Array<{
  title: string
  stats: StatItem[]
}> = [
  {
    title: 'Traditional',
    stats: [
      { label: 'G', value: '—' },
      { label: 'GS', value: '—' },
      { label: 'QS', value: '—' },
      { label: 'CG', value: '—' },
      { label: 'SHO', value: '—' },
      { label: 'W', value: '—' },
      { label: 'L', value: '—' },
      { label: 'SV', value: '—' },
      { label: 'BSV', value: '—' },
      { label: 'HLD', value: '—' },
    ],
  },
  {
    title: 'Counting',
    stats: [
      { label: 'H', value: '—' },
      { label: 'BB', value: '—' },
      { label: '2B', value: '—' },
      { label: '3B', value: '—' },
      { label: 'HR', value: '—' },
      { label: 'IP', value: '—' },
      { label: 'BF', value: '—' },
      { label: 'SO', value: '—' },
      { label: 'ER', value: '—' },
    ],
  },
  {
    title: 'Rate',
    stats: [
      { label: 'ERA', value: '—' },
      { label: 'WHIP', value: '—' },
      { label: 'BF/IP', value: '—' },
      { label: 'H/9', value: '—' },
      { label: 'HR/9', value: '—' },
      { label: 'BB/9', value: '—' },
      { label: 'SO/9', value: '—' },
    ],
  },
  {
    title: 'Advanced',
    stats: [
      { label: 'OCHW', value: '—' },
      { label: 'HCHO', value: '—' },
      { label: 'ADV', value: '—' },
    ],
  },
]

function StatSections({
  sections,
}: {
  sections: Array<{
    title: string
    stats: StatItem[]
  }>
}) {
  return (
    <div className="profile-stat-sections">
      {sections.map((section) => (
        <section
          className="profile-stat-section"
          key={section.title}
        >
          <h2>{section.title}</h2>

          <div className="profile-stat-grid">
            {section.stats.map((stat) => (
              <div
                className="profile-stat-item"
                key={`${section.title}-${stat.label}`}
              >
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function CardProfilePage() {
  const navigate = useNavigate()
  const { cardKey } = useParams()

  const [card, setCard] =
    useState<CardRecord | null>(null)

  const [activeTab, setActiveTab] =
    useState<ProfileTab>('ownership')

  const [isLoading, setIsLoading] =
    useState(true)

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('')

  useEffect(() => {
    async function loadCardProfile() {
      if (!cardKey) {
        throw new Error(
          'No card key was provided.',
        )
      }

      setIsLoading(true)
      setErrorMessage('')

      const decodedCardKey =
        decodeURIComponent(cardKey)

      const loadedCard =
        await loadCardByKey(
          decodedCardKey,
        )

      if (!loadedCard) {
        throw new Error(
          'This published card could not be found.',
        )
      }

      setCard(loadedCard)
    }

    void loadCardProfile()
      .catch((error: unknown) => {
        console.error(
          'Card profile loading error:',
          error,
        )

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'The card profile could not be loaded.',
        )

        setCard(null)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [cardKey])

  if (isLoading) {
    return (
      <div className="app">
        <main className="profile-status-page">
          <section className="status-panel">
            <div className="loading-spinner" />

            <h3>
              Loading card
            </h3>

            <p>
              Retrieving the selected
              card.
            </p>
          </section>
        </main>
      </div>
    )
  }

  if (
    errorMessage ||
    !card
  ) {
    return (
      <div className="app">
        <main className="profile-status-page">
          <section className="status-panel error-panel">
            <h3>
              Card could not be loaded
            </h3>

            <p>
              {errorMessage ||
                'The selected card was not found.'}
            </p>

            <button
              type="button"
              className="profile-return-button"
              onClick={() =>
                navigate('/cards')
              }
            >
              Return to Cards
            </button>
          </section>
        </main>
      </div>
    )
  }

  const owners =
    getCardOwners(card.ownership)

  const tabs: Array<{
    value: ProfileTab
    label: string
  }> = [
    {
      value: 'ownership',
      label: 'Ownership',
    },
    {
      value: 'hitting',
      label: 'Hitting Stats',
    },
    {
      value: 'defense',
      label: 'Defense Stats',
    },
    {
      value: 'pitching',
      label: 'Pitching Stats',
    },
  ]

  return (
    <div className="app">
      <header className="player-profile-header">
        <button
          type="button"
          className="profile-header-button"
          onClick={() =>
            navigate('/')
          }
        >
          <span aria-hidden="true">
            ←
          </span>

          <span>Home</span>
        </button>

        <div className="player-profile-heading">
          <p className="eyebrow">
            Elements Baseball
          </p>

          <h1>Player Profile</h1>
        </div>

        <div
          className="profile-header-spacer"
          aria-hidden="true"
        />
      </header>

      <main className="simplified-profile-page">
        <button
          type="button"
          className="back-to-cards-button"
          onClick={() =>
            navigate(-1)
          }
        >
          <span aria-hidden="true">
            ←
          </span>

          <span>Back to Cards</span>
        </button>

        <section className="profile-tabs-layout">
          <div className="simplified-card-frame">
            {card.image_url ? (
              <img
                src={card.image_url}
                alt={`${card.player_name} baseball card`}
                className="simplified-card-image"
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
              className="profile-image-placeholder"
              style={{
                display:
                  card.image_url
                    ? 'none'
                    : 'flex',
              }}
            >
              <span className="profile-placeholder-mark">
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

          <div className="profile-tab-column">
            <nav
              className="profile-tab-list"
              aria-label="Player profile sections"
            >
              {tabs.map((tab) => (
                <button
                  type="button"
                  className={
                    activeTab === tab.value
                      ? 'profile-tab-button active'
                      : 'profile-tab-button'
                  }
                  onClick={() =>
                    setActiveTab(tab.value)
                  }
                  aria-selected={
                    activeTab === tab.value
                  }
                  key={tab.value}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <section className="profile-tab-panel">
              {activeTab ===
                'ownership' && (
                <>
                  <p className="section-label">
                    Collection
                  </p>

                  <h1>Owned By</h1>

                  {owners.length > 0 ? (
                    <div className="simplified-owner-list">
                      {owners.map(
                        (ownerName) => (
                          <span
                            className="simplified-owner-chip"
                            key={ownerName}
                          >
                            <span
                              className="owner-chip-dot"
                              aria-hidden="true"
                            />

                            {ownerName}
                          </span>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="empty-owner-message">
                      This card is not
                      currently in anyone's
                      collection.
                    </p>
                  )}
                </>
              )}

              {activeTab ===
                'hitting' && (
                <>
                  <p className="section-label">
                    Hitting
                  </p>

                  <h1>Hitting Stats</h1>

                  <StatSections
                    sections={
                      HITTING_SECTIONS
                    }
                  />
                </>
              )}

              {activeTab ===
                'defense' && (
                <>
                  <p className="section-label">
                    Defense
                  </p>

                  <h1>Defense Stats</h1>

                  <StatSections
                    sections={
                      DEFENSE_SECTIONS
                    }
                  />
                </>
              )}

              {activeTab ===
                'pitching' && (
                <>
                  <p className="section-label">
                    Pitching
                  </p>

                  <h1>Pitching Stats</h1>

                  <StatSections
                    sections={
                      PITCHING_SECTIONS
                    }
                  />
                </>
              )}
            </section>
          </div>
        </section>
      </main>
    </div>
  )
}

export default CardProfilePage
