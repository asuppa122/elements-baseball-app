import {
  lazy,
  Suspense,
} from 'react'
import {
  BrowserRouter,
  Route,
  Routes,
} from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import AuthGate from './auth/AuthGate'
import AppShell from './components/AppShell'
import './App.css'
import './auth.css'
import './cards-final-cleanup.css'
import './roster.css'
import './league-content.css'
import './gameplay-lab.css'
import './gameplay-shell.css'
import './gameplay-demos.css'
import './responsive-v1.2.23.css'

// Route-level code-splitting (health-audit finding 1.1): every page was
// previously a static import, so every visitor downloaded the entire app in
// one bundle -- including the whole gameplay engine (the largest, most
// complex subsystem) even for someone who only ever opens Cards. Each page
// now ships as its own chunk, fetched on first navigation to that route.
const HomePage = lazy(() => import('./pages/HomePage'))
const CardsPage = lazy(() => import('./pages/CardsPage'))
const CardProfilePage = lazy(() => import('./pages/CardProfilePage'))
const RosterPage = lazy(() => import('./pages/RosterPage'))
const LineupSelectorPage = lazy(() => import('./pages/LineupSelectorPage'))
const ComingSoonPage = lazy(() => import('./pages/ComingSoonPage'))
const MilestonesPage = lazy(() => import('./pages/MilestonesPage'))
const RulesPage = lazy(() => import('./pages/RulesPage'))
const StandingsPage = lazy(() => import('./pages/StandingsPage'))
const GameplayLabPage = lazy(() => import('./pages/GameplayLabPage'))
const GameplayPregamePage = lazy(() => import('./pages/GameplayPregamePage'))
const GameplayGameStatePage = lazy(() => import('./pages/GameplayGameStatePage'))
const GameplayPlayableShellPage = lazy(() => import('./pages/GameplayPlayableShellPage'))
const GameplayVerificationPage = lazy(() => import('./pages/GameplayVerificationPage'))
const GamesPage = lazy(() => import('./pages/GamesPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function RouteFallback() {
  return (
    <section className="status-panel">
      <div className="loading-spinner" />

      <h3>
        Loading
      </h3>
    </section>
  )
}

function ProtectedApp() {
  return (
    <AuthGate>
      <AppShell>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/cards" element={<CardsPage />} />
            <Route path="/cards/:cardKey" element={<CardProfilePage />} />
            <Route path="/lineup-builder" element={<LineupSelectorPage />} />
            <Route path="/lineup-builder/:lineupId" element={<RosterPage />} />
            <Route path="/team-builder" element={<LineupSelectorPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/statistics" element={<ComingSoonPage title="Statistics" description="League and individual statistics will be built from your Elements game data." />} />
            <Route path="/play" element={<GamesPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/games/lab" element={<GameplayLabPage />} />
            <Route path="/games/lab/:gameId/pregame" element={<GameplayPregamePage />} />
            <Route path="/games/lab/:gameId/state" element={<GameplayGameStatePage />} />
            <Route path="/games/lab/:gameId/play" element={<GameplayPlayableShellPage />} />
            <Route path="/games/lab/verification" element={<GameplayVerificationPage />} />
            <Route path="/trades" element={<ComingSoonPage title="Trades" description="Trade proposals and league transaction tools are coming soon." />} />
            <Route path="/standings" element={<StandingsPage />} />
            <Route path="/milestones" element={<MilestonesPage />} />
            <Route path="/coming-soon" element={<ComingSoonPage title="Coming Soon" description="This space is reserved for a future cards or roster feature." />} />
            <Route path="/demo" element={<HomePage />} />
            <Route path="/demo/cards" element={<CardsPage />} />
            <Route path="/demo/cards/:cardKey" element={<CardProfilePage />} />
            <Route path="/demo/lineup-builder" element={<LineupSelectorPage />} />
            <Route path="/demo/lineup-builder/:lineupId" element={<RosterPage />} />
            <Route path="/demo/rules" element={<RulesPage />} />
            <Route path="/demo/statistics" element={<ComingSoonPage title="Statistics" description="League and individual statistics will be built from your Elements game data." />} />
            <Route path="/demo/play" element={<ComingSoonPage title="Play" description="Head-to-head gameplay and resumable games are coming next." />} />
            <Route path="/demo/games" element={<ComingSoonPage title="Play" description="Head-to-head gameplay and resumable games are coming next." />} />
            <Route path="/demo/trades" element={<ComingSoonPage title="Trades" description="Trade proposals and league transaction tools are coming soon." />} />
            <Route path="/demo/standings" element={<StandingsPage />} />
            <Route path="/demo/milestones" element={<MilestonesPage />} />
            <Route path="/demo/coming-soon" element={<ComingSoonPage title="Coming Soon" description="This space is reserved for a future cards or roster feature." />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </AppShell>
    </AuthGate>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProtectedApp />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
