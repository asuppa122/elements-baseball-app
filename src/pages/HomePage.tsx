import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { appPath } from '../lib/appPaths'

type HomeFeature = {
  title: string
  route: string
  status: 'available' | 'coming-soon'
  tone: string
  icon: HomeIconName
}

type HomeIconName =
  | 'cards'
  | 'team'
  | 'trades'
  | 'milestones'
  | 'play'
  | 'standings'
  | 'statistics'
  | 'rules'

const FEATURES: HomeFeature[] = [
  { title: 'Cards', route: '/cards', status: 'available', tone: 'cards', icon: 'cards' },
  { title: 'Team Builder', route: '/lineup-builder', status: 'available', tone: 'team-builder', icon: 'team' },
  { title: 'Trades', route: '/trades', status: 'coming-soon', tone: 'trades', icon: 'trades' },
  { title: 'Season Milestones', route: '/milestones', status: 'available', tone: 'milestones', icon: 'milestones' },
  { title: 'Play', route: '/play', status: 'coming-soon', tone: 'play', icon: 'play' },
  { title: 'Standings', route: '/standings', status: 'available', tone: 'standings', icon: 'standings' },
  { title: 'Statistics', route: '/statistics', status: 'coming-soon', tone: 'statistics', icon: 'statistics' },
  { title: 'Rules', route: '/rules', status: 'available', tone: 'rules', icon: 'rules' },
]

function HomeIcon({ name }: { name: HomeIconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.25,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (name === 'cards') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" {...common}>
        <rect x="17" y="14" width="28" height="38" rx="3" transform="rotate(-8 31 33)" />
        <rect x="24" y="12" width="28" height="38" rx="3" transform="rotate(5 38 31)" />
        <circle cx="39" cy="30" r="4" />
      </svg>
    )
  }

  if (name === 'team') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" {...common}>
        <circle cx="25" cy="24" r="8" />
        <circle cx="43" cy="25" r="7" />
        <path d="M11 50c1-10 6-15 14-15s13 5 14 15" />
        <path d="M36 38c2-3 5-5 9-5 7 0 11 5 12 14" />
      </svg>
    )
  }

  if (name === 'trades') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" {...common}>
        <path d="M12 22h36" />
        <path d="m41 15 8 7-8 7" />
        <path d="M52 42H16" />
        <path d="m23 35-8 7 8 7" />
      </svg>
    )
  }

  if (name === 'milestones') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" {...common}>
        <path d="M22 14h20v12c0 8-4 13-10 16-6-3-10-8-10-16Z" />
        <path d="M22 19H12c0 9 4 14 12 15" />
        <path d="M42 19h10c0 9-4 14-12 15" />
        <path d="M32 42v8" />
        <path d="M24 52h16" />
      </svg>
    )
  }

  if (name === 'play') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" {...common}>
        <path d="M32 12 53 27 43 50H21L11 27Z" />
        <circle cx="32" cy="28" r="3" />
        <path d="M24 45c2-7 5-10 8-10s6 3 8 10" />
        <circle cx="32" cy="51" r="3" />
      </svg>
    )
  }

  if (name === 'standings') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" {...common}>
        <rect x="12" y="35" width="9" height="17" />
        <rect x="28" y="20" width="9" height="32" />
        <rect x="44" y="29" width="9" height="23" />
      </svg>
    )
  }

  if (name === 'statistics') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" {...common}>
        <circle cx="32" cy="32" r="20" />
        <path d="M32 12v20h20" />
        <path d="m32 32 13 15" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" {...common}>
      <path d="M10 17c8-3 15-2 22 3v31c-7-5-14-6-22-3Z" />
      <path d="M54 17c-8-3-15-2-22 3v31c7-5 14-6 22-3Z" />
      <path d="M32 20v31" />
    </svg>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const { isDemo } = useAuth()

  return (
    <main className="home-recreation home-icon-dashboard">
      <section className="home-recreation-grid home-icon-grid" aria-label="Elements Baseball dashboard">
        {FEATURES.map((feature) => (
          <button
            type="button"
            aria-label={feature.title}
            className={`home-recreation-tile home-icon-tile home-recreation-${feature.tone}`}
            onClick={() => navigate(appPath(feature.route, isDemo))}
            key={feature.title}
          >
            <span className="home-icon">
              <HomeIcon name={feature.icon} />
            </span>
            <span className="home-icon-title">{feature.title}</span>
          </button>
        ))}
      </section>
    </main>
  )
}
