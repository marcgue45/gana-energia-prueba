import { CRITERIA, weightsInputSchema, type CriterionKey } from '@leads/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { CRITERION_LABELS, CRITERION_RULES } from '../labels';
import { useSession } from '../session';
import type { WeightsDto } from '../types';
import { ErrorBox, Notice, Spinner } from './ui';

type Draft = Record<CriterionKey, string>;
const toDraft = (dto: WeightsDto): Draft =>
  Object.fromEntries(dto.weights.map((w) => [w.criterion, String(w.weight)])) as Draft;

export function WeightsPage() {
  const { agent } = useSession();
  const isAdmin = agent.role === 'admin';
  const queryClient = useQueryClient();
  const weights = useQuery({ queryKey: ['weights'], queryFn: api.getWeights });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [base, setBase] = useState<WeightsDto | null>(null);
  const [result, setResult] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);

  // El borrador se inicializa con los pesos vigentes la primera vez que llegan
  useEffect(() => {
    if (weights.data && !base) {
      setBase(weights.data);
      setDraft(toDraft(weights.data));
    }
  }, [weights.data, base]);

  const mutation = useMutation({
    mutationFn: ({ list, version }: { list: WeightsDto['weights']; version: number }) => api.putWeights(list, version),
    onSuccess: (saved) => {
      queryClient.setQueryData(['weights'], saved);
      // Listado y detalles se calculan con los pesos vigentes: hay que volver a pedirlos
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead'] });
      setBase(saved);
      setDraft(toDraft(saved));
      setResult({ tone: 'success', text: `Pesos guardados (versión ${saved.version}). Las puntuaciones ya usan la nueva configuración.` });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'WEIGHTS_CONFLICT') {
        const current = (error.details as { current: WeightsDto }).current;
        queryClient.setQueryData(['weights'], current);
        setBase(current);
        setResult({
          tone: 'warning',
          text: `Otro administrador cambió los pesos mientras editabas (ahora: ${current.weights
            .map((w) => `${CRITERION_LABELS[w.criterion]} ${w.weight} %`)
            .join(', ')}). Tus valores siguen en el formulario: revísalos y vuelve a guardar.`,
        });
      }
    },
  });

  if (weights.isPending || !draft || !base) {
    return weights.isError ? <ErrorBox error={weights.error} onRetry={() => weights.refetch()} /> : <Spinner />;
  }

  // Validación en vivo con el mismo esquema que aplica la API
  const list = CRITERIA.map((criterion) => ({ criterion, weight: draft[criterion] === '' ? NaN : Number(draft[criterion]) }));
  const parsed = weightsInputSchema.safeParse(list);
  const issues = parsed.success ? [] : parsed.error.issues;
  const total = list.reduce((sum, w) => sum + (Number.isFinite(w.weight) ? w.weight : 0), 0);
  const fieldIssue = (i: number) => issues.find((issue) => issue.path[0] === i)?.message;
  const globalIssues = [...new Set(issues.filter((issue) => issue.path.length === 0).map((issue) => issue.message))];
  const unchanged = CRITERIA.every((c) => Number(draft[c]) === base.weights.find((w) => w.criterion === c)?.weight);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setResult(null);
    if (parsed.success) mutation.mutate({ list: list as WeightsDto['weights'], version: base.version });
  };

  return (
    <section className="page" aria-labelledby="weights-title">
      <div className="page-head">
        <h1 id="weights-title">Configuración de pesos</h1>
        <span className="muted">
          Versión {base.version} · {new Date(base.updatedAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>
      <p className="hint">
        La puntuación de cada lead es Σ (valoración × peso / 100). Los pesos son enteros, no pueden ser negativos y deben sumar exactamente 100 %.
        Al guardar, el listado se reordena con la nueva configuración sin recalcular nada en segundo plano.
      </p>
      {!isAdmin && <Notice tone="info">Solo un administrador puede cambiar los pesos. Entra como «Admin» para editarlos.</Notice>}

      <form onSubmit={onSubmit} noValidate>
        <div className="table-wrap weights-wrap">
          <table className="weights-table">
            <thead>
              <tr>
                <th scope="col">Criterio</th>
                <th scope="col">Peso</th>
                <th scope="col">Valoración (0–100)</th>
              </tr>
            </thead>
            <tbody>
              {CRITERIA.map((criterion, i) => (
                <tr key={criterion}>
                  <th scope="row">
                    <label htmlFor={`weight-${criterion}`}>{CRITERION_LABELS[criterion]}</label>
                  </th>
                  <td>
                    <span className="weight-input">
                      <input
                        id={`weight-${criterion}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        step={1}
                        value={draft[criterion]}
                        disabled={!isAdmin || mutation.isPending}
                        aria-invalid={fieldIssue(i) ? true : undefined}
                        onChange={(e) => setDraft({ ...draft, [criterion]: e.target.value })}
                      />
                      %
                    </span>
                    {fieldIssue(i) && <span className="field-error">{fieldIssue(i)}</span>}
                  </td>
                  <td className="rule-cell">{CRITERION_RULES[criterion]}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className={`mono ${total === 100 ? 'ok' : 'bad'}`}>{total} %</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {isAdmin && globalIssues.length > 0 && (
          <ul className="issues" role="alert">
            {globalIssues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {result && <Notice tone={result.tone}>{result.text}</Notice>}
        {mutation.isError && !(mutation.error instanceof ApiError && mutation.error.code === 'WEIGHTS_CONFLICT') && (
          <ErrorBox error={mutation.error} />
        )}

        {isAdmin && (
          <div className="actions">
            <button type="button" disabled={unchanged || mutation.isPending} onClick={() => { setDraft(toDraft(base)); setResult(null); }}>
              Deshacer cambios
            </button>
            <button type="submit" className="primary" disabled={!parsed.success || unchanged || mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Guardar pesos'}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
