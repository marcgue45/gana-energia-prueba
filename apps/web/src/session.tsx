import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setSessionAgent } from './api';
import type { Agent } from './types';

const STORAGE_KEY = 'crm-leads:agent-id';
export const SESSION_EXPIRED_EVENT = 'crm-leads:session-expired';

function readStoredId(): number | null {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

type Session = { agent: Agent; agents: Agent[]; switchAgent: (id: number | null) => void };
const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession fuera de <SessionProvider>');
  return session;
}

// Sesión simulada: el usuario elige con qué agente entrar. Se recuerda en localStorage.
export function SessionProvider({ children, login }: { children: ReactNode; login: (props: LoginProps) => ReactNode }) {
  const queryClient = useQueryClient();
  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: api.agents, staleTime: Infinity });
  const [agentId, setAgentId] = useState(readStoredId);

  const agents = agentsQuery.data ?? [];
  const agent = agents.find((a) => a.id === agentId) ?? null;
  // Antes de que los hijos lancen sus peticiones, la cabecera ya apunta al agente actual
  setSessionAgent(agent?.id ?? null);

  const switchAgent = (id: number | null) => {
    try {
      if (id === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      // sin almacenamiento: la sesión dura lo que la pestaña
    }
    setSessionAgent(id);
    setAgentId(id);
    // Lo que estaba en caché se pidió con otra identidad
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'agents' });
  };

  useEffect(() => {
    const onExpired = () => {
      switchAgent(null);
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  });

  if (!agent) {
    return login({ agents, loading: agentsQuery.isPending, error: agentsQuery.error, retry: () => agentsQuery.refetch(), onSelect: switchAgent });
  }
  return <SessionContext.Provider value={{ agent, agents, switchAgent }}>{children}</SessionContext.Provider>;
}

export type LoginProps = {
  agents: Agent[];
  loading: boolean;
  error: Error | null;
  retry: () => void;
  onSelect: (id: number) => void;
};
