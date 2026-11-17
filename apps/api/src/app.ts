import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';

// Separado de index.ts para poder instanciar la app en los tests (app.inject) sin levantar el servidor.
export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  app.register(healthRoutes, { prefix: '/api' });
  return app;
}
