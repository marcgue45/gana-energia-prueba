// Los tests usan una BD aparte (<nombre>_test) en el mismo servidor, para no tocar los datos de desarrollo.
export function testDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile('.env');
    } catch {
      // sin .env: DATABASE_URL tiene que venir del entorno
    }
  }
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('Define DATABASE_URL (apps/api/.env) para ejecutar los tests de integración');
  const url = new URL(base);
  const testUrl = new URL(base);
  testUrl.pathname = `${url.pathname.replace(/_test$/, '')}_test`;
  return { base: url.toString(), test: testUrl.toString(), name: testUrl.pathname.slice(1) };
}
