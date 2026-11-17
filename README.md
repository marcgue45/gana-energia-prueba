# CRM de Leads · Prueba técnica Gana Energía

Gestión de leads comerciales con asignación a agentes y priorización por puntuación ponderada configurable.

## Stack

| Capa        | Tecnología                                   |
| ----------- | -------------------------------------------- |
| Backend     | Node.js 22 · TypeScript · Fastify · Drizzle  |
| Frontend    | React · TypeScript · Vite · TanStack Query   |
| Persistencia| PostgreSQL 16                                |
| Validación  | Zod (esquemas compartidos en `packages/shared`) |
| Tests       | Vitest                                       |

## Estructura

```
apps/
  api/      API HTTP (Fastify + Drizzle)
  web/      SPA React (Vite)
packages/
  shared/   Tipos y esquemas Zod comunes a API y web
```

## Puesta en marcha

Requisitos: Node ≥ 22.12 (`nvm use`) y Docker.

```bash
npm install
cp .env.example apps/api/.env
npm run db:up            # PostgreSQL en localhost:5432
npm run dev:api          # http://localhost:3000/api/health
npm run dev:web          # http://localhost:5173 (proxy /api → :3000)
npm test
```

## Docker

Stack completo (Postgres + API + web servida por nginx):

```bash
npm run docker:up        # web http://localhost:8080 · api http://localhost:3000
npm run docker:down
```

- Los puertos del host se configuran con `DB_PORT`, `API_PORT` y `WEB_PORT` (por ejemplo, `DB_PORT=5433 npm run docker:up` si ya tienes Postgres en el 5432).
- Las imágenes se construyen desde la raíz del repo para tener acceso a los workspaces. La API se empaqueta con tsup e incluye `@leads/shared` dentro del bundle.
- nginx hace de proxy de `/api` hacia el contenedor `api`, igual que el proxy de Vite en desarrollo y el rewrite en Vercel, así que la web siempre llama a `/api` con ruta relativa.

## Despliegue en Vercel

`vercel.json` usa **Vercel Services**: un solo proyecto con dos servicios (`web` con Vite y `api` con Fastify) que se despliegan juntos. `/api/*` va a la API y el resto a la SPA.

1. Crea una base de datos Postgres gestionada (por ejemplo, [Neon](https://neon.com)). Vercel no ejecuta el contenedor de Postgres.
2. `vercel link` en la raíz del repo.
3. `vercel env add DATABASE_URL` con la cadena de conexión de Neon (en *preview* y en *production*).
4. `vercel` para hacer un despliegue de preview, o `vercel --prod`.

Las credenciales no se suben al repo: van solo en las variables de entorno de Vercel.

## Arquitectura

_TODO_

## Modelo de datos

_TODO_

## Sistema de pesos y puntuación

_TODO: cómo se valora cada criterio (0–100), los valores ausentes o inválidos y el desempate._

## Concurrencia y consistencia

_TODO: asignación simultánea, edición con datos desactualizados y cambio de pesos en caliente._

## Autenticación simulada

_TODO_

## Datos de ejemplo

_TODO_

## Limitaciones conocidas y mejoras

_TODO_
