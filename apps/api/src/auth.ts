import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { db } from './db/client.js';
import { agents } from './db/schema.js';
import { HttpError } from './errors.js';

// Autenticación SIMULADA (documentada en el README).
// La web envía la cabecera X-Agent-Id con el agente elegido en el selector de sesión.
// El backend no se fía del cliente para nada más: comprueba que el agente existe, lee su rol
// de la BD y decide con ese dato quién es y qué puede hacer. En producción la cabecera se
// sustituiría por una sesión o un JWT firmado; el resto del código no cambiaría.
export type Agent = typeof agents.$inferSelect;

declare module 'fastify' {
  interface FastifyRequest {
    agent: Agent;
  }
}

export async function authenticate(req: FastifyRequest) {
  const raw = req.headers['x-agent-id'];
  const id = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Falta la cabecera X-Agent-Id o no es válida');
  }
  const [agent] = await db.select().from(agents).where(eq(agents.id, id));
  if (!agent) throw new HttpError(401, 'UNAUTHENTICATED', 'Agente desconocido');
  req.agent = agent;
}

export function requireAdmin(req: FastifyRequest) {
  if (req.agent.role !== 'admin') {
    throw new HttpError(403, 'FORBIDDEN', 'Solo un administrador puede realizar esta acción');
  }
}
