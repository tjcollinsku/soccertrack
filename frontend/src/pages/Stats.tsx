import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { components } from '../api/schema';
import { useTeam } from '../state/team';

type Game = components['schemas']['Game'];

interface PositionStats {
  position: string;
  minutes: number;
  Pa?: number;
  Cm?: number;
  Dr?: number;
  Dw?: number;
  Sh?: number;
  Fr?: number;
  Gl?: number;
  Tk?: number;
  Sv?: number;
  pass_completion: number;
  dribble_success: number;
  shot_accuracy: number;
}

interface PlayerStats {
  player_id: number;
  name: string;
  jersey_number: number;
  games_played?: number;
  minutes_played: number;
  Pa: number;
  Cm: number;
  Dr: number;
  Dw: number;
  Sh: number;
  Fr: number;
  Gl: number;
  Tk: number;
  Sv: number;
  pass_completion: number;
  dribble_success: number;
  shot_accuracy: number;
  positions: PositionStats[];
}

const SEASON_COLS: { key: string; label: string; isPct?: boolean }[] = [
  { key: 'jersey_number', label: '#' },
  { key: 'name', label: 'Player' },
  { key: 'games_played', label: 'GP' },
  { key: 'minutes_played', label: 'Min' },
  { key: 'Gl', label: 'Gl' },
  { key: 'Sh', label: 'Sh' },
  { key: 'Fr', label: 'Fr' },
  { key: 'shot_accuracy', label: 'Sh%', isPct: true },
  { key: 'Pa', label: 'Pa' },
  { key: 'Cm', label: 'Cm' },
  { key: 'pass_completion', label: 'Pa%', isPct: true },
  { key: 'Dr', label: 'Dr' },
  { key: 'Dw', label: 'Dw' },
  { key: 'dribble_success', label: 'Dr%', isPct: true },
  { key: 'Tk', label: 'Tk' },
  { key: 'Sv', label: 'Sv' },
];

const GAME_COLS: { key: string; label: string; isPct?: boolean }[] = [
  { key: 'jersey_number', label: '#' },
  { key: 'name', label: 'Player' },
  { key: 'minutes_played', label: 'Min' },
  { key: 'Gl', label: 'Gl' },
  { key: 'Sh', label: 'Sh' },
  { key: 'Fr', label: 'Fr' },
  { key: 'shot_accuracy', label: 'Sh%', isPct: true },
  { key: 'Pa', label: 'Pa' },
  { key: 'Cm', label: 'Cm' },
  { key: 'pass_completion', label: 'Pa%', isPct: true },
  { key: 'Dr', label: 'Dr' },
  { key: 'Dw', label: 'Dw' },
  { key: 'dribble_success', label: 'Dr%', isPct: true },
  { key: 'Tk', label: 'Tk' },
  { key: 'Sv', label: 'Sv' },
];

