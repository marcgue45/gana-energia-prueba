import type { LeadStatus, Priority } from '@leads/shared';
import type { ReactNode } from 'react';
import { ApiError } from '../api';
import { formatScore, PRIORITY_LABELS, STATUS_LABELS } from '../labels';

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function ScoreBadge({ score, priority }: { score: number; priority: Priority }) {
  return (
    <span className={`score priority-${priority}`}>
      <strong>{formatScore(score)}</strong> / {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <span className="spinner-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return 'Ha ocurrido un error inesperado.';
}

export function ErrorBox({ error, onRetry, children }: { error: unknown; onRetry?: () => void; children?: ReactNode }) {
  return (
    <div className="notice notice-error" role="alert">
      <span>{errorMessage(error)}</span>
      {children}
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'info' | 'warning' | 'success'; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role="status">
      {children}
    </div>
  );
}
