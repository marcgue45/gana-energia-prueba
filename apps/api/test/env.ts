import { testDatabaseUrl } from './db-url.js';

// Se ejecuta antes de importar cada fichero de test: db/client.ts crea el pool con esta URL.
process.env.DATABASE_URL = testDatabaseUrl().test;
process.env.NODE_ENV = 'test';
