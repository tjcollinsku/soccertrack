import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { components } from '../api/schema';
import { useTeam } from '../state/team';

type Game = components['schemas']['Game'];

export default function Games() {
  const { activeTeam } = useTeam();
  const [games, setGames] = useState<Game[]>([]);
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState<'home' | 'away'>('home');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!activeTeam) return;
    setLoading(true);
    const { data, error } = await api.GET('/api/games/', {
      params: { query: { team: activeTeam.id } as never },
    });
    if (error) {
      setError('Failed to load games');
    } else {
      setGames(data ?? []);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeam?.id]);

  async function addGame(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTeam) {
      setError('Select a team first.');
      return;
    }
    if (!opponent.trim() || !date) {
      setError('Opponent and date are required.');
      return;
    }
    const { error } = await api.POST('/api/games/', {
      body: { team: activeTeam.id, date, opponent: opponent.trim(), location } as never,
    });
    if (error) {
      setError('Failed to create game');
      return;
    }
    setOpponent('');
    setDate('');
    setLocation('home');
    load();
  }

  return (
    <div className="page">
      <h1>Games</h1>

      {error && <p className="error">{error}</p>}

      <form onSubmit={addGame} className="form-row">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ width: 150 }}
        />
        <input
          placeholder="Opponent"
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          style={{ flex: 1, minWidth: 120 }}
        />
        <select value={location} onChange={(e) => setLocation(e.target.value as 'home' | 'away')}>
          <option value="home">Home</option>
          <option value="away">Away</option>
        </select>
        <button type="submit" className="btn btn-primary">Add Game</button>
      </form>

      <div className="surface">
        {loading ? (
          <div className="loading">Loading games…</div>
        ) : games.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">🏟️</span>
            <div className="empty-state-title">No Games Yet</div>
            <p>Schedule your first match above and start tracking.</p>
          </div>
        ) : (
          games.map((g) => (
            <div key={g.id} className={`game-row ${g.location}`}>
              <span className="game-date">{g.date}</span>
              <span className={`game-location ${g.location}`}>
                {g.location === 'home' ? 'Home' : 'Away'}
              </span>
              <span className="game-opponent">
                <span className="game-vs">{g.location === 'home' ? 'vs' : '@'}</span>
                {g.opponent}
              </span>
              <div className="game-actions">
                <Link to={`/games/${g.id}/setup`} className="game-link">Setup</Link>
                <Link to={`/games/${g.id}/tracker`} className="game-link primary">Track</Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
