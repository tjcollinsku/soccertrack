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

const GK_STAT_KEYS: Set<StatTypeEnum> = new Set(['Tk', 'Pa', 'Cm']);

const FORMATION_ROWS: { label: string; positions: PositionEnum[] }[] = [
  { label: 'forwards',  positions: ['LW', 'ST', 'RW'] },
  { label: 'midfield',  positions: ['LM', 'CM', 'RM'] },
  { label: 'defense',   positions: ['LB', 'CB1', 'CB2', 'RB'] },
  { label: 'goalkeeper', positions: ['GK'] },
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

// Selection can be a bench player OR a field player (for swaps)
type Selection =
  | { type: 'bench'; player: Player }
  | { type: 'field'; slot: PlayerGameSlot };

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
  const [selection, setSelection] = useState<Selection | null>(null);
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

  async function handleFieldClick(slot: PlayerGameSlot) {
    if (gameOver) return;

    if (!selection) {
      // Nothing selected — select this field player
      setSelection({ type: 'field', slot });
      return;
    }

    if (selection.type === 'bench') {
      // Bench player selected → sub them onto this field position
      const benchPlayer = selection.player;
      setSelection(null);

      const { error } = await api.POST('/api/slots/move/', {
        body: {
          game: gameId,
          player: slot.player.id,
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
          new_position: slot.position,
          at_time: durationToISO(clockSeconds),
        } as never,
      });
      if (error2) {
        setError('Failed to sub on player');
        loadLineup();
        return;
      }

      loadLineup();
      return;
    }

    // Field player selected → clicked another field player:
    // Move the first player to the second player's position, bench the second player
    const selectedSlot = selection.slot;

    if (selectedSlot.player.id === slot.player.id) {
      // Clicked same player — deselect
      setSelection(null);
      return;
    }

    setSelection(null);
    const time = durationToISO(clockSeconds);
    const targetPos = slot.position;

    // 1. Bench the second player (the one being displaced)
    const { error: err1 } = await api.POST('/api/slots/move/', {
      body: { game: gameId, player: slot.player.id, new_position: null, at_time: time } as never,
    });
    if (err1) {
      setError('Failed to bench player');
      loadLineup();
      return;
    }

    // 2. Move the first player (the selected one) into that position
    const { error: err2 } = await api.POST('/api/slots/move/', {
      body: { game: gameId, player: selectedSlot.player.id, new_position: targetPos, at_time: time } as never,
    });
    if (err2) {
      setError('Failed to move player');
      loadLineup();
      return;
    }

    loadLineup();
  }

  async function handleEmptySlotClick(pos: PositionEnum) {
    if (gameOver || !selection) return;

    const playerId = selection.type === 'bench' ? selection.player.id : selection.slot.player.id;
    setSelection(null);

    const { error } = await api.POST('/api/slots/move/', {
      body: {
        game: gameId,
        player: playerId,
        new_position: pos,
        at_time: durationToISO(clockSeconds),
      } as never,
    });
    if (error) {
      setError('Failed to place player');
      loadLineup();
      return;
    }

    loadLineup();
  }

  function handleBenchClick(player: Player) {
    if (gameOver) return;
    if (selection?.type === 'bench' && selection.player.id === player.id) {
      setSelection(null);
    } else {
      setSelection({ type: 'bench', player });
    }
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

  // Determine selection state for styling
  const selectedFieldPlayerId = selection?.type === 'field' ? selection.slot.player.id : null;
  const selectedBenchPlayerId = selection?.type === 'bench' ? selection.player.id : null;
  const hasSelection = selection !== null;

  // Status message for the bench header
  let selectionHint = 'Click a player to select';
  if (selection?.type === 'bench') {
    selectionHint = `${selection.player.name} selected — click a field player to sub in`;
  } else if (selection?.type === 'field') {
    selectionHint = `${selection.slot.player.name} selected — click a player to take their spot, or an empty slot to move`;
  }

  return (
    <div className="page tracker-page">
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

      <div className="tracker-layout">
        <div className="pitch-wrapper">
          <div className="pitch">
            <div className="pitch-markings">
              <div className="pitch-halfway" />
              <div className="pitch-circle" />
              <div className="pitch-box-top" />
              <div className="pitch-box-bottom" />
              <div className="pitch-arc-top" />
              <div className="pitch-arc-bottom" />
            </div>

            {FORMATION_ROWS.map(({ label, positions }) => (
              <div key={label} className={`pitch-row pitch-row-${label}`}>
                {positions.map((pos) => {
                  const slot = slotByPosition[pos];
                  if (!slot) {
                    const canFill = selection !== null && !gameOver;
                    return (
                      <div
                        key={pos}
                        className={`empty-slot${canFill ? ' fillable' : ''}`}
                        onClick={() => handleEmptySlotClick(pos)}
                      >
                        {pos}
                      </div>
                    );
                  }
                  const player = slot.player;
                  const playerId = player.id;
                  const counts = statCounts[playerId] || {};
                  const minutes = getPlayerMinutes(slot);
                  const isGK = pos === 'GK';
                  const visibleStats = isGK
                    ? STAT_LABELS.filter(s => GK_STAT_KEYS.has(s.key))
                    : STAT_LABELS;

                  const isSelected = selectedFieldPlayerId === playerId;
                  const isTarget = hasSelection && !isSelected && !gameOver;

                  return (
                    <div
                      key={pos}
                      onClick={() => handleFieldClick(slot)}
                      className={`player-card${isSelected ? ' selected' : ''}${isTarget ? ' sub-target' : ''}`}
                    >
                      <div className="card-badge">{pos}</div>
                      <div className="card-name">#{player.jersey_number} {player.name}</div>
                      <div className="card-time">{minutes}′</div>
                      <div className="card-stats">
                        {visibleStats.map(({ key, label }) => (
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
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {!gameOver && (
          <div className="bench-panel">
            <div className="bench-title">Substitutes</div>
            <div className="bench-hint">{selectionHint}</div>
            <div className="bench-list">
              {bench.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleBenchClick(p)}
                  className={`bench-card ${selectedBenchPlayerId === p.id ? 'selected' : ''}`}
                >
                  <span className="bench-jersey">{p.jersey_number}</span>
                  <span className="bench-name">{p.name}</span>
                </div>
              ))}
              {bench.length === 0 && (
                <p className="text-muted text-sm">All players on field</p>
              )}
            </div>
            {selection && (
              <button
                className="btn btn-secondary bench-cancel-btn"
                onClick={() => setSelection(null)}
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
