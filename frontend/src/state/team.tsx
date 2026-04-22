import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { components } from '../api/schema';

export type Team = components['schemas']['Team'];

type TeamContextValue = {
  teams: Team[];
  activeTeam: Team | null;
  setActiveTeamId: (id: number) => void;
  refreshTeams: () => Promise<void>;
  loading: boolean;
};

const TeamContext = createContext<TeamContextValue | null>(null);

const STORAGE_KEY = 'soccertrack_active_team_id';

export function TeamProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  async function refreshTeams() {
    const { data } = await api.GET('/api/teams/');
    const list = data ?? [];
    setTeams(list);
    setLoading(false);

    if (list.length > 0) {
      const known = list.some((t) => t.id === activeTeamId);
      if (!known) {
        setActiveTeamIdState(list[0].id);
        localStorage.setItem(STORAGE_KEY, String(list[0].id));
      }
    }
  }

  useEffect(() => {
    refreshTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setActiveTeamId(id: number) {
    setActiveTeamIdState(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null;

  return (
    <TeamContext.Provider value={{ teams, activeTeam, setActiveTeamId, refreshTeams, loading }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeam must be used inside <TeamProvider>');
  return ctx;
}
