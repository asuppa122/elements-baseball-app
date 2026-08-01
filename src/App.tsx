import {
  BrowserRouter,
  Route,
  Routes,
} from 'react-router-dom'
import HomePage from './pages/HomePage'
import CardsPage from './pages/CardsPage'
import CardProfilePage from './pages/CardProfilePage'
import RosterPage from './pages/RosterPage'
import NotFoundPage from './pages/NotFoundPage'
import './App.css'
import './cards-final-cleanup.css'
import './roster.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<HomePage />}
        />

        <Route
          path="/cards"
          element={<CardsPage />}
        />

        <Route
          path="/cards/:cardKey"
          element={<CardProfilePage />}
        />

        <Route
          path="/team-builder"
          element={<RosterPage />}
        />

        <Route
          path="*"
          element={<NotFoundPage />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
