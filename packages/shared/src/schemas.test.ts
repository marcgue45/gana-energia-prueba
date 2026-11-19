import { describe, expect, it } from 'vitest';
import { leadCreateSchema, leadListQuerySchema, leadUpdateSchema, weightsInputSchema } from './schemas.js';

const valid = [
  { criterion: 'newCustomer', weight: 40 },
  { criterion: 'interest', weight: 30 },
  { criterion: 'source', weight: 20 },
  { criterion: 'age', weight: 10 },
];

const messages = (input: unknown) => {
  const r = weightsInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe('weightsInputSchema', () => {
  it('acepta los pesos iniciales y los convierte a objeto', () => {
    expect(weightsInputSchema.parse(valid)).toEqual({ newCustomer: 40, interest: 30, source: 20, age: 10 });
  });

  it('acepta un criterio con peso 0', () => {
    const input = valid.map((v) => (v.criterion === 'age' ? { ...v, weight: 0 } : v.criterion === 'source' ? { ...v, weight: 30 } : v));
    expect(weightsInputSchema.safeParse(input).success).toBe(true);
  });

  it('rechaza pesos negativos', () => {
    const input = [...valid.slice(0, 3), { criterion: 'age', weight: -10 }];
    expect(messages(input).join()).toContain('negativo');
  });

  it('rechaza pesos decimales', () => {
    const input = [{ criterion: 'newCustomer', weight: 39.5 }, { criterion: 'interest', weight: 30.5 }, ...valid.slice(2)];
    expect(weightsInputSchema.safeParse(input).success).toBe(false);
  });

  it('rechaza criterios duplicados aunque la suma sea 100', () => {
    const input = [...valid.slice(0, 3), { criterion: 'source', weight: 10 }];
    const msgs = messages(input);
    expect(msgs.join()).toContain('duplicado');
    expect(msgs.join()).toContain('Falta el criterio: age');
  });

  it('rechaza que falte un criterio', () => {
    expect(messages(valid.slice(0, 3)).join()).toContain('Falta el criterio: age');
  });

  it.each([
    [99, 'suman 99'],
    [101, 'suman 101'],
  ])('rechaza que la suma sea %d', (total, expected) => {
    const input = [...valid.slice(0, 3), { criterion: 'age', weight: total - 90 }];
    expect(messages(input).join()).toContain(expected);
  });

  it('rechaza criterios desconocidos', () => {
    expect(weightsInputSchema.safeParse([...valid, { criterion: 'otro', weight: 0 }]).success).toBe(false);
  });
});

describe('leadCreateSchema', () => {
  it('normaliza el teléfono y rellena con null los atributos que faltan', () => {
    expect(leadCreateSchema.parse({ name: '  Ana Torres ', phone: '+34 612-345-678' })).toEqual({
      name: 'Ana Torres',
      phone: '+34612345678',
      isNewCustomer: null,
      interest: null,
      source: null,
    });
  });

  it.each([
    [{ name: '', phone: '612345678' }],
    [{ name: 'Ana', phone: '12ab' }],
    [{ name: 'Ana', phone: '612345678', interest: 11 }],
    [{ name: 'Ana', phone: '612345678', interest: 5.5 }],
    [{ name: 'Ana', phone: '612345678', source: 'feria' }],
  ])('rechaza datos inválidos: %j', (input) => {
    expect(leadCreateSchema.safeParse(input).success).toBe(false);
  });
});

describe('leadCreateSchema: campos no permitidos', () => {
  it('rechaza que el navegador envíe una puntuación', () => {
    expect(leadCreateSchema.safeParse({ name: 'Ana', phone: '612345678', score: 100 }).success).toBe(false);
  });
});

describe('leadUpdateSchema', () => {
  it('no rellena con null los campos que no llegan', () => {
    expect(leadUpdateSchema.parse({ version: 3, status: 'contacted' })).toEqual({ version: 3, status: 'contacted' });
  });

  it('exige la versión', () => {
    expect(leadUpdateSchema.safeParse({ status: 'contacted' }).success).toBe(false);
  });

  it('exige al menos un campo que modificar', () => {
    expect(leadUpdateSchema.safeParse({ version: 1 }).success).toBe(false);
  });

  it('permite borrar un dato enviando null', () => {
    expect(leadUpdateSchema.parse({ version: 1, interest: null })).toEqual({ version: 1, interest: null });
  });

  it('rechaza un estado desconocido', () => {
    expect(leadUpdateSchema.safeParse({ version: 1, status: 'won' }).success).toBe(false);
  });
});

describe('leadListQuerySchema', () => {
  it('convierte los parámetros de texto y aplica valores por defecto', () => {
    expect(leadListQuerySchema.parse({ agentId: '3' })).toEqual({ agentId: 3, page: 1, pageSize: 20 });
    expect(leadListQuerySchema.parse({ agentId: 'none', page: '2' })).toEqual({ agentId: 'none', page: 2, pageSize: 20 });
  });

  it('limita el tamaño de página', () => {
    expect(leadListQuerySchema.safeParse({ pageSize: '1000' }).success).toBe(false);
  });
});
