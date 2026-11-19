import { useCallback, useEffect, useState } from 'react';

// Estado de navegación en la URL (?view=…&status=…&lead=…): recargar o compartir el enlace
// conserva filtros, página y el lead abierto. Sin librería de rutas: hay dos vistas.
export type UrlState = {
  view: 'leads' | 'weights';
  status: string;
  agentId: string;
  q: string;
  page: number;
  lead: number | null;
};

function read(): UrlState {
  const p = new URLSearchParams(window.location.search);
  const lead = Number(p.get('lead'));
  return {
    view: p.get('view') === 'weights' ? 'weights' : 'leads',
    status: p.get('status') ?? '',
    agentId: p.get('agentId') ?? '',
    q: p.get('q') ?? '',
    page: Math.max(1, Number(p.get('page')) || 1),
    lead: Number.isInteger(lead) && lead > 0 ? lead : null,
  };
}

function write(state: UrlState, push: boolean) {
  const p = new URLSearchParams();
  if (state.view !== 'leads') p.set('view', state.view);
  if (state.status) p.set('status', state.status);
  if (state.agentId) p.set('agentId', state.agentId);
  if (state.q) p.set('q', state.q);
  if (state.page > 1) p.set('page', String(state.page));
  if (state.lead !== null) p.set('lead', String(state.lead));
  const url = p.size ? `?${p}` : window.location.pathname;
  if (url === window.location.search || (!p.size && !window.location.search)) return;
  if (push) window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

export function useUrlState() {
  const [state, setState] = useState(read);

  useEffect(() => {
    const onPop = () => setState(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // push: cambios que merecen entrada en el historial (abrir un lead, cambiar de vista);
  // el resto (teclear en el buscador, filtros) sustituye la entrada actual.
  const update = useCallback((patch: Partial<UrlState>, { push = false } = {}) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      write(next, push);
      return next;
    });
  }, []);

  return [state, update] as const;
}
