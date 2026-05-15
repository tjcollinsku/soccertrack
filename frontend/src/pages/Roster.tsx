import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { components } from '../api/schema';
import { useTeam } from '../state/team';

type Player = components['schemas']['Player'];

export default function Roster() {
  const { activeTeam } = useTeam();
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!activeTeam) return;
    setLoading(true);
    const { data, error } = await api.GET('/api/players/', {
      params: { query: { team: activeTeam.id } as never },
    });
    if (error) {
      setError('Failed to load players');
    } else {
      setPlayers(data ?? []);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeam?.id]);

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTeam) {
      setError('Select a team first.');
      return;
    }
    const jerseyNum = Number(jersey);
    if (!name.trim() || !Number.isInteger(jerseyNum) || jerseyNum < 0) {
      setError('Name and a non-negative jersey number are required.');
      return;
    }
    const { error } = await api.POST('/api/players/', {
      body: { team: activeTeam.id, name: name.trim(), jersey_number: jerseyNum } as never,
    });
    if (error) {
      setError('Failed to create player');
      return;
    }
    setName('');
    setJersey('');
    load();
  }

  return (
    <div className="page">
      <h1>Roster</h1>

      {error && <p className="error">{error}</p>}

      <form onSubmit={addPlayer} className="form-row">
        <input
          placeholder="Jersey #"
          value={jersey}
          onChange={(e) => setJersey(e.target.value)}
          style={{ width: 80 }}
        />
        <input
          placeholder="Player Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, minWidth: 120 }}
        />
        <button type="submit" className="btn btn-primary">Add Player</button>
      </form>

      <div className="surface">
        {loading ? (
          <div className="loading">Loading roster…</div>
        ) : players.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">👥</span>
            <div className="empty-state-title">Squad is Empty</div>
            <p>Add your first player above to build the roster.</p>
          </div>
        ) : (
          players.map((p) => (
            <div key={p.id} className="roster-item">
              <span className="roster-jersey">{p.jersey_number}</span>
              <div className="roster-info">
                <span className="roster-name">{p.name}</span>
                <span className="roster-number">No. {p.jersey_number}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
