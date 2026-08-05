import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { appPath } from '../lib/appPaths'

type HomeFeature = {
  title: string
  route: string
  status: 'available' | 'coming-soon'
  tone: string
}

const LEFT_PENNANTS = ['CHC', 'ATL', 'CIN', 'PIT', 'SF']
const RIGHT_PENNANTS = ['BOS', 'DET', 'CLE', 'NYY', 'NYM']

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
    <main className="home-hub home-hub-v11 home-hub-tiles-only">
      <section className="home-museum-masthead" aria-label="Baseball museum pennants">
        <div className="home-pennant-group home-pennant-group-left" aria-hidden="true">
          {LEFT_PENNANTS.map((team) => <span className={`home-pennant home-pennant-${team.toLowerCase()}`} key={team}>{team}</span>)}
        </div>
        <div className="home-museum-identity">
          <strong>Elements Baseball</strong>
        </div>
        <div className="home-pennant-group home-pennant-group-right" aria-hidden="true">
          {RIGHT_PENNANTS.map((team) => <span className={`home-pennant home-pennant-${team.toLowerCase()}`} key={team}>{team}</span>)}
        </div>
      </section>

      <section className="home-dashboard" aria-label="Elements Baseball dashboard">
        <div className="home-feature-grid home-feature-grid-v11 home-feature-grid-titles-only">
          {FEATURES.map((feature) => (
            <button
              type="button"
              className={`home-feature-card home-feature-card-v11 home-feature-title-tile home-feature-${feature.tone} ${feature.status}`}
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
