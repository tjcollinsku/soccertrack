import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { components } from '../api/schema';

type Player = components['schemas']['Player'];
type PlayerGameSlot = components['schemas']['PlayerGameSlot'];
type StatTypeEnum = components['schemas']['StatTypeEnum'];
type PositionEnum = components['schemas']['PositionEnum'];

const STAT_LABELS: { key: StatTypeEnum; label: string }[] = [
  { key: 'Pa', label: 'Pa' },
  { key: 'Cm', label: 'Cm' },
  { key: 'Dr', label: 'Dr' },
  { key: 'Dw', label: 'Dw' },
  { key: 'Sh', label: 'Sh' },
  { key: 'Fr', label: 'Fr' },
  { key: 'Gl', label: 'Gl' },
  { key: 'Tk', label: 'Tk' },
];

const FORMATION: { pos: PositionEnum; row: number; col: number }[] = [
  { pos: 'LW',  row: 1, col: 1 },
  { pos: 'ST',  row: 1, col: 2 },
  { pos: 'RW',  row: 1, col: 3 },
  { pos: 'LM',  row: 2, col: 1 },
  { pos: 'CM',  row: 2, col: 2 },
  { pos: 'RM',  row: 2, col: 3 },
  { pos: 'LB',  row: 3, col: 1 },
  { pos: 'CB1', row: 3, col: 2 },
  { pos: 'CB2', row: 3, col: 3 },
  { pos: 'RB',  row: 3, col: 4 },
  { pos: 'GK',  row: 4, col: 2 },
];

