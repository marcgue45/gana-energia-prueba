import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    setupFiles: ['./test/env.ts'],
    // Todos los ficheros comparten la BD de tests: se ejecutan uno detrás de otro
    fileParallelism: false,
  },
});
