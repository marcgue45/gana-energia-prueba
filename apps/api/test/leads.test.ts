import { beforeEach, describe, expect, it } from 'vitest';
import { call, insertLead, resetDb } from './helpers.js';

type Item = { id: number; name: string; score: number };
const ids = (body: { items: Item[] }) => body.items.map((i) => i.id);

describe('leads', () => {
  let users: Awaited<ReturnType<typeof resetDb>>;
  beforeEach(async () => {
    users = await resetDb();
  });

  describe('alta', () => {
    it('crea el lead, calcula la puntuación en el servidor y lo deja sin asignar', async () => {
      const res = await call('POST', '/api/leads', users.agent1.id, {
        name: 'Ana Torres',
        phone: '612 345 678',
        isNewCustomer: true,
        interest: 10,
        source: 'referral',
      });
      expect(res.status).toBe(201);
      // 100·40 + 100·30 + 100·20 + 100·10 (recién creado) → 100
      expect(res.body).toMatchObject({ name: 'Ana Torres', phone: '612345678', status: 'new', agent: null, version: 1, priority: 'high' });
      expect(res.body.score).toBeCloseTo(100, 1);
      expect(res.body.breakdown).toHaveLength(4);
    });

    it('acepta datos de puntuación ausentes: valen 0 y el desglose lo explica', async () => {
      const res = await call('POST', '/api/leads', users.agent1.id, { name: 'Sin datos', phone: '612345678' });
      expect(res.status).toBe(201);
      expect(res.body.score).toBeCloseTo(10, 1); // solo aporta la antigüedad
      const notes = res.body.breakdown.filter((b: { note?: string }) => b.note === 'Dato ausente');
      expect(notes).toHaveLength(3);
    });

    it('rechaza una puntuación enviada por el navegador (400)', async () => {
      const res = await call('POST', '/api/leads', users.agent1.id, { name: 'Ana', phone: '612345678', score: 100 });
      expect(res.status).toBe(400);
    });

    it('devuelve los errores de validación por campo', async () => {
      const res = await call('POST', '/api/leads', users.agent1.id, { name: '', phone: 'abc', interest: 42 });
      expect(res.status).toBe(400);
      const paths = res.body.error.details.map((d: { path: string }) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['name', 'phone', 'interest']));
    });

    it('JSON mal formado responde 400, no 500', async () => {
      const { app } = await import('./helpers.js');
      const res = await app.inject({
        method: 'POST',
        url: '/api/leads',
        headers: { 'x-agent-id': String(users.agent1.id), 'content-type': 'application/json' },
        payload: '{"name": ',
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('listado', () => {
    // Misma fecha de creación para todos: si no, la antigüedad (continua) rompe los empates
    // por milisegundos y el lead más reciente queda ligeramente por encima.
    const createdAt = new Date(Date.now() - 24 * 60 * 60 * 1000);

    it('ordena por puntuación descendente y desempata por id ascendente', async () => {
      const low = await insertLead({ interest: 1, createdAt });
      const tieA = await insertLead({ interest: 8, createdAt });
      const tieB = await insertLead({ interest: 8, createdAt });
      const high = await insertLead({ interest: 10, createdAt });
      const res = await call('GET', '/api/leads', users.agent1.id);
      expect(ids(res.body)).toEqual([high.id, tieA.id, tieB.id, low.id]);
    });

    it('pagina con un orden estable y devuelve el total', async () => {
      // 5 leads con la misma puntuación: el orden lo decide el id
      const created = [];
      for (let i = 0; i < 5; i++) created.push((await insertLead({ name: `Lead ${i}`, createdAt })).id);
      const p1 = await call('GET', '/api/leads?pageSize=2&page=1', users.agent1.id);
      const p2 = await call('GET', '/api/leads?pageSize=2&page=2', users.agent1.id);
      const p3 = await call('GET', '/api/leads?pageSize=2&page=3', users.agent1.id);
      expect([...ids(p1.body), ...ids(p2.body), ...ids(p3.body)]).toEqual(created);
      expect(p1.body.total).toBe(5);
    });

    it('filtra por estado y por agente (incluido sin asignar)', async () => {
      const mine = await insertLead({ agentId: users.agent1.id, status: 'contacted' });
      const other = await insertLead({ agentId: users.agent2.id, status: 'contacted' });
      const free = await insertLead({ status: 'new' });

      expect(ids((await call('GET', `/api/leads?agentId=${users.agent1.id}`, users.agent1.id)).body)).toEqual([mine.id]);
      expect(ids((await call('GET', '/api/leads?agentId=none', users.agent1.id)).body)).toEqual([free.id]);
      const contacted = await call('GET', '/api/leads?status=contacted', users.agent1.id);
      expect(ids(contacted.body).sort()).toEqual([mine.id, other.id].sort());
      expect(contacted.body.total).toBe(2);
    });

    it('busca por nombre sin distinguir mayúsculas y por teléfono aunque se escriba con espacios', async () => {
      const ana = await insertLead({ name: 'Ana Torres', phone: '+34612345678' });
      await insertLead({ name: 'Luis Pérez', phone: '+34699999999' });
      expect(ids((await call('GET', '/api/leads?q=torres', users.agent1.id)).body)).toEqual([ana.id]);
      expect(ids((await call('GET', `/api/leads?q=${encodeURIComponent('612 345')}`, users.agent1.id)).body)).toEqual([ana.id]);
    });

    it('los comodines de LIKE en la búsqueda se tratan como texto', async () => {
      await insertLead({ name: 'Ana Torres' });
      expect((await call('GET', '/api/leads?q=%25', users.agent1.id)).body.total).toBe(0);
    });

    it('devuelve los mismos datos que el detalle (fechas en ISO)', async () => {
      const lead = await insertLead({ agentId: users.agent1.id });
      const [item] = (await call('GET', '/api/leads', users.agent1.id)).body.items;
      const detail = (await call('GET', `/api/leads/${lead.id}`, users.agent1.id)).body;
      expect(item.updatedAt).toBe(detail.updatedAt);
      expect(item.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(item.agent).toEqual(detail.agent);
      expect(item.score).toBeCloseTo(detail.score, 3);
    });

    it('rechaza parámetros no válidos (400)', async () => {
      expect((await call('GET', '/api/leads?status=won', users.agent1.id)).status).toBe(400);
      expect((await call('GET', '/api/leads?pageSize=5000', users.agent1.id)).status).toBe(400);
    });
  });

  describe('detalle', () => {
    it('404 si el lead no existe', async () => {
      expect((await call('GET', '/api/leads/999', users.agent1.id)).status).toBe(404);
    });
  });

  describe('edición con bloqueo optimista', () => {
    it('aplica los cambios, recalcula la puntuación e incrementa la versión', async () => {
      const lead = await insertLead({ interest: 1 });
      const before = await call('GET', `/api/leads/${lead.id}`, users.agent1.id);
      const res = await call('PATCH', `/api/leads/${lead.id}`, users.agent1.id, { version: 1, interest: 10, status: 'in_progress' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ interest: 10, status: 'in_progress', version: 2 });
      expect(res.body.score).toBeGreaterThan(before.body.score);
    });

    it('no toca los campos que no se envían', async () => {
      const lead = await insertLead({ name: 'Ana', interest: 7, source: 'referral' });
      const res = await call('PATCH', `/api/leads/${lead.id}`, users.agent1.id, { version: 1, status: 'contacted' });
      expect(res.body).toMatchObject({ name: 'Ana', interest: 7, source: 'referral', status: 'contacted' });
    });

    it('dos usuarios editan la misma versión: el segundo recibe 409 con los datos actuales', async () => {
      const lead = await insertLead({ name: 'Original' });
      const first = await call('PATCH', `/api/leads/${lead.id}`, users.agent1.id, { version: 1, name: 'Cambio de A' });
      const second = await call('PATCH', `/api/leads/${lead.id}`, users.agent2.id, { version: 1, name: 'Cambio de B' });
      expect(first.status).toBe(200);
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('LEAD_CONFLICT');
      expect(second.body.error.details.current).toMatchObject({ name: 'Cambio de A', version: 2 });
    });

    it('ediciones simultáneas sobre la misma versión: solo una se aplica', async () => {
      const lead = await insertLead();
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          call('PATCH', `/api/leads/${lead.id}`, users.agent1.id, { version: 1, name: `Edición ${i}` }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    });

    it('rechaza intentar cambiar el agente o la puntuación por PATCH (400)', async () => {
      const lead = await insertLead();
      expect((await call('PATCH', `/api/leads/${lead.id}`, users.agent1.id, { version: 1, agentId: users.agent1.id })).status).toBe(400);
      expect((await call('PATCH', `/api/leads/${lead.id}`, users.agent1.id, { version: 1, score: 100 })).status).toBe(400);
    });
  });
});
