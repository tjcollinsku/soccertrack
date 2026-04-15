import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { components } from '../api/schema';

type Player = components['schemas']['Player'];

export default function Roster() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await api.GET('/api/players/');
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
  }, []);

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault();
    const jerseyNum = Number(jersey);
    if (!name.trim() || !Number.isInteger(jerseyNum) || jerseyNum < 0) {
      setError('Name and a non-negative jersey number are required.');
      return;
    }
    const { error } = await api.POST('/api/players/', {
      body: { name: name.trim(), jersey_number: jerseyNum },
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
    <div style={{ maxWidth: 600, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>Roster</h1>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <form onSubmit={addPlayer} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Jersey #"
          value={jersey}
          onChange={(e) => setJersey(e.target.value)}
          style={{ width: 80 }}
        />
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit">Add</button>
      </form>

      {loading ? (
        <p>Loading…</p>
      ) : players.length === 0 ? (
        <p>No players yet. Add one above.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {players.map((p) => (
            <li
              key={p.id}
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid #ddd',
                display: 'flex',
                gap: 12,
              }}
            >
              <span style={{ width: 40, fontWeight: 'bold' }}>#{p.jersey_number}</span>
              <span>{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
