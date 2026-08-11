import {
  BrowserRouter,
  Route,
  Routes,
} from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import AuthGate from './auth/AuthGate'
import AppShell from './components/AppShell'
import HomePage from './pages/HomePage'
import CardsPage from './pages/CardsPage'
import CardProfilePage from './pages/CardProfilePage'
import RosterPage from './pages/RosterPage'
import LineupSelectorPage from './pages/LineupSelectorPage'
import ComingSoonPage from './pages/ComingSoonPage'
import MilestonesPage from './pages/MilestonesPage'
import RulesPage from './pages/RulesPage'
import StandingsPage from './pages/StandingsPage'
import NotFoundPage from './pages/NotFoundPage'
import './App.css'
import './auth.css'
import './cards-final-cleanup.css'
import './roster.css'
import './league-content.css'
import './responsive-v1.2.23.css'

function ProtectedApp() {
  return (
    <AuthGate>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/cards/:cardKey" element={<CardProfilePage />} />
          <Route path="/lineup-builder" element={<LineupSelectorPage />} />
          <Route path="/lineup-builder/:lineupId" element={<RosterPage />} />
          <Route path="/team-builder" element={<LineupSelectorPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/statistics" element={<ComingSoonPage title="Statistics" description="League and individual statistics will be built from your Elements game data." />} />
          <Route path="/play" element={<ComingSoonPage title="Play" description="Head-to-head gameplay and resumable games are coming next." />} />
          <Route path="/games" element={<ComingSoonPage title="Play" description="Head-to-head gameplay and resumable games are coming next." />} />
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
