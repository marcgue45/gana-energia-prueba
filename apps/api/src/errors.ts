import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

// Formato único de error: { error: { code, message, details? } }.
// `code` es estable (la web decide qué hacer con él); `message` es para mostrar.
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} no encontrado`);

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | HttpError | ZodError, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Datos no válidos', details } });
    }
    // Errores propios de Fastify con status 4xx (JSON mal formado, cuerpo demasiado grande…)
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: err.code ?? 'BAD_REQUEST', message: err.message } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } });
  });
}
