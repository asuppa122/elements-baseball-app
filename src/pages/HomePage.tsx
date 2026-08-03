import { useNavigate } from 'react-router-dom'
import logo from '../assets/elements-baseball-logo.png'
import { useAuth } from '../auth/AuthContext'
import { appPath } from '../lib/appPaths'

const FEATURES = [
  {
    title: 'Cards',
    description: 'Browse the complete published Elements card database and your collection.',
    route: '/cards',
    status: 'Available',
    icon: '▣',
  },
  {
    title: 'Team Builder',
    description: 'Build, save, and manage up to three complete Elements teams.',
    route: '/lineup-builder',
    status: 'Available',
    icon: '♟',
  },
  {
    title: 'Statistics',
    description: 'League and individual player statistics powered by Elements game data.',
    route: '/statistics',
    status: 'Coming Soon',
    icon: '▥',
  },
  {
    title: 'Rules',
    description: 'Read the official Elements Baseball rulebook and league guidance.',
    route: '/rules',
    status: 'Coming Soon',
    icon: '▤',
  },
  {
    title: 'Games',
    description: 'Play head-to-head games and resume games that were paused.',
    route: '/games',
    status: 'Coming Soon',
    icon: '⚾',
  },
]

export default function HomePage() {
  const navigate = useNavigate()
  const { profile, isDemo } = useAuth()

  return (
    <main className="home-hub">
      <section className="home-hero">
        <img src={logo} alt="Elements Baseball" className="home-hero-logo" />
        <div className="home-hero-copy">
          <p className="eyebrow">{isDemo ? 'Public Demo' : `Welcome, ${profile?.manager_name}`}</p>
          <p className="home-hero-summary">
            {isDemo
              ? 'Explore the Elements Baseball experience. Demo changes reset when the page refreshes.'
              : 'Build lineups, manage your collection, track statistics, and play Elements Baseball from one account.'}
          </p>
        </div>
      </section>

      <section className="home-feature-grid" aria-label="Elements Baseball features">
        {FEATURES.map((feature) => (
          <button
            type="button"
            className="home-feature-card"
            onClick={() => navigate(appPath(feature.route, isDemo))}
            key={feature.title}
          >
            <span className="home-feature-icon" aria-hidden="true">{feature.icon}</span>
            <div>
              <h2>{feature.title}</h2>
              <p>{feature.description}</p>
            </div>
            <span className={feature.status === 'Available' ? 'feature-status available' : 'feature-status'}>
              {feature.status}
            </span>
          </button>
        ))}
      </section>
    </main>
  )
}
