import { LEAD_STATUSES } from '@leads/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { formatPhone, STATUS_LABELS } from '../labels';
import { useSession } from '../session';
import type { UrlState } from '../url-state';
import { ErrorBox, Notice, ScoreBadge, Spinner, StatusBadge } from './ui';

const PAGE_SIZE = 20;

type Props = {
  url: UrlState;
  setUrl: (patch: Partial<UrlState>, opts?: { push?: boolean }) => void;
  onCreate: () => void;
};

export function LeadsPage({ url, setUrl, onCreate }: Props) {
  const { agents } = useSession();
  const query = {
    status: url.status || undefined,
    agentId: url.agentId || undefined,
    q: url.q || undefined,
    page: url.page,
    pageSize: PAGE_SIZE,
  };
  const leads = useQuery({
    queryKey: ['leads', query],
    queryFn: () => api.listLeads(query as Parameters<typeof api.listLeads>[0]),
    // Al cambiar de página o filtro se mantiene la tabla anterior hasta que llegan los datos nuevos
    placeholderData: keepPreviousData,
  });

  // Búsqueda con espera de 300 ms: no se lanza una petición por cada tecla
  const [search, setSearch] = useState(url.q);
  useEffect(() => setSearch(url.q), [url.q]);
  useEffect(() => {
    if (search.trim() === url.q) return;
    const t = setTimeout(() => setUrl({ q: search.trim(), page: 1 }), 300);
    return () => clearTimeout(t);
  }, [search, url.q, setUrl]);

  // Aviso cuando la configuración de pesos cambia mientras se consulta el listado
  const seenWeights = useRef<number | null>(null);
  const [weightsChanged, setWeightsChanged] = useState<number | null>(null);
  const currentWeights = leads.data?.weightsVersion;
  useEffect(() => {
    if (currentWeights === undefined) return;
    if (seenWeights.current !== null && currentWeights !== seenWeights.current) setWeightsChanged(currentWeights);
    seenWeights.current = currentWeights;
  }, [currentWeights]);

  const data = leads.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  // Si un filtro deja la página actual fuera de rango (p. ej. página 5 de 2), volver a la última
  useEffect(() => {
    if (data && !leads.isPlaceholderData && url.page > totalPages) setUrl({ page: totalPages });
  }, [data, leads.isPlaceholderData, url.page, totalPages, setUrl]);

  const hasFilters = Boolean(url.status || url.agentId || url.q);
  const from = data && data.total ? (data.page - 1) * PAGE_SIZE + 1 : 0;
  const to = data ? Math.min(data.page * PAGE_SIZE, data.total) : 0;

  return (
    <section className="page" aria-labelledby="leads-title">
      <h1 id="leads-title" className="visually-hidden">
        Leads comerciales
      </h1>
      <div className="toolbar">
        <input
          type="search"
          id="lead-search"
          aria-label="Buscar por nombre o teléfono"
          placeholder="Buscar nombre o teléfono"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select id="filter-status" aria-label="Filtrar por estado" value={url.status} onChange={(e) => setUrl({ status: e.target.value, page: 1 })}>
          <option value="">Estado: todos</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select id="filter-agent" aria-label="Filtrar por agente" value={url.agentId} onChange={(e) => setUrl({ agentId: e.target.value, page: 1 })}>
          <option value="">Agente: todos</option>
          <option value="none">Sin asignar</option>
          {agents
            .filter((a) => a.role === 'agent')
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
        <button type="button" className="primary" onClick={onCreate}>
          + Nuevo
        </button>
      </div>

      {weightsChanged !== null && (
        <Notice tone="info">
          <span>La configuración de pesos ha cambiado (v{weightsChanged}). Las puntuaciones y el orden ya usan los pesos nuevos.</span>
          <button type="button" onClick={() => setWeightsChanged(null)}>
            Entendido
          </button>
        </Notice>
      )}

      {leads.isPending ? (
        <div className="table-state">
          <Spinner label="Cargando leads…" />
        </div>
      ) : leads.isError && !data ? (
        <ErrorBox error={leads.error} onRetry={() => leads.refetch()} />
      ) : data && data.items.length === 0 ? (
        <div className="table-state">
          <p>{hasFilters ? 'Ningún lead coincide con estos filtros.' : 'Todavía no hay leads.'}</p>
          {hasFilters && (
            <button type="button" onClick={() => setUrl({ status: '', agentId: '', q: '', page: 1 })}>
              Quitar filtros
            </button>
          )}
        </div>
      ) : (
        data && (
          <>
            {leads.isError && <ErrorBox error={leads.error} onRetry={() => leads.refetch()} />}
            <div className={`table-wrap ${leads.isPlaceholderData ? 'is-stale' : ''}`} aria-busy={leads.isFetching}>
              <table className="leads-table">
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col" className="col-phone">Teléfono</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="col-agent">Agente</th>
                    <th scope="col" aria-sort="descending">
                      Score ↓
                    </th>
                    <th scope="col">
                      <span className="visually-hidden">Acción</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((lead) => (
                    <tr key={lead.id} className={url.lead === lead.id ? 'selected' : undefined}>
                      <td>
                        <button type="button" className="link" onClick={() => setUrl({ lead: lead.id }, { push: true })}>
                          {lead.name}
                        </button>
                      </td>
                      <td className="col-phone mono">{formatPhone(lead.phone)}</td>
                      <td>
                        <StatusBadge status={lead.status} />
                      </td>
                      <td className="col-agent">{lead.agent?.name ?? <span className="muted">—</span>}</td>
                      <td>
                        <ScoreBadge score={lead.score} priority={lead.priority} />
                      </td>
                      <td>
                        <button type="button" onClick={() => setUrl({ lead: lead.id }, { push: true })} aria-label={`Ver ${lead.name}`}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="pagination" aria-label="Paginación">
              <span>
                {from}–{to} de {data.total.toLocaleString('es-ES')}
                {leads.isFetching && <Spinner label="" />}
              </span>
              <span className="pagination-buttons">
                <button type="button" disabled={url.page <= 1} onClick={() => setUrl({ page: url.page - 1 })}>
                  Anterior
                </button>
                <span className="muted">
                  Página {url.page} de {totalPages}
                </span>
                <button type="button" disabled={url.page >= totalPages} onClick={() => setUrl({ page: url.page + 1 })}>
                  Siguiente
                </button>
              </span>
            </nav>
          </>
        )
      )}
    </section>
  );
}
