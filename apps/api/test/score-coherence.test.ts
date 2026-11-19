import { AGE_MAX_DAYS, type Weights } from '@leads/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { weights } from '../src/db/schema.js';
import { getLead, listLeads } from '../src/leads/leads.service.js';
import { insertLead, resetDb } from './helpers.js';

// La puntuación del listado (SQL) y la del detalle (scoreLead en TypeScript) son dos
// implementaciones de la misma fórmula. Este test garantiza que dan lo mismo.
const NOW = new Date('2026-11-19T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

const CASES = [
  { isNewCustomer: true, interest: 10, source: 'referral', createdAt: NOW },
  { isNewCustomer: false, interest: 1, source: 'cold', createdAt: daysAgo(30) },
  { isNewCustomer: null, interest: null, source: null, createdAt: daysAgo(45.5) },
  { isNewCustomer: true, interest: 6, source: 'web', createdAt: daysAgo(AGE_MAX_DAYS) },
  { isNewCustomer: false, interest: 3, source: 'phone', createdAt: daysAgo(AGE_MAX_DAYS * 4) },
  { isNewCustomer: true, interest: 8, source: 'web', createdAt: daysAgo(-5) }, // fecha futura
  { isNewCustomer: true, interest: 5, source: 'phone', createdAt: daysAgo(0.25) },
] as const;

const WEIGHT_SETS: Weights[] = [
  { newCustomer: 40, interest: 30, source: 20, age: 10 },
  { newCustomer: 0, interest: 0, source: 0, age: 100 },
  { newCustomer: 25, interest: 25, source: 25, age: 25 },
  { newCustomer: 7, interest: 53, source: 1, age: 39 },
];

describe('coherencia de la puntuación: SQL (listado) ↔ scoreLead (detalle)', () => {
  beforeEach(async () => {
    await resetDb();
    for (const c of CASES) await insertLead(c);
  });

  it.each(WEIGHT_SETS)('mismo total con pesos %j', async (w) => {
    await db.update(weights).set(w);
    const list = await listLeads({ page: 1, pageSize: 100 }, NOW);
    expect(list.items).toHaveLength(CASES.length);
    for (const item of list.items) {
      const detail = await getLead(item.id, NOW);
      expect(item.score).toBeCloseTo(detail.score, 9);
      expect(item.priority).toBe(detail.priority);
    }
  });

  it('la antigüedad en SQL respeta los extremos: futura → 100, más allá del tope → 0', async () => {
    await db.update(weights).set({ newCustomer: 0, interest: 0, source: 0, age: 100 });
    const list = await listLeads({ page: 1, pageSize: 100 }, NOW);
    const scores = list.items.map((i) => i.score);
    expect(Math.max(...scores)).toBeCloseTo(100, 9);
    expect(Math.min(...scores)).toBeCloseTo(0, 9);
  });
});
