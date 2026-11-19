import { INTEREST_MAX, INTEREST_MIN, LEAD_SOURCES, leadCreateSchema, leadUpdateSchema, type LeadUpdateInput } from '@leads/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { formatPhone, SOURCE_LABELS } from '../labels';
import type { LeadDetail } from '../types';
import { ErrorBox, Notice } from './ui';

// Valores del formulario como texto (lo que tienen los inputs); '' = sin dato
type FormValues = { name: string; phone: string; isNewCustomer: string; interest: string; source: string };
type Field = keyof FormValues;

const FIELD_LABELS: Record<Field, string> = {
  name: 'Nombre',
  phone: 'Teléfono',
  isNewCustomer: 'Cliente nuevo',
  interest: 'Interés comercial',
  source: 'Origen',
};

const toForm = (lead: LeadDetail | null): FormValues => ({
  name: lead?.name ?? '',
  phone: lead ? formatPhone(lead.phone) : '',
  isNewCustomer: lead?.isNewCustomer === null || lead?.isNewCustomer === undefined ? '' : String(lead.isNewCustomer),
  interest: lead?.interest == null ? '' : String(lead.interest),
  source: lead?.source ?? '',
});

const toPayload = (v: FormValues) => ({
  name: v.name,
  phone: v.phone,
  isNewCustomer: v.isNewCustomer === '' ? null : v.isNewCustomer === 'true',
  interest: v.interest === '' ? null : Number(v.interest),
  source: v.source === '' ? null : v.source,
});

const fieldErrorsFromIssues = (issues: { path: PropertyKey[]; message: string }[]) =>
  Object.fromEntries(issues.map((i) => [String(i.path[0] ?? ''), i.message]));

type Props = {
  lead: LeadDetail | null; // null = alta
  onSaved: (lead: LeadDetail) => void;
  onCancel: () => void;
};

export function LeadForm({ lead, onSaved, onCancel }: Props) {
  const queryClient = useQueryClient();
  // `base` es la versión del lead sobre la que el usuario está editando
  const [base, setBase] = useState(lead);
  const [values, setValues] = useState(() => toForm(lead));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<LeadDetail | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Campos que el usuario ha cambiado respecto a la versión de partida
  const changedFields = (Object.keys(values) as Field[]).filter((f) => values[f] !== toForm(base)[f]);

  const mutation = useMutation({
    mutationFn: (payload: { create: true; data: unknown } | { create: false; data: LeadUpdateInput }) =>
      payload.create ? api.createLead(payload.data as never) : api.updateLead(base!.id, payload.data),
    onSuccess: (saved) => {
      queryClient.setQueryData(['lead', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      onSaved(saved);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'LEAD_CONFLICT') {
        const current = (error.details as { current: LeadDetail }).current;
        queryClient.setQueryData(['lead', current.id], current);
        setConflict(current);
      } else if (error instanceof ApiError && error.status === 400) {
        setErrors(error.fieldErrors);
      }
    },
  });

  function submit(version?: number) {
    setInfo(null);
    setErrors({});
    const payload = toPayload(values);
    if (!base) {
      const parsed = leadCreateSchema.safeParse(payload);
      if (!parsed.success) return setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return mutation.mutate({ create: true, data: payload });
    }
    if (changedFields.length === 0) return setInfo('No has cambiado ningún dato.');
    // Solo se envían los campos modificados, con la versión sobre la que se editó
    const patch = Object.fromEntries(changedFields.map((f) => [f, payload[f]]));
    const parsed = leadUpdateSchema.safeParse({ ...patch, version: version ?? base.version });
    if (!parsed.success) return setErrors(fieldErrorsFromIssues(parsed.error.issues));
    setConflict(null);
    mutation.mutate({ create: false, data: { ...patch, version: version ?? base.version } as LeadUpdateInput });
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const set = (field: Field) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const fieldProps = (field: Field) => ({
    id: `lead-${field}`,
    value: values[field],
    onChange: set(field),
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `lead-${field}-error` : undefined,
  });
  const error = (field: Field) =>
    errors[field] ? (
      <span className="field-error" id={`lead-${field}-error`}>
        {errors[field]}
      </span>
    ) : null;

  // Qué cambió la otra persona: campos en los que la versión actual difiere de la de partida
  const theirChanges = conflict && base ? (Object.keys(values) as Field[]).filter((f) => toForm(conflict)[f] !== toForm(base)[f]) : [];

  return (
    <form className="lead-form" onSubmit={onSubmit} noValidate>
      {conflict && (
        <div className="notice notice-warning conflict" role="alert">
          <p>
            <strong>Mientras editabas, otra persona guardó cambios en este lead.</strong>
          </p>
          {theirChanges.length > 0 ? (
            <ul>
              {theirChanges.map((f) => (
                <li key={f}>
                  {FIELD_LABELS[f]}: ahora es «{displayValue(f, toForm(conflict)[f])}»
                </li>
              ))}
            </ul>
          ) : (
            <p>Cambió la asignación o el estado; tus campos no se ven afectados.</p>
          )}
          <div className="actions">
            <button type="button" onClick={() => { setBase(conflict); setValues(toForm(conflict)); setConflict(null); }}>
              Descartar mis cambios
            </button>
            <button type="button" className="primary" onClick={() => { setBase(conflict); submit(conflict.version); }}>
              Guardar mis cambios encima
            </button>
          </div>
        </div>
      )}

      <label htmlFor="lead-name">Nombre</label>
      <div className="field">
        <input type="text" autoComplete="off" {...fieldProps('name')} />
        {error('name')}
      </div>

      <label htmlFor="lead-phone">Teléfono</label>
      <div className="field">
        <input type="tel" autoComplete="off" placeholder="+34 612 345 678" {...fieldProps('phone')} />
        {error('phone')}
      </div>

      <label htmlFor="lead-isNewCustomer">Cliente nuevo</label>
      <div className="field">
        <select {...fieldProps('isNewCustomer')}>
          <option value="">Sin dato</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
        {error('isNewCustomer')}
      </div>

      <label htmlFor="lead-interest">Interés comercial</label>
      <div className="field">
        <select {...fieldProps('interest')}>
          <option value="">Sin dato</option>
          {Array.from({ length: INTEREST_MAX - INTEREST_MIN + 1 }, (_, i) => INTEREST_MIN + i).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {error('interest')}
      </div>

      <label htmlFor="lead-source">Origen</label>
      <div className="field">
        <select {...fieldProps('source')}>
          <option value="">Sin dato</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
        {error('source')}
      </div>

      <p className="hint full">Los datos que falten valen 0 en su criterio. La puntuación la calcula siempre el servidor.</p>

      {info && (
        <div className="full">
          <Notice tone="info">{info}</Notice>
        </div>
      )}
      {mutation.isError && !conflict && !(mutation.error instanceof ApiError && mutation.error.status === 400) && (
        <div className="full">
          <ErrorBox error={mutation.error} />
        </div>
      )}

      <div className="actions full">
        <button type="button" onClick={onCancel} disabled={mutation.isPending}>
          Cancelar
        </button>
        <button type="submit" className="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Guardando…' : base ? 'Guardar cambios' : 'Crear lead'}
        </button>
      </div>
    </form>
  );
}

function displayValue(field: Field, value: string) {
  if (value === '') return 'Sin dato';
  if (field === 'isNewCustomer') return value === 'true' ? 'Sí' : 'No';
  if (field === 'source') return SOURCE_LABELS[value as keyof typeof SOURCE_LABELS];
  return value;
}
