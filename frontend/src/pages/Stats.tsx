import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface SeasonPlayerStats {
  player_id: number;
  name: string;
  jersey_number: number;
  games_played: number;
  minutes_played: number;
  Pa: number;
  Cm: number;
  Dr: number;
  Dw: number;
  Sh: number;
  Fr: number;
  Gl: number;
  Tk: number;
  pass_completion: number;
  dribble_success: number;
  shot_accuracy: number;
}

const COLS: { key: keyof SeasonPlayerStats; label: string; isPct?: boolean }[] = [
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
];

export default function Stats() {
  const [players, setPlayers] = useState<SeasonPlayerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await api.GET('/api/players/season_stats/' as never);
      if (error) {
        setError('Failed to load season stats');
      } else if (data) {
        setPlayers((data as { players: SeasonPlayerStats[] }).players);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="page"><p className="text-muted">Loading…</p></div>;
  if (error) return <div className="page"><p className="error">{error}</p></div>;

  const totals: Partial<Record<keyof SeasonPlayerStats, number>> = {};
  for (const col of COLS) {
    if (col.key === 'name' || col.key === 'jersey_number') continue;
    totals[col.key] = 0;
  }
  for (const p of players) {
    for (const col of COLS) {
      if (col.key === 'name' || col.key === 'jersey_number') continue;
      (totals[col.key] as number) += p[col.key] as number;
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

  return (
    <div className="page">
      <h1>Season Stats</h1>

      {players.length === 0 ? (
        <p className="text-muted">No stats recorded yet. Play some games first.</p>
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
              {players.map((p) => (
                <tr key={p.player_id}>
                  {COLS.map((col) => {
                    const val = p[col.key];
                    const isGoal = col.key === 'Gl' && (val as number) > 0;
                    const display = col.isPct ? `${val}%` : val;
                    return (
                      <td
                        key={col.key}
                        className={`${col.key === 'name' ? 'left' : ''} ${isGoal ? 'goal-cell' : ''} ${col.isPct ? 'pct-cell' : ''}`}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
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
