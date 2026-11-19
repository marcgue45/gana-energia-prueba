import { LEAD_STATUSES, type LeadStatus } from '@leads/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { CRITERION_LABELS, CRITERION_RULES, formatDate, formatPhone, formatScore, SOURCE_LABELS, STATUS_LABELS } from '../labels';
import { useSession } from '../session';
import type { BreakdownItem, LeadDetail } from '../types';
import { LeadForm } from './LeadForm';
import { ErrorBox, Notice, ScoreBadge, Spinner } from './ui';

type Props = { leadId: number | 'new'; onClose: () => void; onCreated: (id: number) => void };

// Panel lateral con el detalle del lead (o el formulario de alta)
export function LeadPanel({ leadId, onClose, onCreated }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="panel-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title">
        <header className="panel-header">
          <h2 id="panel-title">{leadId === 'new' ? 'Nuevo lead' : 'Detalle del lead'}</h2>
          <button type="button" ref={closeRef} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>
        {leadId === 'new' ? (
          <LeadForm lead={null} onCancel={onClose} onSaved={(lead) => onCreated(lead.id)} />
        ) : (
          <LeadDetailView id={leadId} />
        )}
      </aside>
    </div>
  );
}

function LeadDetailView({ id }: { id: number }) {
  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => api.getLead(id) });
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  if (lead.isPending) return <div className="panel-body"><Spinner /></div>;
  if (lead.isError) {
    return (
      <div className="panel-body">
        <ErrorBox error={lead.error} onRetry={lead.error instanceof ApiError && lead.error.status === 404 ? undefined : () => lead.refetch()} />
      </div>
    );
  }
  const data = lead.data;

  return (
    <div className="panel-body">
      <div className="lead-head">
        <div>
          <h3>{data.name}</h3>
          <p className="muted mono">{formatPhone(data.phone)}</p>
        </div>
        <ScoreBadge score={data.score} priority={data.priority} />
      </div>

      {saved && <Notice tone="success">Cambios guardados.</Notice>}

      {editing ? (
        <LeadForm
          lead={data}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSaved(true);
          }}
        />
      ) : (
        <>
          <Operations lead={data} onEdit={() => { setSaved(false); setEditing(true); }} />
          <Breakdown lead={data} />
          <dl className="meta">
            <dt>Cliente nuevo</dt>
            <dd>{data.isNewCustomer === null ? 'Sin dato' : data.isNewCustomer ? 'Sí' : 'No'}</dd>
            <dt>Interés comercial</dt>
            <dd>{data.interest ?? 'Sin dato'}</dd>
            <dt>Origen</dt>
            <dd>{data.source ? SOURCE_LABELS[data.source] : 'Sin dato'}</dd>
            <dt>Creado</dt>
            <dd>{formatDate(data.createdAt)}</dd>
            <dt>Última modificación</dt>
            <dd>{formatDate(data.updatedAt)}</dd>
          </dl>
        </>
      )}
    </div>
  );
}

