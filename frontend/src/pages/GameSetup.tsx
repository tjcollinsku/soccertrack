import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { components } from '../api/schema';

type Player = components['schemas']['Player'];
type PositionEnum = components['schemas']['PositionEnum'];

const FORMATION: { pos: PositionEnum; label: string; row: number; col: number }[] = [
  { pos: 'LW',  label: 'LW',  row: 1, col: 1 },
  { pos: 'ST',  label: 'ST',  row: 1, col: 2 },
  { pos: 'RW',  label: 'RW',  row: 1, col: 3 },
  { pos: 'LM',  label: 'LM',  row: 2, col: 1 },
  { pos: 'CM',  label: 'CM',  row: 2, col: 2 },
  { pos: 'RM',  label: 'RM',  row: 2, col: 3 },
  { pos: 'LB',  label: 'LB',  row: 3, col: 1 },
  { pos: 'CB1', label: 'CB1', row: 3, col: 2 },
  { pos: 'CB2', label: 'CB2', row: 3, col: 3 },
  { pos: 'RB',  label: 'RB',  row: 3, col: 4 },
  { pos: 'GK',  label: 'GK',  row: 4, col: 2 },
];

type Assignments = Partial<Record<PositionEnum, Player>>;

export default function GameSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [assignments, setAssignments] = useState<Assignments>({});
  const [selectedPos, setSelectedPos] = useState<PositionEnum | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadPlayersForGame() {
      const { data: game } = await api.GET('/api/games/{id}/', {
        params: { path: { id: Number(id) } },
      });
      if (!game) return;
      const { data: roster } = await api.GET('/api/players/', {
        params: { query: { team: game.team } as never },
      });
      setPlayers(roster ?? []);
    }
    loadPlayersForGame();
  }, [id]);

  const assignedPlayerIds = new Set(
    Object.values(assignments).map((p) => p.id),
  );
  const available = players.filter((p) => !assignedPlayerIds.has(p.id));
  const filledCount = Object.keys(assignments).length;

  function handleSlotClick(pos: PositionEnum) {
    if (assignments[pos]) {
      const updated = { ...assignments };
      delete updated[pos];
      setAssignments(updated);
      setSelectedPos(null);
      return;
    }
    setSelectedPos(pos);
  }

  function handlePlayerClick(player: Player) {
    if (!selectedPos) return;
    setAssignments({ ...assignments, [selectedPos]: player });
    setSelectedPos(null);
  }

  async function lockLineup() {
    if (filledCount !== 11) return;
    setSubmitting(true);
    setError(null);
    const lineup = Object.entries(assignments).map(([position, player]) => ({
      player_id: player.id,
      position: position as PositionEnum,
    }));
    const { error } = await api.POST('/api/games/{id}/start_lineup/', {
      params: { path: { id: Number(id) } },
      body: { lineup },
    });
    if (error) {
      setError('Failed to lock lineup.');
      setSubmitting(false);
      return;
    }
    navigate(`/games/${id}/tracker`);
  }

  return (
    <div className="page">
      <h1>Setup Lineup</h1>
      {error && <p className="error">{error}</p>}

      <p className="text-muted text-sm mb-4">
        {selectedPos
          ? `Select a player for ${selectedPos}:`
          : 'Click a position slot, then pick a player. Click a filled slot to clear it.'}
      </p>

      <div className="field" style={{ marginBottom: 16 }}>
        <div className="field-grid" style={{ gridTemplateRows: 'repeat(4, 80px)' }}>
          {FORMATION.map(({ pos, label, row, col }) => {
            const player = assignments[pos];
            const isSelected = selectedPos === pos;
            const className = `setup-slot ${player ? 'filled' : 'empty'} ${isSelected ? 'selected' : ''}`;
            return (
              <div
                key={pos}
                onClick={() => handleSlotClick(pos)}
                className={className}
                style={{ gridRow: row, gridColumn: col }}
              >
                <span className="slot-pos">{label}</span>
                {player && (
                  <>
                    <span className="slot-jersey">#{player.jersey_number}</span>
                    <span className="slot-name">{player.name}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <h3 style={{ color: 'var(--text-heading)', marginBottom: 8 }}>
        Available ({available.length}) — {filledCount}/11 assigned
      </h3>
      {available.length === 0 && filledCount < 11 ? (
        <p className="text-muted">No more players on the roster. Add more on the Roster page.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {available.map((p) => (
            <div
              key={p.id}
              onClick={() => handlePlayerClick(p)}
              className={`available-player ${selectedPos ? 'active' : 'inactive'}`}
            >
              <strong>#{p.jersey_number}</strong> {p.name}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={lockLineup}
        disabled={filledCount !== 11 || submitting}
        className="btn btn-primary mt-4"
        style={{ fontSize: '1rem' }}
      >
        {submitting ? 'Locking…' : `Lock Lineup (${filledCount}/11)`}
      </button>
    </div>
  );
}
