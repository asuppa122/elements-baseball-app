import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { appPath } from '../lib/appPaths'

type HomeFeature = {
  title: string
  route: string
  status: 'available' | 'coming-soon'
  tone: string
}

const FEATURES: HomeFeature[] = [
  { title: 'Cards', route: '/cards', status: 'available', tone: 'cards' },
  { title: 'Team Builder', route: '/lineup-builder', status: 'available', tone: 'team-builder' },
  { title: 'Trades', route: '/trades', status: 'coming-soon', tone: 'trades' },
  { title: 'Season Milestones', route: '/milestones', status: 'coming-soon', tone: 'milestones' },
  { title: 'Play', route: '/play', status: 'coming-soon', tone: 'play' },
  { title: 'Standings', route: '/standings', status: 'coming-soon', tone: 'standings' },
  { title: 'Statistics', route: '/statistics', status: 'coming-soon', tone: 'statistics' },
  { title: 'Rules', route: '/rules', status: 'coming-soon', tone: 'rules' },
]

export default function HomePage() {
  const navigate = useNavigate()
  const { isDemo } = useAuth()

  return (
    <main className="home-recreation">
      <section className="home-recreation-masthead" aria-label="Elements Baseball museum masthead" />

      <section className="home-recreation-grid" aria-label="Elements Baseball dashboard">
        {FEATURES.map((feature) => (
          <button
            type="button"
            aria-label={feature.title}
            className={`home-recreation-tile home-recreation-${feature.tone}`}
            onClick={() => navigate(appPath(feature.route, isDemo))}
            key={feature.title}
          >
            <span className="sr-only">{feature.title}</span>
          </button>
        ))}
      </section>
    </main>
  )
}
