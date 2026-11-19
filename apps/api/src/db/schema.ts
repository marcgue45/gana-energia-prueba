import { LEAD_SOURCES, LEAD_STATUSES } from '@leads/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const agentRole = pgEnum('agent_role', ['agent', 'admin']);
export const leadStatus = pgEnum('lead_status', LEAD_STATUSES);
export const leadSource = pgEnum('lead_source', LEAD_SOURCES);

// Autenticación simulada: la API identifica al agente por la cabecera X-Agent-Id
// y comprueba que existe en esta tabla. El rol admin puede cambiar los pesos.
export const agents = pgTable('agents', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull(),
  role: agentRole().notNull().default('agent'),
});

export const leads = pgTable(
  'leads',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    phone: text().notNull(), // normalizado: solo dígitos y + inicial
    status: leadStatus().notNull().default('new'),
    agentId: integer().references(() => agents.id, { onDelete: 'set null' }),

    // Datos de puntuación tal como se introducen (null = dato ausente)
    isNewCustomer: boolean(),
    interest: smallint(),
    source: leadSource(),

    // Valoraciones 0–100 que solo dependen de los datos del propio lead.
    // Las calcula rateLeadData() al crear/editar; nunca llegan del cliente.
    // La antigüedad y el total se calculan en SQL al consultar (score-sql.ts).
    ratingNewCustomer: doublePrecision().notNull(),
    ratingInterest: doublePrecision().notNull(),
    ratingSource: doublePrecision().notNull(),

    // Bloqueo optimista: cada UPDATE exige la versión leída y la incrementa
    version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('leads_interest_range', sql`${t.interest} BETWEEN 1 AND 10`),
    check(
      'leads_ratings_range',
      sql`${t.ratingNewCustomer} BETWEEN 0 AND 100 AND ${t.ratingInterest} BETWEEN 0 AND 100 AND ${t.ratingSource} BETWEEN 0 AND 100`,
    ),
    index('leads_status_idx').on(t.status),
    index('leads_agent_idx').on(t.agentId),
    // Búsqueda por subcadena (ILIKE '%texto%') con índices trigram (extensión pg_trgm)
    index('leads_name_trgm_idx').using('gin', t.name.op('gin_trgm_ops')),
    index('leads_phone_trgm_idx').using('gin', t.phone.op('gin_trgm_ops')),
  ],
);

// Configuración de pesos: una sola fila. La clave primaria booleana con CHECK (id)
// impide que exista una segunda fila. Las reglas (sin negativos, suma 100) también
// están en la BD, por si algo escribe sin pasar por la validación de la API.
// `version` no es historial: solo permite a la web detectar que los pesos cambiaron.
export const weights = pgTable(
  'weights',
  {
    id: boolean().primaryKey().default(true),
    newCustomer: smallint().notNull(),
    interest: smallint().notNull(),
    source: smallint().notNull(),
    age: smallint().notNull(),
    version: integer().notNull().default(1),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('weights_singleton', sql`${t.id}`),
    check(
      'weights_non_negative',
      sql`${t.newCustomer} >= 0 AND ${t.interest} >= 0 AND ${t.source} >= 0 AND ${t.age} >= 0`,
    ),
    check('weights_sum_100', sql`${t.newCustomer} + ${t.interest} + ${t.source} + ${t.age} = 100`),
  ],
);
