import { DEFAULT_WEIGHTS, rateLeadData, type LeadSource } from '@leads/shared';
import { sql } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import { agents, leads, weights } from '../src/db/schema.js';

export const app = buildApp();

// Estado conocido antes de cada test: sin leads, pesos iniciales y tres usuarios
export async function resetDb() {
  await db.execute(sql`TRUNCATE leads, agents RESTART IDENTITY CASCADE`);
  await db.update(weights).set({ ...DEFAULT_WEIGHTS, version: 1 });
  const [admin, agent1, agent2] = await db
    .insert(agents)
    .values([{ name: 'Admin', role: 'admin' }, { name: 'Agente 01' }, { name: 'Agente 02' }])
    .returning();
  return { admin: admin!, agent1: agent1!, agent2: agent2! };
}

type LeadSeed = {
  name?: string;
  phone?: string;
  isNewCustomer?: boolean | null;
  interest?: number | null;
  source?: LeadSource | null;
  createdAt?: Date;
  agentId?: number | null;
  status?: 'new' | 'in_progress' | 'contacted' | 'closed';
};

// Inserta directamente en la BD (permite fijar created_at, que la API no deja tocar)
export async function insertLead(seed: LeadSeed = {}) {
  const data = {
    isNewCustomer: seed.isNewCustomer === undefined ? true : seed.isNewCustomer,
    interest: seed.interest === undefined ? 5 : seed.interest,
    source: seed.source === undefined ? ('web' as const) : seed.source,
  };
  const r = rateLeadData(data);
  const [row] = await db
    .insert(leads)
    .values({
      name: seed.name ?? 'Lead de prueba',
      phone: seed.phone ?? '+34600000000',
      status: seed.status ?? 'new',
      agentId: seed.agentId ?? null,
      ...data,
      ratingNewCustomer: r.newCustomer,
      ratingInterest: r.interest,
      ratingSource: r.source,
      ...(seed.createdAt ? { createdAt: seed.createdAt } : {}),
    })
    .returning();
  return row!;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT';
export async function call(method: Method, url: string, agentId: number | null, payload?: unknown) {
  const res = await app.inject({
    method,
    url,
    headers: agentId === null ? {} : { 'x-agent-id': String(agentId) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
  return { status: res.statusCode, body: res.json() };
}
