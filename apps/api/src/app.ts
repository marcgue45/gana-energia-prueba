import Fastify from 'fastify';
import { registerErrorHandler } from './errors.js';
import { protectedRoutes, publicRoutes } from './routes/api.js';
import { healthRoutes } from './routes/health.js';

// Separado de index.ts para poder instanciar la app en los tests (app.inject) sin levantar el servidor.
export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  registerErrorHandler(app);
  app.register(healthRoutes, { prefix: '/api' });
  app.register(publicRoutes, { prefix: '/api' });
  app.register(protectedRoutes, { prefix: '/api' });
  return app;
}