// Estado y asignación. Cada acción usa la versión que se está viendo; si otra persona cambió
// el lead entre medias, la API responde 409 y se muestran los datos actuales.
function Operations({ lead, onEdit }: { lead: LeadDetail; onEdit: () => void }) {
  const { agent: me, agents } = useSession();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ tone: 'warning' | 'error'; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (action: { type: 'status'; status: LeadStatus } | { type: 'assign'; agentId?: number } | { type: 'unassign' }) => {
      if (action.type === 'status') return api.updateLead(lead.id, { status: action.status, version: lead.version });
      if (action.type === 'assign') return api.assign(lead.id, action.agentId);
      return api.unassign(lead.id);
    },
    onMutate: () => setMessage(null),
    onSuccess: (updated) => {
      queryClient.setQueryData(['lead', updated.id], updated);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error) => {
      const current = error instanceof ApiError ? (error.details as { current?: LeadDetail } | undefined)?.current : undefined;
      if (current) {
        queryClient.setQueryData(['lead', current.id], current);
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        setMessage({ tone: 'warning', text: `${error.message} Se muestran los datos actuales.` });
      } else {
        setMessage({ tone: 'error', text: error instanceof ApiError ? error.message : 'No se pudo completar la acción.' });
      }
    },
  });

  const isAdmin = me.role === 'admin';
  const isMine = lead.agent?.id === me.id;
  const [target, setTarget] = useState('');

  return (
    <section className="operations" aria-label="Operaciones">
      <div className="op-row">
        <label htmlFor="lead-status-select">Estado</label>
        <select
          id="lead-status-select"
          value={lead.status}
          disabled={mutation.isPending}
          onChange={(e) => mutation.mutate({ type: 'status', status: e.target.value as LeadStatus })}
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="op-row">
        <span className="op-label">Agente</span>
        <span>{lead.agent ? lead.agent.name : <span className="muted">Sin asignar</span>}</span>
        <span className="op-actions">
          {!lead.agent && me.role === 'agent' && (
            <button type="button" className="primary" disabled={mutation.isPending} onClick={() => mutation.mutate({ type: 'assign' })}>
              Asignármelo
            </button>
          )}
          {lead.agent && (isMine || isAdmin) && (
            <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ type: 'unassign' })}>
              Desasignar
            </button>
          )}
        </span>
      </div>

      {isAdmin && !lead.agent && (
        <div className="op-row">
          <label htmlFor="lead-assign-select">Asignar a</label>
          <select id="lead-assign-select" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Elige un agente</option>
            {agents
              .filter((a) => a.role === 'agent')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="primary"
            disabled={!target || mutation.isPending}
            onClick={() => mutation.mutate({ type: 'assign', agentId: Number(target) })}
          >
            Asignar
          </button>
        </div>
      )}

      {mutation.isPending && <Spinner label="Guardando…" />}
      {message && (
        <div className={`notice notice-${message.tone}`} role="alert">
          {message.text}
        </div>
      )}

      <div>
        <button type="button" onClick={onEdit}>
          Editar datos
        </button>
      </div>
    </section>
  );
}

function dataValue(lead: LeadDetail, item: BreakdownItem) {
  switch (item.criterion) {
    case 'newCustomer':
      return lead.isNewCustomer === null ? 'Sin dato' : lead.isNewCustomer ? 'Sí' : 'No';
    case 'interest':
      return lead.interest === null ? 'Sin dato' : `${lead.interest} / 10`;
    case 'source':
      return lead.source ? SOURCE_LABELS[lead.source] : 'Sin dato';
    case 'age': {
      const days = Math.max(0, (Date.now() - new Date(lead.createdAt).getTime()) / 86_400_000);
      return `${Math.floor(days)} días`;
    }
  }
}

function Breakdown({ lead }: { lead: LeadDetail }) {
  return (
    <section aria-labelledby="breakdown-title">
      <h4 id="breakdown-title">Desglose de la puntuación</h4>
      <p className="hint">
        Cada criterio se valora de 0 a 100 y aporta valoración × peso / 100. Pesos vigentes: versión {lead.weightsVersion}.
      </p>
      <div className="table-wrap">
        <table className="breakdown">
          <thead>
            <tr>
              <th scope="col">Criterio</th>
              <th scope="col">Dato</th>
              <th scope="col">Valoración</th>
              <th scope="col" className="num">Peso</th>
              <th scope="col" className="num">Aporte</th>
            </tr>
          </thead>
          <tbody>
            {lead.breakdown.map((item) => (
              <tr key={item.criterion}>
                <th scope="row">
                  {CRITERION_LABELS[item.criterion]}
                  <span className="rule">{CRITERION_RULES[item.criterion]}</span>
                </th>
                <td>
                  {dataValue(lead, item)}
                  {item.note && <span className="note">{item.note}</span>}
                </td>
                <td>
                  <span className="bar" aria-hidden="true">
                    <span style={{ width: `${item.rating}%` }} />
                  </span>
                  <span className="mono">{formatScore(item.rating)}</span>
                </td>
                <td className="num mono">{item.weight} %</td>
                <td className="num mono">{formatScore(item.contribution)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={4}>
                Puntuación
              </th>
              <td className="num mono">
                <strong>{formatScore(lead.score)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