const STAT_ROLLUP: Partial<Record<StatTypeEnum, StatTypeEnum[]>> = {
  Cm: ['Pa'],
  Gl: ['Fr', 'Sh'],
  Fr: ['Sh'],
  Dw: ['Dr'],
};

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function durationToISO(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function clockStorageKey(gameId: number): string {
  return `soccertrack_clock_${gameId}`;
}

type StatCounts = Partial<Record<StatTypeEnum, number>>;

export default function GameTracker() {
  const { id } = useParams<{ id: string }>();
  const gameId = Number(id);
  const navigate = useNavigate();

  const savedClock = sessionStorage.getItem(clockStorageKey(gameId));
  const [clockSeconds, setClockSeconds] = useState(savedClock ? Number(savedClock) : 0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [gameOver, setGameOver] = useState(false);

  const [onField, setOnField] = useState<PlayerGameSlot[]>([]);
  const [bench, setBench] = useState<Player[]>([]);
  const [statCounts, setStatCounts] = useState<Record<number, StatCounts>>({});
  const [selectedBench, setSelectedBench] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLineup();
    loadStats();
  }, []);

  useEffect(() => {
    sessionStorage.setItem(clockStorageKey(gameId), String(clockSeconds));
  }, [clockSeconds, gameId]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setClockSeconds((s) => s + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  async function loadLineup() {
    const { data, error } = await api.GET('/api/games/{id}/lineup/', {
      params: { path: { id: gameId } },
    });
    if (error) {
      setError('Failed to load lineup');
      return;
    }
    if (data) {
      setOnField(data.on_field);
      setBench(data.bench);
      if (data.on_field.length === 0) {
        setGameOver(true);
      }
    }
  }

  async function loadStats() {
    const { data } = await api.GET('/api/stats/', {
      params: { query: { game: gameId } as never },
    });
    if (!data) return;
    const counts: Record<number, StatCounts> = {};
    for (const evt of data as { player: number; stat_type: StatTypeEnum }[]) {
      if (!counts[evt.player]) counts[evt.player] = {};
      const pc = counts[evt.player];
      pc[evt.stat_type] = (pc[evt.stat_type] || 0) + 1;
      for (const implied of STAT_ROLLUP[evt.stat_type] ?? []) {
        pc[implied] = (pc[implied] || 0) + 1;
      }
    }
    setStatCounts(counts);
  }

  async function logStat(playerId: number, statType: StatTypeEnum) {
    if (gameOver) return;
    const { error } = await api.POST('/api/stats/', {
      body: {
        game: gameId,
        player: playerId,
        stat_type: statType,
        game_time: durationToISO(clockSeconds),
      },
    });
    if (error) {
      setError('Failed to log stat');
      return;
    }
    setStatCounts((prev) => {
      const pc = { ...(prev[playerId] || {}) };
      pc[statType] = (pc[statType] || 0) + 1;
      for (const implied of STAT_ROLLUP[statType] ?? []) {
        pc[implied] = (pc[implied] || 0) + 1;
      }
      return { ...prev, [playerId]: pc };
    });
  }

  async function removeStat(playerId: number, statType: StatTypeEnum) {
    if (gameOver) return;
    const { error } = await api.POST('/api/stats/undo/', {
      body: {
        game: gameId,
        player: playerId,
        stat_type: statType,
      },
    });
    if (error) return;
    setStatCounts((prev) => {
      const pc = { ...(prev[playerId] || {}) };
      if (pc[statType] && pc[statType]! > 0) pc[statType] = pc[statType]! - 1;
      for (const implied of STAT_ROLLUP[statType] ?? []) {
        if (pc[implied] && pc[implied]! > 0) pc[implied] = pc[implied]! - 1;
      }
      return { ...prev, [playerId]: pc };
    });
  }

  async function handleSub(fieldSlot: PlayerGameSlot) {
    if (!selectedBench || gameOver) return;
    const benchPlayer = selectedBench;
    setSelectedBench(null);

    const { error } = await api.POST('/api/slots/move/', {
      body: {
        game: gameId,
        player: fieldSlot.player.id,
        new_position: null,
        at_time: durationToISO(clockSeconds),
      } as never,
    });
    if (error) {
      setError('Failed to sub off player');
      return;
    }

    const { error: error2 } = await api.POST('/api/slots/move/', {
      body: {
        game: gameId,
        player: benchPlayer.id,
        new_position: fieldSlot.position,
        at_time: durationToISO(clockSeconds),
      } as never,
    });
    if (error2) {
      setError('Failed to sub on player');
      loadLineup();
      return;
    }

    loadLineup();
  }

  async function handleEndGame() {
    if (!confirm('End this game? This will finalize all player minutes.')) return;
    setRunning(false);
    const { error } = await api.POST('/api/games/{id}/end_game/', {
      params: { path: { id: gameId } },
      body: { final_time: durationToISO(clockSeconds) } as never,
    });
    if (error) {
      setError('Failed to end game');
      return;
    }
    setGameOver(true);
    sessionStorage.removeItem(clockStorageKey(gameId));
    navigate(`/games/${gameId}/summary`);
  }

  function getPlayerMinutes(slot: PlayerGameSlot): number {
    const timeOnParts = slot.time_on.split(':').map(Number);
    const onSeconds = timeOnParts[0] * 3600 + timeOnParts[1] * 60 + (timeOnParts[2] || 0);
    return Math.floor((clockSeconds - onSeconds) / 60);
  }

  const slotByPosition: Partial<Record<PositionEnum, PlayerGameSlot>> = {};
  for (const s of onField) {
    slotByPosition[s.position] = s;
  }

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}

      <div className="clock-bar">
        <span className="clock-display">{formatDuration(clockSeconds)}</span>
        {!gameOver && (
          <button
            className={`btn ${running ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => setRunning(!running)}
          >
            {running ? 'Pause' : 'Start'}
          </button>
        )}
        {!gameOver && !running && clockSeconds > 0 && (
          <button className="btn btn-danger" onClick={handleEndGame}>
            Game Over
          </button>
        )}
        {gameOver && <span className="clock-final">Final</span>}
      </div>

      <div className="field">
        <div className="field-grid">
          {FORMATION.map(({ pos, row, col }) => {
            const slot = slotByPosition[pos];
            if (!slot) {
              return (
                <div
                  key={pos}
                  className="empty-slot"
                  style={{ gridRow: row, gridColumn: col }}
                >
                  {pos}
                </div>
              );
            }
            const player = slot.player;
            const playerId = player.id;
            const counts = statCounts[playerId] || {};
            const minutes = getPlayerMinutes(slot);
            const isSub = selectedBench && !gameOver;

            return (
              <div
                key={pos}
                onClick={() => isSub && handleSub(slot)}
                className={`player-card ${isSub ? 'sub-target' : ''}`}
                style={{ gridRow: row, gridColumn: col }}
              >
                <div className="card-header">
                  <span className="card-pos">{pos}</span>
                  #{player.jersey_number} {player.name}
                </div>
                <div className="card-time">⏱ {minutes}min</div>
                {STAT_LABELS.map(({ key, label }) => (
                  <div key={key} className="stat-row">
                    <span className="stat-label">{label}</span>
                    <button
                      className="stat-btn"
                      onClick={(e) => { e.stopPropagation(); removeStat(playerId, key); }}
                      disabled={gameOver}
                    >−</button>
                    <span className="stat-val">{counts[key] || 0}</span>
                    <button
                      className="stat-btn plus"
                      onClick={(e) => { e.stopPropagation(); logStat(playerId, key); }}
                      disabled={gameOver}
                    >+</button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {!gameOver && (
        <div className="bench">
          <div className="bench-title">
            Bench {selectedBench ? `— ${selectedBench.name} selected (click a field player to sub)` : '— click to select'}
          </div>
          <div className="bench-cards">
            {bench.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedBench(selectedBench?.id === p.id ? null : p)}
                className={`bench-card ${selectedBench?.id === p.id ? 'selected' : ''}`}
              >
                #{p.jersey_number} {p.name}
              </div>
            ))}
            {bench.length === 0 && (
              <p className="text-muted text-sm">All players on field</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
