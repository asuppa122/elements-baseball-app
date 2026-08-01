import { useNavigate } from 'react-router-dom'
import logo from '../assets/elements-baseball-logo.png'

function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="app">
      <header className="header">
        <img
          src={logo}
          alt="Elements Baseball"
          className="brand-logo"
        />

        <p>
          The home of your custom
          baseball league.
        </p>
      </header>

      <main className="home-grid">
        <button
          type="button"
          className="feature-card"
          onClick={() =>
            navigate('/cards')
          }
        >
          <h2>Cards</h2>

          <p>
            Browse the complete published
            Elements card database.
          </p>
        </button>

        <button
          type="button"
          className="feature-card"
          onClick={() =>
            navigate('/team-builder')
          }
        >
          <h2>Team Builder</h2>

          <p>
            Build and manage your league
            team.
          </p>
        </button>

        <button
          type="button"
          className="feature-card"
        >
          <h2>League</h2>

          <p>
            Explore standings, leaders,
            and history.
          </p>
        </button>

        <button
          type="button"
          className="feature-card"
        >
          <h2>Simulator</h2>

          <p>
            Play games and track stats
            automatically.
          </p>
        </button>
      </main>
    </div>
  )
}

export default HomePage
