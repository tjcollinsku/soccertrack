import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useTeam } from '../state/team';

export default function TeamSwitcher() {
  const { teams, activeTeam, setActiveTeamId, refreshTeams } = useTeam();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setNewName('');
        setError(null);
      }
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError(null);
    const { data, error: err } = await api.POST('/api/teams/', {
      body: { name } as never,
    });
    if (err) {
      setError('Could not create team.');
      return;
    }
    await refreshTeams();
    if (data && typeof (data as { id?: number }).id === 'number') {
      setActiveTeamId((data as { id: number }).id);
    }
    setAdding(false);
    setNewName('');
    setOpen(false);
  }

  return (
    <div className="team-switcher" ref={ref}>
      <button
        className="team-switcher-btn"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="team-name">{activeTeam?.name ?? 'No team'}</span>
        <span className="team-chevron">▾</span>
      </button>

      {open && (
        <div className="team-dropdown">
          <div className="team-dropdown-label">Switch Team</div>
          {teams.map((t) => (
            <button
              key={t.id}
              className={`team-option${t.id === activeTeam?.id ? ' active' : ''}`}
              onClick={() => {
                setActiveTeamId(t.id);
                setOpen(false);
              }}
            >
              {t.name}
            </button>
          ))}

          <div className="team-dropdown-divider" />

          {adding ? (
            <form onSubmit={handleAdd} className="team-add-form">
              <input
                autoFocus
                placeholder="New team name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              {error && <div className="team-add-error">{error}</div>}
              <div className="team-add-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setAdding(false); setNewName(''); setError(null); }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          ) : (
            <button
              className="team-add-btn"
              onClick={() => setAdding(true)}
            >
              + Add Team
            </button>
          )}
        </div>
      )}
    </div>
  );
}