export default function Stats() {
  const { activeTeam } = useTeam();
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('season');
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Reset to season view whenever team changes
  useEffect(() => {
    setSelectedGameId('season');
  }, [activeTeam?.id]);

  // Load games list whenever team changes
  useEffect(() => {
    if (!activeTeam) return;
    async function loadGames() {
      const { data } = await api.GET('/api/games/', {
        params: { query: { team: activeTeam!.id } as never },
      });
      if (data) setGames(data);
    }
    loadGames();
  }, [activeTeam?.id]);

  // Load stats whenever selection or team changes
  useEffect(() => {
    if (!activeTeam) return;
    async function loadStats() {
      setLoading(true);
      setError(null);
      setExpanded(new Set());

      if (selectedGameId === 'season') {
        const { data, error } = await api.GET(
          '/api/players/season_stats/' as never,
          { params: { query: { team: activeTeam!.id } } } as never,
        );
        if (error) {
          setError('Failed to load season stats');
        } else if (data) {
          setPlayers((data as { players: PlayerStats[] }).players);
        }
      } else {
        const gameId = Number(selectedGameId);
        const { data, error } = await api.GET('/api/games/{id}/stats/', {
          params: { path: { id: gameId } },
        });
        if (error) {
          setError('Failed to load game stats');
        } else if (data) {
          setPlayers(data.players as PlayerStats[]);
        }
      }
      setLoading(false);
    }
    loadStats();
  }, [selectedGameId, activeTeam?.id]);

  function toggleExpand(playerId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  const isSeason = selectedGameId === 'season';
  const COLS = isSeason ? SEASON_COLS : GAME_COLS;
  const STAT_KEYS = COLS.filter(c => c.key !== 'jersey_number' && c.key !== 'name');

  // Compute totals
  const totals: Record<string, number> = {};
  for (const col of COLS) {
    if (col.key === 'name' || col.key === 'jersey_number') continue;
    totals[col.key] = 0;
  }
  for (const p of players) {
    for (const col of COLS) {
      if (col.key === 'name' || col.key === 'jersey_number') continue;
      totals[col.key] += ((p as unknown as Record<string, number>)[col.key] as number) || 0;
    }
  }
  const totalPa = players.reduce((s, p) => s + p.Pa, 0);
  const totalCm = players.reduce((s, p) => s + p.Cm, 0);
  const totalSh = players.reduce((s, p) => s + p.Sh, 0);
  const totalFr = players.reduce((s, p) => s + p.Fr, 0);
  const totalDr = players.reduce((s, p) => s + p.Dr, 0);
  const totalDw = players.reduce((s, p) => s + p.Dw, 0);
  totals.pass_completion = totalPa ? Math.round(totalCm / totalPa * 1000) / 10 : 0;
  totals.shot_accuracy = totalSh ? Math.round(totalFr / totalSh * 1000) / 10 : 0;
  totals.dribble_success = totalDr ? Math.round(totalDw / totalDr * 1000) / 10 : 0;

  // Find selected game for subtitle
  const selectedGame = games.find(g => String(g.id) === selectedGameId);

  return (
    <div className="page">
      <div className="stats-header">
        <h1>{isSeason ? 'Season Stats' : 'Game Stats'}</h1>
        <select
          className="game-select"
          value={selectedGameId}
          onChange={(e) => setSelectedGameId(e.target.value)}
          aria-label="Select game or season"
        >
          <option value="season">Season Total</option>
          {games.map((g) => (
            <option key={g.id} value={String(g.id)}>
              {g.date} — {g.location === 'home' ? 'vs' : '@'} {g.opponent}
            </option>
          ))}
        </select>
      </div>

      {selectedGame && (
        <p className="stats-subtitle">
          {selectedGame.date} &middot; {selectedGame.location === 'home' ? 'Home vs' : 'Away @'} {selectedGame.opponent}
        </p>
      )}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : players.length === 0 ? (
        <p className="text-muted">No stats recorded{isSeason ? ' yet. Play some games first.' : ' for this game.'}</p>
      ) : (
        <div className="surface" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="stats-table">
            <thead>
              <tr>
                {COLS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const isExpanded = expanded.has(p.player_id);
                const hasPositions = p.positions && p.positions.length > 0;
                return (
                  <>
                    <tr
                      key={p.player_id}
                      onClick={() => hasPositions && toggleExpand(p.player_id)}
                      className={`${hasPositions ? 'expandable-row' : ''} ${isExpanded ? 'expanded' : ''}`}
                    >
                      {COLS.map((col) => {
                        const val = ((p as unknown as Record<string, number>)[col.key] as number) || 0;
                        const isGoal = col.key === 'Gl' && val > 0;
                        const isName = col.key === 'name';
                        const display = col.isPct ? `${val}%` : isName ? p.name : val;
                        return (
                          <td
                            key={col.key}
                            className={`${isName ? 'left' : ''} ${isGoal ? 'goal-cell' : ''} ${col.isPct ? 'pct-cell' : ''}`}
                          >
                            {isName && hasPositions && (
                              <span className="expand-arrow">{isExpanded ? '▼' : '▶'}</span>
                            )}
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && p.positions.map((pos) => (
                      <tr key={`${p.player_id}-${pos.position}`} className="position-row">
                        <td></td>
                        <td className="left position-label">{pos.position}</td>
                        {STAT_KEYS.map((col) => {
                          let val: number;
                          if (col.key === 'minutes_played') {
                            val = pos.minutes;
                          } else if (col.key === 'games_played') {
                            val = 0;
                          } else {
                            val = (pos as unknown as Record<string, number>)[col.key] ?? 0;
                          }
                          const display = col.isPct ? `${val}%` : (col.key === 'games_played' ? '—' : val);
                          return (
                            <td key={col.key} className={col.isPct ? 'pct-cell' : ''}>
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                );
              })}
              <tr className="total-row">
                <td></td>
                <td className="left">TOTAL</td>
                {COLS.slice(2).map((col) => {
                  const val = totals[col.key] ?? 0;
                  const display = col.isPct ? `${val}%` : val;
                  return <td key={col.key}>{display}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
