// Datos de ejemplo reproducibles: npm run db:seed [-- <número de leads>]
// Borra leads y agentes, restablece los pesos iniciales y genera datos con una semilla fija,
// así que cada ejecución produce exactamente los mismos leads (salvo created_at, relativo a hoy).
import {
  DEFAULT_WEIGHTS,
  INTEREST_MAX,
  INTEREST_MIN,
  LEAD_SOURCES,
  LEAD_STATUSES,
  rateLeadData,
} from '@leads/shared';
import { sql } from 'drizzle-orm';
import { db, pool } from './client.js';
import { agents, leads, weights } from './schema.js';

const LEAD_COUNT = Number(process.argv[2] ?? 500);
const BATCH = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// PRNG determinista (mulberry32)
let state = 20261118;
function random() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const maybeNull = <T>(value: T, nullRate = 0.1): T | null => (random() < nullRate ? null : value);

const FIRST = ['Ana', 'Luis', 'María', 'Jorge', 'Carmen', 'Pablo', 'Lucía', 'Diego', 'Elena', 'Raúl', 'Sara', 'Javier', 'Marta', 'Iván', 'Paula', 'Hugo', 'Nuria', 'Álvaro', 'Irene', 'Sergio'];
const LAST = ['Torres', 'Pérez', 'Ruiz', 'Sanz', 'Gil', 'Mora', 'Vega', 'Ramos', 'Prieto', 'Ortega', 'Navarro', 'Molina', 'Castro', 'Iglesias', 'Romero', 'Serrano', 'Blanco', 'Méndez', 'Cano', 'Delgado'];

async function main() {
  const now = Date.now();

  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE leads, agents RESTART IDENTITY CASCADE`);
    await tx
      .insert(weights)
      .values({ id: true, ...DEFAULT_WEIGHTS })
      .onConflictDoUpdate({ target: weights.id, set: { ...DEFAULT_WEIGHTS, version: 1, updatedAt: new Date() } });

    const agentRows = await tx
      .insert(agents)
      .values([
        { name: 'Admin', role: 'admin' },
        ...['Agente 01', 'Agente 02', 'Agente 03', 'Agente 04', 'Agente 05'].map((name) => ({ name })),
      ])
      .returning({ id: agents.id, role: agents.role });
    const agentIds = agentRows.filter((a) => a.role === 'agent').map((a) => a.id);

    for (let offset = 0; offset < LEAD_COUNT; offset += BATCH) {
      const rows = Array.from({ length: Math.min(BATCH, LEAD_COUNT - offset) }, () => {
        const data = {
          isNewCustomer: maybeNull(random() < 0.6),
          interest: maybeNull(INTEREST_MIN + Math.floor(random() * (INTEREST_MAX - INTEREST_MIN + 1))),
          source: maybeNull(pick(LEAD_SOURCES)),
        };
        const ratings = rateLeadData(data);
        const status = pick(LEAD_STATUSES);
        // Los leads nuevos suelen estar sin asignar; el resto, casi siempre asignados
        const assigned = status === 'new' ? random() < 0.2 : random() < 0.9;
        const createdAt = new Date(now - Math.floor(random() * 120 * DAY_MS));
        return {
          name: `${pick(FIRST)} ${pick(LAST)} ${pick(LAST)}`,
          phone: `+346${String(Math.floor(random() * 1e8)).padStart(8, '0')}`,
          status,
          agentId: assigned ? pick(agentIds) : null,
          ...data,
          ratingNewCustomer: ratings.newCustomer,
          ratingInterest: ratings.interest,
          ratingSource: ratings.source,
          createdAt,
          updatedAt: createdAt,
        };
      });
      await tx.insert(leads).values(rows);
    }
  });

  console.log(`Seed completado: 6 agentes (1 admin) y ${LEAD_COUNT} leads.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
