import {
  rateLeadData,
  scoreLead,
  toPriority,
  type LeadCreateInput,
  type LeadListQuery,
  type LeadStatus,
  type LeadUpdateInput,
} from '@leads/shared';
import { and, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { Agent } from '../auth.js';
import { db } from '../db/client.js';
import { agents, leads } from '../db/schema.js';
import { HttpError, notFound } from '../errors.js';
import { getWeightsRow, toWeights } from '../weights/weights.service.js';
import { scoreSql } from './score-sql.js';

// Las lecturas que combinan pesos y leads van en una transacción REPEATABLE READ de solo lectura:
// todas sus consultas ven la misma foto de la BD, así que una respuesta nunca mezcla dos
// configuraciones de pesos aunque un administrador las cambie a mitad de la petición.
const SNAPSHOT = { isolationLevel: 'repeatable read', accessMode: 'read only' } as const;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

// ---------- Listado ----------

type ListRow = {
  id: number;
  name: string;
  phone: string;
  status: LeadStatus;
  agent_id: number | null;
  agent_name: string | null;
  version: number;
  updated_at_ms: number;
  score: number;
};

export async function listLeads(query: LeadListQuery, now = new Date()) {
  const conditions: SQL[] = [];
  if (query.status) conditions.push(sql`l.status = ${query.status}`);
  if (query.agentId === 'none') conditions.push(sql`l.agent_id IS NULL`);
  else if (query.agentId !== undefined) conditions.push(sql`l.agent_id = ${query.agentId}`);
  if (query.q) {
    // Nombre por subcadena; teléfono por sus dígitos (está guardado sin espacios ni guiones).
    // Ambas búsquedas usan los índices trigram.
    const byName = sql`l.name ILIKE ${`%${escapeLike(query.q)}%`}`;
    const digits = query.q.replace(/\D/g, '');
    conditions.push(digits.length >= 3 ? sql`(${byName} OR l.phone LIKE ${`%${digits}%`})` : byName);
  }
  const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  return db.transaction(async (tx) => {
    const weightsRow = await getWeightsRow(tx);
    const w = toWeights(weightsRow);

    // Desempate estable: a igual puntuación, por id ascendente
    const { rows } = await tx.execute<ListRow>(sql`
      SELECT l.id, l.name, l.phone, l.status, l.agent_id, a.name AS agent_name, l.version,
             -- en consultas SQL directas el driver devuelve las fechas como texto de PostgreSQL
             (EXTRACT(EPOCH FROM l.updated_at) * 1000)::float8 AS updated_at_ms,
             ${scoreSql(w, now)} AS score
      FROM leads l
      LEFT JOIN agents a ON a.id = l.agent_id
      ${where}
      ORDER BY score DESC, l.id ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
    `);
    const { rows: countRows } = await tx.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM leads l ${where}`,
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        status: r.status,
        agent: r.agent_id === null ? null : { id: r.agent_id, name: r.agent_name },
        score: r.score,
        priority: toPriority(r.score),
        version: r.version,
        updatedAt: new Date(r.updated_at_ms),
      })),
      total: countRows[0]?.total ?? 0,
      page: query.page,
      pageSize: query.pageSize,
      weightsVersion: weightsRow.version,
    };
  }, SNAPSHOT);
}

// ---------- Detalle ----------

// El desglose lo calcula scoreLead() (TypeScript) con los mismos pesos y la misma `now`
// que usaría el listado; el test de coherencia garantiza que el total coincide con el SQL.
export async function getLead(id: number, now = new Date()) {
  return db.transaction(async (tx) => {
    const weightsRow = await getWeightsRow(tx);
    const [row] = await tx
      .select({ lead: leads, agentName: agents.name })
      .from(leads)
      .leftJoin(agents, eq(agents.id, leads.agentId))
      .where(eq(leads.id, id));
    if (!row) throw notFound('Lead');

    const { lead } = row;
    const result = scoreLead(lead, toWeights(weightsRow), now);
    return {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      status: lead.status,
      agent: lead.agentId === null ? null : { id: lead.agentId, name: row.agentName },
      isNewCustomer: lead.isNewCustomer,
      interest: lead.interest,
      source: lead.source,
      version: lead.version,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      score: result.total,
      priority: result.priority,
      breakdown: result.breakdown,
      weightsVersion: weightsRow.version,
    };
  }, SNAPSHOT);
}

// ---------- Alta y edición ----------

const ratingColumns = (data: Parameters<typeof rateLeadData>[0]) => {
  const r = rateLeadData(data);
  return { ratingNewCustomer: r.newCustomer, ratingInterest: r.interest, ratingSource: r.source };
};

export async function createLead(input: LeadCreateInput) {
  const [row] = await db
    .insert(leads)
    .values({ ...input, ...ratingColumns(input) })
    .returning({ id: leads.id });
  return getLead(row!.id);
}

async function conflict(id: number): Promise<never> {
  throw new HttpError(409, 'LEAD_CONFLICT', 'Otra persona ha modificado este lead. Revisa los datos actuales antes de guardar.', {
    current: await getLead(id),
  });
}

// Bloqueo optimista: el cliente envía la `version` que leyó. El UPDATE solo se aplica si la fila
// sigue en esa versión; si alguien la cambió entre medias, 0 filas → 409 con los datos actuales.
// Así nunca se pisa en silencio un cambio que el usuario no ha visto.
export async function updateLead(id: number, input: LeadUpdateInput) {
  const { version, ...changes } = input;
  const [current] = await db.select().from(leads).where(eq(leads.id, id));
  if (!current) throw notFound('Lead');
  if (current.version !== version) return conflict(id);

  // Las valoraciones se recalculan con los datos resultantes (los actuales + los cambios)
  const merged = { ...current, ...changes };
  const [row] = await db
    .update(leads)
    .set({ ...changes, ...ratingColumns(merged), version: sql`${leads.version} + 1`, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.version, version)))
    .returning({ id: leads.id });
  if (!row) return conflict(id);
  return getLead(id);
}

// ---------- Asignación ----------

// Un agente se asigna leads a sí mismo; un administrador puede asignarlos a cualquier agente.
// La integridad ante peticiones simultáneas la da un UPDATE condicional (agent_id IS NULL):
// PostgreSQL bloquea la fila durante el UPDATE, así que de dos peticiones a la vez solo una
// encuentra el lead libre; la otra actualiza 0 filas y recibe 409. Sin bloqueos explícitos.
export async function assignLead(id: number, actor: Agent, requestedAgentId?: number) {
  const targetId = requestedAgentId ?? actor.id;
  if (targetId !== actor.id && actor.role !== 'admin') {
    throw new HttpError(403, 'FORBIDDEN', 'Solo un administrador puede asignar leads a otros agentes');
  }
  const [target] = await db.select().from(agents).where(eq(agents.id, targetId));
  if (!target || target.role !== 'agent') {
    throw new HttpError(400, 'INVALID_AGENT', 'Los leads solo se pueden asignar a agentes existentes');
  }

  const [row] = await db
    .update(leads)
    .set({ agentId: targetId, version: sql`${leads.version} + 1`, updatedAt: new Date() })
    .where(and(eq(leads.id, id), isNull(leads.agentId)))
    .returning({ id: leads.id });

  if (!row) {
    const [current] = await db.select({ agentId: leads.agentId }).from(leads).where(eq(leads.id, id));
    if (!current) throw notFound('Lead');
    // Repetir la misma asignación no es un error (doble clic, reintento de red)
    if (current.agentId !== targetId) {
      throw new HttpError(409, 'LEAD_ALREADY_ASSIGNED', 'Este lead ya está asignado a otro agente', {
        current: await getLead(id),
      });
    }
  }
  return getLead(id);
}

// Un agente solo puede desasignar sus propios leads; un administrador, cualquiera.
export async function unassignLead(id: number, actor: Agent) {
  const ownership = actor.role === 'admin' ? isNotNull(leads.agentId) : eq(leads.agentId, actor.id);
  const [row] = await db
    .update(leads)
    .set({ agentId: null, version: sql`${leads.version} + 1`, updatedAt: new Date() })
    .where(and(eq(leads.id, id), ownership))
    .returning({ id: leads.id });

  if (!row) {
    const [current] = await db.select({ agentId: leads.agentId }).from(leads).where(eq(leads.id, id));
    if (!current) throw notFound('Lead');
    if (current.agentId !== null) {
      throw new HttpError(403, 'FORBIDDEN', 'Solo puedes desasignar leads asignados a ti');
    }
  }
  return getLead(id);
}
