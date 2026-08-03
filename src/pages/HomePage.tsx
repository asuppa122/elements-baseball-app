import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { appPath } from '../lib/appPaths'

type HomeFeature = {
  title: string
  route: string
  status: 'available' | 'coming-soon'
}

const FEATURES: HomeFeature[] = [
  { title: 'Cards', route: '/cards', status: 'available' },
  { title: 'Team Builder', route: '/lineup-builder', status: 'available' },
  { title: 'Trades', route: '/trades', status: 'coming-soon' },
  { title: 'Season Milestones', route: '/milestones', status: 'coming-soon' },
  { title: 'Play', route: '/play', status: 'coming-soon' },
  { title: 'Standings', route: '/standings', status: 'coming-soon' },
  { title: 'Statistics', route: '/statistics', status: 'coming-soon' },
  { title: 'Rules', route: '/rules', status: 'coming-soon' },
]

export default function HomePage() {
  const navigate = useNavigate()
  const { profile, isDemo } = useAuth()

  return (
    <main className="home-hub home-hub-v11 home-hub-tiles-only">
      <section className="home-hero home-hero-v11 home-hero-text-only">
        <div className="home-hero-copy">
          <p className="eyebrow">
            {isDemo ? 'Public Demo' : `Welcome, ${profile?.manager_name ?? 'Manager'}`}
          </p>
          <p className="home-hero-summary">
            {isDemo
              ? 'Explore the Elements Baseball experience. Demo changes reset when the page refreshes.'
              : 'Manage your cards and teams, then follow every part of the Elements Baseball season.'}
          </p>
        </div>
      </section>

      <section className="home-dashboard" aria-label="Elements Baseball dashboard">
        <div className="home-feature-grid home-feature-grid-v11 home-feature-grid-titles-only">
          {FEATURES.map((feature) => (
            <button
              type="button"
              className={`home-feature-card home-feature-card-v11 home-feature-title-tile ${feature.status}`}
              onClick={() => navigate(appPath(feature.route, isDemo))}
              key={feature.title}
            >
              <h2>{feature.title}</h2>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}
