import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import Games from './pages/Games';
import GameSetup from './pages/GameSetup';
import GameTracker from './pages/GameTracker';
import GameSummary from './pages/GameSummary';
import Roster from './pages/Roster';
import Stats from './pages/Stats';
import TeamSwitcher from './components/TeamSwitcher';
import { TeamProvider } from './state/team';

export default function App() {
  return (
    <BrowserRouter>
      <TeamProvider>
        <nav className="nav">
          <NavLink to="/games" className="nav-brand" end>
            Soccer<span className="brand-accent">Track</span>
          </NavLink>
          <NavLink to="/games">Games</NavLink>
          <NavLink to="/roster">Roster</NavLink>
          <NavLink to="/stats">Stats</NavLink>
          <div className="nav-spacer" />
          <TeamSwitcher />
        </nav>
        <Routes>
          <Route path="/" element={<Navigate to="/games" replace />} />
          <Route path="/games" element={<Games />} />
          <Route path="/games/:id/setup" element={<GameSetup />} />
          <Route path="/games/:id/tracker" element={<GameTracker />} />
          <Route path="/games/:id/summary" element={<GameSummary />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </TeamProvider>
    </BrowserRouter>
  );
}
