import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { components } from '../api/schema';

type Game = components['schemas']['Game'];

export default function Games() {
  const [games, setGames] = useState<Game[]>([]);
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState<'home' | 'away'>('home');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await api.GET('/api/games/');
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
  }, []);

  async function addGame(e: React.FormEvent) {
    e.preventDefault();
    if (!opponent.trim() || !date) {
      setError('Opponent and date are required.');
      return;
    }
    const { error } = await api.POST('/api/games/', {
      body: { date, opponent: opponent.trim(), location },
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
        <button type="submit" className="btn btn-primary">Add</button>
      </form>

      <div className="surface">
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : games.length === 0 ? (
          <p className="text-muted">No games yet. Add one above.</p>
        ) : (
          games.map((g) => (
            <div key={g.id} className="game-row">
              <span className="game-date">{g.date}</span>
              <span className="game-opponent">
                {g.location === 'home' ? 'vs' : '@'} {g.opponent}
              </span>
              <Link to={`/games/${g.id}/setup`} className="game-link">Setup</Link>
              <Link to={`/games/${g.id}/tracker`} className="game-link">Track</Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
