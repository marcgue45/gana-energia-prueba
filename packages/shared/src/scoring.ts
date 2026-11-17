import {
  AGE_MAX_DAYS,
  INTEREST_MAX,
  INTEREST_MIN,
  PRIORITY_HIGH_MIN,
  PRIORITY_MEDIUM_MIN,
  SOURCE_RATINGS,
  type LeadSource,
} from './constants.js';

export type LeadScoringInput = {
  isNewCustomer: boolean | null;
  interest: number | null;
  source: string | null;
  createdAt: Date;
};

export type CriterionKey = 'newCustomer' | 'interest' | 'source' | 'age';
export type Weights = Record<CriterionKey, number>;
export type Rating = { value: number; note?: string }; // note sirve para explicar el desglose
export type Priority = 'high' | 'medium' | 'low';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MISSING = 'Dato ausente';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function rateNewCustomer(lead: LeadScoringInput): Rating {
  if (lead.isNewCustomer === null) return { value: 0, note: MISSING };
  return { value: lead.isNewCustomer ? 100 : 0 };
}

export function rateInterest(lead: LeadScoringInput): Rating {
  if (lead.interest === null) return { value: 0, note: MISSING };
  if (!Number.isFinite(lead.interest)) return { value: 0, note: 'Valor no numérico' };

  const interest = clamp(lead.interest, INTEREST_MIN, INTEREST_MAX);
  const value = ((interest - INTEREST_MIN) / (INTEREST_MAX - INTEREST_MIN)) * 100;
  const note = interest !== lead.interest ? `Fuera de rango, ajustado a ${interest}` : undefined;
  return { value, note };
}

export function rateSource(lead: LeadScoringInput): Rating {
  if (lead.source === null) return { value: 0, note: MISSING };
  if (!Object.hasOwn(SOURCE_RATINGS, lead.source)) {
    return { value: 0, note: `Origen desconocido: ${lead.source}` };
  }
  return { value: SOURCE_RATINGS[lead.source as LeadSource] };
}

export function rateAge(lead: LeadScoringInput, now: Date): Rating {
  const ageMs = now.getTime() - lead.createdAt.getTime();
  if (!Number.isFinite(ageMs)) return { value: 0, note: 'Fecha inválida' };

  const days = clamp(ageMs / MS_PER_DAY, 0, AGE_MAX_DAYS);
  const value = (1 - days / AGE_MAX_DAYS) * 100;
  const note = ageMs < 0 ? 'Fecha de creación futura, tratada como recién creado' : undefined;
  return { value, note };
}

export function toPriority(total: number): Priority {
  if (total >= PRIORITY_HIGH_MIN) return 'high';
  if (total >= PRIORITY_MEDIUM_MIN) return 'medium';
  return 'low';
}

const raters: Record<CriterionKey, (lead: LeadScoringInput, now: Date) => Rating> = {
  newCustomer: rateNewCustomer,
  interest: rateInterest,
  source: rateSource,
  age: rateAge,
};

export function scoreLead(lead: LeadScoringInput, weights: Weights, now: Date) {
  const breakdown = (Object.keys(raters) as CriterionKey[]).map((key) => {
    const rating = raters[key](lead, now);
    const weight = weights[key];
    return {
      criterion: key,
      rating: rating.value,
      weight,
      contribution: (rating.value * weight) / 100,
      note: rating.note,
    };
  });

  const total = breakdown.reduce((sum, b) => sum + b.contribution, 0);
  return { total, priority: toPriority(total), breakdown };
}
