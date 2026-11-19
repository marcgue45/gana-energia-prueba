import { beforeEach, describe, expect, it } from 'vitest';
import { call, insertLead, resetDb } from './helpers.js';

describe('asignación', () => {
  let users: Awaited<ReturnType<typeof resetDb>>;
  beforeEach(async () => {
    users = await resetDb();
  });

  it('un agente se asigna un lead libre', async () => {
    const lead = await insertLead();
    const res = await call('POST', `/api/leads/${lead.id}/assign`, users.agent1.id);
    expect(res.status).toBe(200);
    expect(res.body.agent).toEqual({ id: users.agent1.id, name: 'Agente 01' });
  });

  it('dos agentes se asignan el mismo lead a la vez: solo uno lo consigue', async () => {
    const lead = await insertLead();
    const [a, b] = await Promise.all([
      call('POST', `/api/leads/${lead.id}/assign`, users.agent1.id),
      call('POST', `/api/leads/${lead.id}/assign`, users.agent2.id),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? users.agent1.id : users.agent2.id;
    const final = await call('GET', `/api/leads/${lead.id}`, users.agent1.id);
    expect(final.body.agent.id).toBe(winner);
  });

  it('muchas peticiones simultáneas: exactamente una asignación', async () => {
    const lead = await insertLead();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        call('POST', `/api/leads/${lead.id}/assign`, users.admin.id, { agentId: i % 2 ? users.agent1.id : users.agent2.id }),
      ),
    );
    const ok = results.filter((r) => r.status === 200);
    // Las que piden el mismo agente que ganó son idempotentes (200); el resto, 409
    const winner = ok[0]!.body.agent.id;
    expect(ok.every((r) => r.body.agent.id === winner)).toBe(true);
    expect(results.filter((r) => r.status === 409)).toHaveLength(results.length - ok.length);
  });

  it('asignar un lead ya asignado a otro agente responde 409', async () => {
    const lead = await insertLead({ agentId: users.agent1.id });
    const res = await call('POST', `/api/leads/${lead.id}/assign`, users.agent2.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LEAD_ALREADY_ASSIGNED');
  });

  it('repetir la misma asignación no es un error', async () => {
    const lead = await insertLead({ agentId: users.agent1.id });
    expect((await call('POST', `/api/leads/${lead.id}/assign`, users.agent1.id)).status).toBe(200);
  });

  it('un agente no puede asignar leads a otro agente (403); un administrador sí', async () => {
    const lead = await insertLead();
    expect((await call('POST', `/api/leads/${lead.id}/assign`, users.agent1.id, { agentId: users.agent2.id })).status).toBe(403);
    const res = await call('POST', `/api/leads/${lead.id}/assign`, users.admin.id, { agentId: users.agent2.id });
    expect(res.status).toBe(200);
    expect(res.body.agent.id).toBe(users.agent2.id);
  });

  it('no se puede asignar a un administrador ni a un agente inexistente (400)', async () => {
    const lead = await insertLead();
    expect((await call('POST', `/api/leads/${lead.id}/assign`, users.admin.id)).status).toBe(400);
    expect((await call('POST', `/api/leads/${lead.id}/assign`, users.admin.id, { agentId: 999 })).status).toBe(400);
  });

  it('un agente desasigna su lead, pero no el de otro (403)', async () => {
    const mine = await insertLead({ agentId: users.agent1.id });
    const other = await insertLead({ agentId: users.agent2.id });
    const res = await call('POST', `/api/leads/${mine.id}/unassign`, users.agent1.id);
    expect(res.status).toBe(200);
    expect(res.body.agent).toBeNull();
    expect((await call('POST', `/api/leads/${other.id}/unassign`, users.agent1.id)).status).toBe(403);
  });

  it('un administrador puede desasignar cualquier lead', async () => {
    const lead = await insertLead({ agentId: users.agent1.id });
    expect((await call('POST', `/api/leads/${lead.id}/unassign`, users.admin.id)).body.agent).toBeNull();
  });

  it('la asignación incrementa la versión: una edición con datos anteriores recibe 409', async () => {
    const lead = await insertLead();
    await call('POST', `/api/leads/${lead.id}/assign`, users.agent1.id);
    const res = await call('PATCH', `/api/leads/${lead.id}`, users.agent2.id, { version: 1, status: 'contacted' });
    expect(res.status).toBe(409);
  });

  it('404 si el lead no existe', async () => {
    expect((await call('POST', '/api/leads/999/assign', users.agent1.id)).status).toBe(404);
    expect((await call('POST', '/api/leads/999/unassign', users.agent1.id)).status).toBe(404);
  });
});
