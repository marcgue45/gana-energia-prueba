import { beforeEach, describe, expect, it } from 'vitest';
import { call, insertLead, resetDb } from './helpers.js';

const asList = (w: Record<string, number>) => Object.entries(w).map(([criterion, weight]) => ({ criterion, weight }));
const INITIAL = asList({ newCustomer: 40, interest: 30, source: 20, age: 10 });

describe('pesos', () => {
  let users: Awaited<ReturnType<typeof resetDb>>;
  beforeEach(async () => {
    users = await resetDb();
  });

  it('devuelve la configuración vigente con su versión', async () => {
    const res = await call('GET', '/api/weights', users.agent1.id);
    expect(res.body).toMatchObject({ weights: INITIAL, version: 1 });
  });

  it('un agente no puede cambiar los pesos (403)', async () => {
    const res = await call('PUT', '/api/weights', users.agent1.id, { weights: INITIAL, version: 1 });
    expect(res.status).toBe(403);
  });

  it.each([
    ['suma distinta de 100', asList({ newCustomer: 40, interest: 30, source: 20, age: 11 })],
    ['peso negativo', asList({ newCustomer: 60, interest: 30, source: 20, age: -10 })],
    ['criterio duplicado', [...INITIAL.slice(0, 3), { criterion: 'source', weight: 10 }]],
    ['criterio que falta', INITIAL.slice(0, 3)],
  ])('rechaza una configuración no válida: %s (400 y no cambia nada)', async (_, weights) => {
    const res = await call('PUT', '/api/weights', users.admin.id, { weights, version: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
    expect((await call('GET', '/api/weights', users.admin.id)).body).toMatchObject({ weights: INITIAL, version: 1 });
  });

  it('guarda una configuración válida e incrementa la versión', async () => {
    const weights = asList({ newCustomer: 10, interest: 60, source: 20, age: 10 });
    const res = await call('PUT', '/api/weights', users.admin.id, { weights, version: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ weights, version: 2 });
  });

  it('si otro administrador ya los cambió, responde 409 con los pesos actuales', async () => {
    const first = asList({ newCustomer: 10, interest: 60, source: 20, age: 10 });
    await call('PUT', '/api/weights', users.admin.id, { weights: first, version: 1 });
    const res = await call('PUT', '/api/weights', users.admin.id, { weights: INITIAL, version: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.details.current).toMatchObject({ weights: first, version: 2 });
  });

  it('el listado refleja los pesos nuevos al momento, sin recálculos', async () => {
    // A: cliente nuevo con poco interés; B: cliente existente con mucho interés
    const a = await insertLead({ name: 'A', isNewCustomer: true, interest: 1 });
    const b = await insertLead({ name: 'B', isNewCustomer: false, interest: 10 });

    let list = await call('GET', '/api/leads', users.agent1.id);
    expect(list.body.items.map((i: { id: number }) => i.id)).toEqual([a.id, b.id]);
    expect(list.body.weightsVersion).toBe(1);

    const interestHeavy = asList({ newCustomer: 10, interest: 60, source: 20, age: 10 });
    await call('PUT', '/api/weights', users.admin.id, { weights: interestHeavy, version: 1 });

    list = await call('GET', '/api/leads', users.agent1.id);
    expect(list.body.items.map((i: { id: number }) => i.id)).toEqual([b.id, a.id]);
    expect(list.body.weightsVersion).toBe(2);
  });
});
