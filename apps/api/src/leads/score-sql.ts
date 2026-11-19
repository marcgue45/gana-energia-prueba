import { AGE_MAX_DAYS, type Weights } from '@leads/shared';
import { sql } from 'drizzle-orm';

const SECONDS_PER_DAY = 24 * 60 * 60;

// Puntuación total calculada en SQL, para poder filtrar, ordenar y paginar en la BD.
// Espera la tabla leads con alias `l`.
//
// Las tres primeras valoraciones vienen de columnas (rateLeadData, en TypeScript).
// La antigüedad es la única regla duplicada: debe dar lo mismo que rateAge() en scoring.ts:
//   lineal de 100 (recién creado) a 0 (AGE_MAX_DAYS o más); fecha futura → 100.
// El test "coherencia SQL ↔ scoreLead" compara ambas implementaciones.
//
// `now` llega como parámetro (no now() de PostgreSQL) para que listado y detalle usen la misma
// referencia temporal y los tests sean deterministas.
export function ageRatingSql(now: Date) {
  return sql`(LEAST(1, GREATEST(0,
    1 - EXTRACT(EPOCH FROM (${now.toISOString()}::timestamptz - l.created_at)) / ${AGE_MAX_DAYS * SECONDS_PER_DAY}
  )) * 100)::float8`;
}

export function scoreSql(w: Weights, now: Date) {
  return sql`((
      ${w.newCustomer}::float8 * l.rating_new_customer
    + ${w.interest}::float8 * l.rating_interest
    + ${w.source}::float8 * l.rating_source
    + ${w.age}::float8 * ${ageRatingSql(now)}
  ) / 100)`;
}
