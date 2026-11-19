import {
  AGE_MAX_DAYS,
  INTEREST_MAX,
  INTEREST_MIN,
  SOURCE_RATINGS,
  type CriterionKey,
  type LeadSource,
  type LeadStatus,
  type Priority,
} from '@leads/shared';

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nuevo',
  in_progress: 'En gestión',
  contacted: 'Contactado',
  closed: 'Cerrado',
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  referral: 'Recomendación',
  web: 'Web',
  phone: 'Teléfono',
  cold: 'Captación en frío',
};

export const PRIORITY_LABELS: Record<Priority, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  newCustomer: 'Cliente nuevo',
  interest: 'Interés comercial',
  source: 'Origen del lead',
  age: 'Antigüedad',
};

// Reglas de valoración en lenguaje llano, generadas desde las constantes compartidas
export const CRITERION_RULES: Record<CriterionKey, string> = {
  newCustomer: 'Sí → 100 · No → 0 · Sin dato → 0',
  interest: `Lineal: ${INTEREST_MIN} → 0, ${INTEREST_MAX} → 100 · Sin dato → 0`,
  source: `${(Object.keys(SOURCE_RATINGS) as LeadSource[]).map((s) => `${SOURCE_LABELS[s]} ${SOURCE_RATINGS[s]}`).join(' · ')} · Sin dato → 0`,
  age: `Lineal: recién creado → 100, ${AGE_MAX_DAYS} días o más → 0`,
};

// Truncado (no redondeo) a un decimal: así la cifra mostrada nunca contradice la prioridad.
// Con redondeo, 74,96 se vería como "75,0 / Media".
export function formatScore(score: number) {
  const truncated = Math.floor(score * 10) / 10;
  return truncated.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

export function formatPhone(phone: string) {
  // +34612345678 → +34 612 345 678 (solo presentación; se guarda sin espacios)
  const m = phone.match(/^(\+\d{2})?(\d{3})(\d{3})(\d{3})$/);
  return m ? [m[1], m[2], m[3], m[4]].filter(Boolean).join(' ') : phone;
}
