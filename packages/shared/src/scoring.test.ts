import { describe, expect, it } from 'vitest';
import { AGE_MAX_DAYS, INTEREST_MAX, INTEREST_MIN, SOURCE_RATINGS } from './constants.js';
import {
  type LeadScoringInput,
  type Weights,
  clamp,
  rateAge,
  rateInterest,
  rateLeadData,
  rateNewCustomer,
  rateSource,
  scoreLead,
  toPriority,
} from './scoring.js';

const NOW = new Date('2026-11-17T12:00:00Z');

const INITIAL_WEIGHTS: Weights = { newCustomer: 40, interest: 30, source: 20, age: 10 };
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

function makeLead(overrides: Partial<LeadScoringInput> = {}): LeadScoringInput {
  return {
    isNewCustomer: true,
    interest: 3,
    source: 'web',
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

describe('rateNewCustomer', () => {
  it('cliente nuevo vale 100', () => {
    expect(rateNewCustomer(makeLead({ isNewCustomer: true })).value).toBe(100);
  });

  it('cliente existente vale 0', () => {
    expect(rateNewCustomer(makeLead({ isNewCustomer: false })).value).toBe(0);
  });

  it('dato ausente vale 0 y lo explica en la nota', () => {
    const rating = rateNewCustomer(makeLead({ isNewCustomer: null }));
    expect(rating.value).toBe(0);
    expect(rating.note).toBeDefined();
  });
});

describe('clamp', () => {
  it.each([
    [5, 5],
    [-3, 0],
    [42, 10],
  ])('clamp(%d, 0, 10) → %d', (value, expected) => {
    expect(clamp(value, 0, 10)).toBe(expected);
  });
});

describe('rateInterest', () => {
  it('el mínimo de la escala vale 0 y el máximo 100', () => {
    expect(rateInterest(makeLead({ interest: INTEREST_MIN })).value).toBe(0);
    expect(rateInterest(makeLead({ interest: INTEREST_MAX })).value).toBe(100);
  });

  it('es lineal: el punto medio de la escala vale 50', () => {
    const mid = (INTEREST_MIN + INTEREST_MAX) / 2;
    expect(rateInterest(makeLead({ interest: mid })).value).toBeCloseTo(50);
  });

  it('un valor válido no lleva nota', () => {
    expect(rateInterest(makeLead({ interest: INTEREST_MAX })).note).toBeUndefined();
  });

  it('dato ausente vale 0 y lo explica en la nota', () => {
    const rating = rateInterest(makeLead({ interest: null }));
    expect(rating.value).toBe(0);
    expect(rating.note).toBeDefined();
  });

  it('por debajo del mínimo se ajusta al mínimo (0) con nota', () => {
    const rating = rateInterest(makeLead({ interest: INTEREST_MIN - 5 }));
    expect(rating.value).toBe(0);
    expect(rating.note).toContain(String(INTEREST_MIN));
  });

  it('por encima del máximo se ajusta al máximo (100) con nota', () => {
    const rating = rateInterest(makeLead({ interest: INTEREST_MAX + 5 }));
    expect(rating.value).toBe(100);
    expect(rating.note).toContain(String(INTEREST_MAX));
  });

  it.each([NaN, Infinity, -Infinity])('%d no es un valor válido: vale 0 con nota', (interest) => {
    const rating = rateInterest(makeLead({ interest }));
    expect(rating.value).toBe(0);
    expect(rating.note).toBeDefined();
  });
});

describe('rateSource', () => {
  it.each(Object.entries(SOURCE_RATINGS))('%s vale %d', (source, expected) => {
    const rating = rateSource(makeLead({ source }));
    expect(rating.value).toBe(expected);
    expect(rating.note).toBeUndefined();
  });

  it('origen desconocido vale 0 y lo indica en la nota', () => {
    const rating = rateSource(makeLead({ source: 'carrier-pigeon' }));
    expect(rating.value).toBe(0);
    expect(rating.note).toContain('carrier-pigeon');
  });

  it('no confunde propiedades heredadas de Object con orígenes válidos', () => {
    expect(rateSource(makeLead({ source: 'toString' })).value).toBe(0);
  });

  it('dato ausente vale 0 y lo explica en la nota', () => {
    const rating = rateSource(makeLead({ source: null }));
    expect(rating.value).toBe(0);
    expect(rating.note).toBeDefined();
  });
});

describe('rateAge', () => {
  it('un lead recién creado vale 100', () => {
    expect(rateAge(makeLead({ createdAt: NOW }), NOW).value).toBe(100);
  });

  it('a mitad del tope vale 50', () => {
    expect(rateAge(makeLead({ createdAt: daysAgo(AGE_MAX_DAYS / 2) }), NOW).value).toBeCloseTo(50);
  });

  it('en el tope o más allá vale 0', () => {
    expect(rateAge(makeLead({ createdAt: daysAgo(AGE_MAX_DAYS) }), NOW).value).toBe(0);
    expect(rateAge(makeLead({ createdAt: daysAgo(AGE_MAX_DAYS * 10) }), NOW).value).toBe(0);
  });

  it('una fecha futura se trata como recién creado, con nota', () => {
    const rating = rateAge(makeLead({ createdAt: daysAgo(-3) }), NOW);
    expect(rating.value).toBe(100);
    expect(rating.note).toBeDefined();
  });

  it('una fecha inválida vale 0 con nota', () => {
    const rating = rateAge(makeLead({ createdAt: new Date('no-es-una-fecha') }), NOW);
    expect(rating.value).toBe(0);
    expect(rating.note).toBeDefined();
  });
});

// Umbrales enunciado: alta ≥ 75, media ≥ 40 y < 75, baja < 40
describe('toPriority', () => {
  it.each([
    [100, 'high'],
    [75, 'high'],
    [74.99, 'medium'],
    [40, 'medium'],
    [39.99, 'low'],
    [0, 'low'],
  ] as const)('%d → %s', (total, expected) => {
    expect(toPriority(total)).toBe(expected);
  });
});

describe('scoreLead', () => {
  it('con todo el peso en un criterio, el total es la valoración de ese criterio', () => {
    const onlyNewCustomer: Weights = { newCustomer: 100, interest: 0, source: 0, age: 0 };
    expect(scoreLead(makeLead({ isNewCustomer: true }), onlyNewCustomer, NOW).total).toBe(100);
    expect(scoreLead(makeLead({ isNewCustomer: false }), onlyNewCustomer, NOW).total).toBe(0);
  });

  it('el desglose incluye los cuatro criterios con su peso', () => {
    const { breakdown } = scoreLead(makeLead(), INITIAL_WEIGHTS, NOW);
    expect(breakdown.map((b) => [b.criterion, b.weight])).toEqual([
      ['newCustomer', 40],
      ['interest', 30],
      ['source', 20],
      ['age', 10],
    ]);
  });

  it('cada aporte es valoración × peso / 100 y el total es su suma', () => {
    const { total, breakdown } = scoreLead(makeLead(), INITIAL_WEIGHTS, NOW);
    for (const b of breakdown) {
      expect(b.contribution).toBeCloseTo((b.rating * b.weight) / 100);
    }
    expect(total).toBeCloseTo(breakdown.reduce((sum, b) => sum + b.contribution, 0));
  });

  it('valoraciones y total quedan entre 0 y 100, incluso con datos ausentes', () => {
    const leads = [
      makeLead(),
      makeLead({ isNewCustomer: null, interest: null, source: null }),
      makeLead({ createdAt: new Date('2000-01-01T00:00:00Z') }),
    ];
    for (const lead of leads) {
      const { total, breakdown } = scoreLead(lead, INITIAL_WEIGHTS, NOW);
      expect(total).toBeGreaterThanOrEqual(0);
      expect(total).toBeLessThanOrEqual(100);
      for (const b of breakdown) {
        expect(b.rating).toBeGreaterThanOrEqual(0);
        expect(b.rating).toBeLessThanOrEqual(100);
      }
    }
  });

  it('la prioridad corresponde al total', () => {
    const result = scoreLead(makeLead(), INITIAL_WEIGHTS, NOW);
    expect(result.priority).toBe(toPriority(result.total));
  });

  it('es determinista: mismos datos y misma fecha dan el mismo resultado', () => {
    const lead = makeLead();
    expect(scoreLead(lead, INITIAL_WEIGHTS, NOW)).toEqual(scoreLead(lead, INITIAL_WEIGHTS, NOW));
  });

  it('caso calculado a mano con los pesos iniciales', () => {
    const lead = makeLead({
      isNewCustomer: true, //            100 × 40 / 100 = 40
      interest: INTEREST_MAX, //         100 × 30 / 100 = 30
      source: 'web', //                   70 × 20 / 100 = 14
      createdAt: daysAgo(AGE_MAX_DAYS / 2), // 50 × 10 / 100 = 5
    });
    const result = scoreLead(lead, INITIAL_WEIGHTS, NOW);
    expect(result.total).toBeCloseTo(89);
    expect(result.priority).toBe('high');
  });

  it('cambiar los pesos cambia el total con los mismos datos', () => {
    const lead = makeLead({ isNewCustomer: false, interest: INTEREST_MAX });
    const interestHeavy: Weights = { newCustomer: 10, interest: 60, source: 20, age: 10 };
    expect(scoreLead(lead, interestHeavy, NOW).total).toBeGreaterThan(
      scoreLead(lead, INITIAL_WEIGHTS, NOW).total,
    );
  });
});

describe('rateLeadData', () => {
  it('devuelve las valoraciones que no dependen de pesos ni fecha', () => {
    expect(rateLeadData({ isNewCustomer: true, interest: INTEREST_MAX, source: 'web' })).toEqual({
      newCustomer: 100,
      interest: 100,
      source: SOURCE_RATINGS.web,
    });
  });

  it('coincide con las valoraciones del desglose de scoreLead', () => {
    const lead = makeLead({ isNewCustomer: null, interest: 4, source: 'carrier-pigeon' });
    const stored = rateLeadData(lead);
    const { breakdown } = scoreLead(lead, INITIAL_WEIGHTS, NOW);
    for (const key of ['newCustomer', 'interest', 'source'] as const) {
      expect(stored[key]).toBe(breakdown.find((b) => b.criterion === key)!.rating);
    }
  });
});
