import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  target: 'node22',
  clean: true,
  // @leads/shared se publica como TS fuente: se incluye en el bundle en vez de resolverlo en runtime
  noExternal: ['@leads/shared'],
});
