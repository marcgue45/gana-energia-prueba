import { CRITERIA, type Weights } from '@leads/shared';
import { eq, sql } from 'drizzle-orm';
import { db, type Db } from '../db/client.js';
import { weights } from '../db/schema.js';
import { HttpError } from '../errors.js';

type WeightsRow = typeof weights.$inferSelect;
// Una transacción de Drizzle tiene la misma interfaz de consulta que `db`
type Executor = Pick<Db, 'select'>;

export function toWeights(row: WeightsRow): Weights {
  return { newCustomer: row.newCustomer, interest: row.interest, source: row.source, age: row.age };
}

export function toWeightsDto(row: WeightsRow) {
  return {
    weights: CRITERIA.map((criterion) => ({ criterion, weight: row[criterion] })),
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

export async function getWeightsRow(exec: Executor = db): Promise<WeightsRow> {
  const [row] = await exec.select().from(weights);
  // La fila la crea una migración; si falta, la BD no está migrada. Respuesta predecible, no un 500 genérico.
  if (!row) throw new HttpError(503, 'WEIGHTS_NOT_CONFIGURED', 'No hay configuración de pesos: ejecuta las migraciones');
  return row;
}

// Bloqueo optimista también aquí: si dos administradores editan a la vez, el segundo recibe 409
// en lugar de pisar los pesos del primero sin haberlos visto.
// No hay que recalcular nada: la puntuación se calcula al consultar con los pesos vigentes.
export async function updateWeights(input: Weights, expectedVersion: number) {
  const [row] = await db
    .update(weights)
    .set({ ...input, version: sql`${weights.version} + 1`, updatedAt: new Date() })
    .where(eq(weights.version, expectedVersion))
    .returning();
  if (!row) {
    const current = await getWeightsRow();
    throw new HttpError(409, 'WEIGHTS_CONFLICT', 'Otro administrador ha cambiado los pesos. Revisa los valores actuales.', {
      current: toWeightsDto(current),
    });
  }
  return row;
}
