import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import LoginPage from '../pages/LoginPage'
import ManagerClaimPage from '../pages/ManagerClaimPage'

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, profile, loading, profileLoading } = useAuth()

  if (loading || profileLoading) {
    return (
      <div className="auth-screen auth-loading-screen">
        <div className="auth-loading-card">
          <span className="auth-spinner" />
          <strong>Loading Elements Baseball</strong>
        </div>
      </div>
    )
  }

  if (!user) return <LoginPage />
  if (!profile) return <ManagerClaimPage />
  return children
}
