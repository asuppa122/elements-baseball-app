import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import LoginPage from '../pages/LoginPage'
import ManagerClaimPage from '../pages/ManagerClaimPage'

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, profile, loading, profileLoading, isDemo } = useAuth()

  if (!isDemo && (loading || profileLoading)) {
    return (
      <div className="auth-screen auth-loading-screen">
        <div className="auth-loading-card">
          <span className="auth-spinner" />
          <strong>Loading Elements Baseball</strong>
        </div>
      </div>
    )
  }

  if (!isDemo && !user) return <LoginPage />
  if (!isDemo && !profile) return <ManagerClaimPage />
  return children
}
