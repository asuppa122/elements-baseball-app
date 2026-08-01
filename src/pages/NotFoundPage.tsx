import { useNavigate } from 'react-router-dom'

function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="app">
      <main className="profile-status-page">
        <section className="status-panel">
          <h3>Page not found</h3>

          <p>
            The page you requested does
            not exist.
          </p>

          <button
            type="button"
            className="profile-return-button"
            onClick={() =>
              navigate('/')
            }
          >
            Return Home
          </button>
        </section>
      </main>
    </div>
  )
}

export default NotFoundPage
