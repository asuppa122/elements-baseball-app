import { useState } from 'react'
import logo from '../assets/elements-baseball-logo.png'
import { useAuth } from '../auth/AuthContext'

export default function LoginPage() {
  const { signInWithDiscord } = useAuth()
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  async function login() {
    setWorking(true)
    setError('')
    try {
      await signInWithDiscord()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Discord login failed.')
      setWorking(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="login-card">
        <img src={logo} alt="Elements Baseball" />
        <p className="eyebrow">Elements Baseball</p>
        <h1>Welcome to the league</h1>
        <p>
          Sign in with Discord to access your cards, lineups, statistics, rules,
          and games.
        </p>
        <button type="button" onClick={login} disabled={working}>
          {working ? 'Connecting…' : 'Log in with Discord'}
        </button>
        {error && <div className="auth-error">{error}</div>}
      </section>
    </main>
  )
}
