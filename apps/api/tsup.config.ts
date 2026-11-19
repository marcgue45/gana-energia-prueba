import { defineConfig } from 'tsup';

export default defineConfig({
  // Servidor + scripts de BD (el contenedor `setup` de docker-compose los ejecuta antes de la API)
  entry: { index: 'src/index.ts', migrate: 'src/db/migrate.ts', seed: 'src/db/seed.ts' },
  format: 'esm',
  target: 'node22',
  clean: true,
  // .mjs: Node lo trata como ES module sin depender de "type": "module" en un package.json
  // (en Vercel la función se empaqueta sin el package.json de la API)
  outExtension: () => ({ js: '.mjs' }),
  // @leads/shared se publica como TS fuente: se incluye en el bundle en vez de resolverlo en runtime
  noExternal: ['@leads/shared'],
});
