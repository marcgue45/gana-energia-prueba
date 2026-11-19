import { beforeEach, describe, expect, it } from 'vitest';
import { app, call, resetDb } from './helpers.js';

describe('autenticación simulada', () => {
  let users: Awaited<ReturnType<typeof resetDb>>;
  beforeEach(async () => {
    users = await resetDb();
  });

  it('sin cabecera X-Agent-Id responde 401', async () => {
    const res = await call('GET', '/api/leads', null);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it.each(['abc', '0', '-1', '1.5', '1 OR 1=1'])('una cabecera no válida (%s) responde 401', async (header) => {
    const res = await app.inject({ method: 'GET', url: '/api/leads', headers: { 'x-agent-id': header } });
    expect(res.statusCode).toBe(401);
  });

  it('un agente que no existe responde 401', async () => {
    expect((await call('GET', '/api/me', 9999)).status).toBe(401);
  });

  it('el backend decide la identidad y el rol a partir de la BD', async () => {
    const res = await call('GET', '/api/me', users.agent1.id);
    expect(res.body).toMatchObject({ id: users.agent1.id, name: 'Agente 01', role: 'agent' });
  });

  it('la lista de agentes es pública (selector de sesión)', async () => {
    const res = await call('GET', '/api/agents', null);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });
});
