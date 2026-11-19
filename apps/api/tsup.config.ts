import { defineConfig } from 'tsup';

export default defineConfig({
  // Servidor + scripts de BD (el contenedor `setup` de docker-compose los ejecuta antes de la API)
  entry: { index: 'src/index.ts', migrate: 'src/db/migrate.ts', seed: 'src/db/seed.ts' },
  format: 'esm',
  target: 'node22',
  clean: true,
  // @leads/shared se publica como TS fuente: se incluye en el bundle en vez de resolverlo en runtime
  noExternal: ['@leads/shared'],
});
