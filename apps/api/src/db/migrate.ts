// Aplica las migraciones pendientes de ./drizzle (mismo registro que drizzle-kit: tabla drizzle.__drizzle_migrations).
// Se usa igual en local (npm run db:migrate), en Docker (servicio setup) y en el despliegue (CI/CD).
// Va empaquetado con la API para no necesitar drizzle-kit (dependencia de desarrollo) en producción.
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.js';

const migrationsFolder = process.env.MIGRATIONS_DIR ?? './drizzle';

migrate(db, { migrationsFolder })
  .then(() => console.log('Migraciones aplicadas.'))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
