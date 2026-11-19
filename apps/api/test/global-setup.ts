import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { testDatabaseUrl } from './db-url.js';

// Una vez por ejecución: crea la BD de tests si no existe y la deja migrada desde cero.
export default async function setup() {
  const urls = testDatabaseUrl();

  const admin = new pg.Client({ connectionString: urls.base });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [urls.name]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${urls.name}"`);
  await admin.end();

  const pool = new pg.Pool({ connectionString: urls.test });
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  await pool.end();
}
