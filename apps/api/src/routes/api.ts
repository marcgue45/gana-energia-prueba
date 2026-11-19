import {
  assignSchema,
  leadCreateSchema,
  leadListQuerySchema,
  leadUpdateSchema,
  weightsUpdateSchema,
} from '@leads/shared';
import { asc } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../auth.js';
import { db } from '../db/client.js';
import { agents } from '../db/schema.js';
import { assignLead, createLead, getLead, listLeads, unassignLead, updateLead } from '../leads/leads.service.js';
import { getWeightsRow, toWeightsDto, updateWeights } from '../weights/weights.service.js';

const idParams = z.object({ id: z.coerce.number().int().positive() });

// Pública: la web la necesita para el selector de sesión simulada (antes de saber quién eres)
export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get('/agents', async () => db.select().from(agents).orderBy(asc(agents.id)));
};

// Todo lo registrado aquí exige X-Agent-Id válido (el hook solo afecta a este plugin)
export const protectedRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', authenticate);

  app.get('/me', async (req) => req.agent);

  app.get('/leads', async (req) => listLeads(leadListQuerySchema.parse(req.query)));

  app.get('/leads/:id', async (req) => getLead(idParams.parse(req.params).id));

  app.post('/leads', async (req, reply) => {
    const lead = await createLead(leadCreateSchema.parse(req.body));
    return reply.status(201).send(lead);
  });

  app.patch('/leads/:id', async (req) => updateLead(idParams.parse(req.params).id, leadUpdateSchema.parse(req.body)));

  app.post('/leads/:id/assign', async (req) => {
    const { agentId } = assignSchema.parse(req.body ?? {});
    return assignLead(idParams.parse(req.params).id, req.agent, agentId);
  });

  app.post('/leads/:id/unassign', async (req) => unassignLead(idParams.parse(req.params).id, req.agent));

  app.get('/weights', async () => toWeightsDto(await getWeightsRow()));

  app.put('/weights', async (req) => {
    requireAdmin(req);
    const { weights, version } = weightsUpdateSchema.parse(req.body);
    return toWeightsDto(await updateWeights(weights, version));
  });
};
