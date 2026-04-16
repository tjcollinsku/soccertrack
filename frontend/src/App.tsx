import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import Games from './pages/Games';
import GameSetup from './pages/GameSetup';
import GameTracker from './pages/GameTracker';
import GameSummary from './pages/GameSummary';
import Roster from './pages/Roster';

export default function App() {
  return (
    <BrowserRouter>
      <nav className="nav">
        <NavLink to="/games">Games</NavLink>
        <NavLink to="/roster">Roster</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/games" replace />} />
        <Route path="/games" element={<Games />} />
        <Route path="/games/:id/setup" element={<GameSetup />} />
        <Route path="/games/:id/tracker" element={<GameTracker />} />
        <Route path="/games/:id/summary" element={<GameSummary />} />
        <Route path="/roster" element={<Roster />} />
      </Routes>
    </BrowserRouter>
  );
}
