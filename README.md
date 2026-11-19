# CRM de Leads · Prueba técnica Gana Energía

Gestión de leads comerciales con asignación a agentes y priorización por puntuación ponderada configurable.

**Demo:** https://gana-energia-prueba.vercel.app (autenticación simulada: elige un usuario al entrar; con «Admin» se pueden cambiar los pesos).

## Contenido

- [Stack](#stack)
- [Puesta en marcha en local](#puesta-en-marcha-en-local)
- [Docker](#docker)
- [Tests](#tests)
- [CI/CD y despliegue](#cicd-y-despliegue)
- [Arquitectura](#arquitectura)
- [Modelo de datos](#modelo-de-datos)
- [Sistema de pesos y puntuación](#sistema-de-pesos-y-puntuación)
- [Concurrencia y consistencia](#concurrencia-y-consistencia)
- [Autenticación simulada y permisos](#autenticación-simulada-y-permisos)
- [API](#api)
- [Limitaciones conocidas y mejoras](#limitaciones-conocidas-y-mejoras)

## Stack

| Capa         | Tecnología                                      |
| ------------ | ----------------------------------------------- |
| Backend      | Node.js 22 · TypeScript · Fastify · Drizzle ORM |
| Frontend     | React 19 · TypeScript · Vite · TanStack Query   |
| Persistencia | PostgreSQL 16                                   |
| Validación   | Zod (esquemas compartidos en `packages/shared`) |
| Tests        | Vitest (unitarios + integración contra PostgreSQL) |
| CI/CD        | GitHub Actions → Vercel (Services) + Neon       |

## Puesta en marcha en local

Requisitos: **Node ≥ 22.12** (hay `.nvmrc`: `nvm use`) y **Docker** (para PostgreSQL).

```bash
nvm use
npm ci                   # instala exactamente las versiones de package-lock.json
cp .env.example apps/api/.env
npm run db:up            # PostgreSQL 16 en localhost:5432
npm run db:migrate       # crea las tablas y la configuración inicial de pesos
npm run db:seed          # datos de ejemplo: 1 admin, 5 agentes y 500 leads
npm run dev:api          # API en http://localhost:3000/api/health
npm run dev:web          # web en http://localhost:5173 (proxy de /api → :3000)
```

**Si el puerto 5432 ya está ocupado**, levanta PostgreSQL en otro y apunta la API a él:

```bash
DB_PORT=5433 npm run db:up
# y en apps/api/.env: DATABASE_URL=postgres://leads:leads@localhost:5433/leads
```

### Datos de ejemplo

`npm run db:seed` **borra** leads y agentes y genera datos con una semilla fija: cada ejecución produce los mismos leads (las fechas son relativas a hoy). Incluye alrededor de un 10 % de datos ausentes en cada criterio y todos los estados.

- `npm run db:seed -- 100000` genera 100 000 leads para probar el rendimiento.
- `npm run db:seed -- --if-empty` solo carga datos si la base de datos está vacía. Es lo que usan Docker y el despliegue.

## Docker

Stack completo (PostgreSQL + preparación + API + web servida por nginx):

```bash
npm run docker:up        # web http://localhost:8080 · API http://localhost:3000
npm run docker:down
```

- **Servicio `setup`:** se ejecuta una vez antes de la API. Aplica las migraciones y carga los datos de ejemplo solo si la base de datos está vacía, así que reiniciar el stack no borra nada. Va separado de la API para que varias instancias de la API no intenten migrar a la vez.
- **Puertos del host:** se configuran con `DB_PORT`, `API_PORT` y `WEB_PORT`. Por ejemplo, `DB_PORT=5433 npm run docker:up`.
- **Construcción de las imágenes:** se hace desde la raíz del repositorio, porque necesitan los workspaces. La API se empaqueta con tsup e incluye `@leads/shared` y los scripts de migración y datos de ejemplo.
- **nginx:** hace de proxy de `/api`, igual que Vite en desarrollo y las reglas de enrutado en Vercel. La web siempre llama a `/api` con una ruta relativa.

## Tests

```bash
npm test                 # necesita PostgreSQL levantado (npm run db:up)
npm run typecheck
```

- **`packages/shared` (66 tests):** reglas de valoración de cada criterio con sus casos límite, la fórmula, la prioridad y la validación de pesos y leads.
- **`apps/api` (53 tests):** de integración contra una base de datos real (`<nombre>_test`, que se crea y migra sola en el mismo servidor sin tocar los datos de desarrollo). Cubren:
  - Asignaciones y ediciones **simultáneas**.
  - Conflictos de versión.
  - Validación y permisos.
  - Filtros, búsqueda, paginación y desempate.
  - Coherencia entre la puntuación calculada en SQL y la de TypeScript.

## CI/CD y despliegue

`.github/workflows/ci.yml`:

1. **CI**, en cada push y pull request:
   - Comprobación de tipos, todos los tests (con PostgreSQL como contenedor auxiliar) y compilación de la API y la web.
   - Construcción de las imágenes Docker.
2. **CD**, solo en `main` y solo si la CI pasa:
   1. Migraciones contra la base de datos de producción (Neon).
   2. Datos de ejemplo si la base de datos está vacía.
   3. `vercel build` y `vercel deploy --prebuilt --prod`.

   Si un test falla, no se despliega nada. Las migraciones se aplican antes que el código nuevo, así que deben ser compatibles con la versión anterior: primero se añade lo nuevo y, en un despliegue posterior, se elimina lo viejo.

En Vercel, `vercel.json` define un proyecto con dos servicios que se despliegan juntos: `web` (Vite) y `api` (Fastify). Las peticiones a `/api/*` van a la API y el resto a la web. Los despliegues automáticos de Vercel en cada push están desactivados (`git.deploymentEnabled: false`) para que solo despliegue el flujo de CI cuando los tests pasan.

La base de datos es Neon, añadida desde el Marketplace de Vercel, que crea `DATABASE_URL` en el proyecto. Las credenciales no están en el repositorio: van en las variables de entorno de Vercel y en los secretos de GitHub (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` y `DATABASE_URL`, esta última con la conexión directa, no la del pool, para las migraciones).

## Arquitectura

```
Navegador ── /api ──▶ API Fastify ──▶ PostgreSQL
 (React SPA)          rutas → servicios → Drizzle / SQL
     │                     │
     └──── packages/shared ┘  reglas de puntuación, constantes y esquemas Zod
```

- **`packages/shared`:** la única fuente de las reglas.
  - `scoring.ts`: valoración de cada criterio, fórmula y prioridad.
  - `constants.ts`: escalas, tabla de orígenes, umbrales y pesos iniciales.
  - `schemas.ts`: validación con Zod.

  La API lo usa para validar y puntuar, y la web para validar en el navegador y explicar las reglas.
- **`apps/api`:** las rutas solo validan y llaman a los servicios (`leads.service.ts`, `weights.service.ts`), que contienen la lógica y el acceso a datos. Los errores tienen un formato único.
- **`apps/web`:**
  - Dos vistas: Leads, con el detalle en un panel lateral, y Pesos.
  - Los filtros, la página y el lead abierto se guardan en la URL.
  - TanStack Query para la caché y los estados de carga y error.

## Modelo de datos

```
agents   id · name · role (agent | admin)

leads    id · name · phone (normalizado, +34612345678) · status (new | in_progress | contacted | closed)
         agent_id → agents (opcional)
         is_new_customer · interest (1–10) · source      ← datos de puntuación (null = ausente)
         rating_new_customer · rating_interest · rating_source  ← valoraciones 0–100 calculadas por el servidor
         version (bloqueo optimista) · created_at · updated_at

weights  una sola fila: new_customer · interest · source · age · version · updated_at
```

- **Restricciones en la propia base de datos:**
  - Interés entre 1 y 10, y valoraciones entre 0 y 100.
  - Pesos: no negativos, suma igual a 100 y una sola fila (`CHECK (id)` sobre una clave booleana).
- **La fila inicial de pesos (40/30/20/10) la crea una migración**, porque la API la necesita siempre.
- **Índices:**
  - Por estado y por agente, para los filtros.
  - Trigram (`pg_trgm`) sobre nombre y teléfono, para buscar por subcadena (`ILIKE '%…%'`) sin recorrer la tabla.

## Sistema de pesos y puntuación

```
puntuación = Σ (valoración del criterio × peso / 100)        → 0–100
prioridad  = alta si ≥ 75 · media si ≥ 40 · baja en otro caso (sobre el total sin redondear)
```

| Criterio | Valoración (0–100) | Dato ausente | Dato inválido |
| --- | --- | --- | --- |
| Cliente nuevo | Sí → 100 · No → 0 | 0 | — |
| Interés comercial | Lineal: 1 → 0, 10 → 100 | 0 | Fuera de rango → se ajusta al extremo; no numérico → 0 |
| Origen del lead | Recomendación 100 · Web 70 · Teléfono 50 · Captación en frío 30 | 0 | Origen desconocido → 0 |
| Antigüedad | Lineal: recién creado → 100, 90 días o más → 0 | — | Fecha futura → 100; fecha inválida → 0 |

- **Datos ausentes:** la API acepta leads sin algún dato de puntuación. Ese criterio vale 0 y el desglose lo indica con una nota («Dato ausente»).
- **Datos inválidos:** la API los rechaza al entrar. Las reglas también los contemplan por si llegan por otra vía, como una importación.
- **Validación de los pesos** (en la web, en la API y en la base de datos):
  - Enteros, no negativos, sin criterios duplicados ni ausentes, y suma exactamente 100.
  - La API los recibe como lista `[{ criterion, weight }]`. En un objeto JSON, una clave duplicada se perdería en silencio al leerlo, y así se puede rechazar.
  - Una configuración inválida devuelve 400 con el motivo de cada error y no cambia nada.
- **Dónde se calcula cada cosa:**
  - Las valoraciones que solo dependen del lead (cliente nuevo, interés y origen) se calculan en TypeScript al crear o editar el lead, y se guardan.
  - El **total se calcula en SQL al consultar**, con los pesos vigentes y la antigüedad sacada de `created_at`. Por eso cambiar los pesos o el paso del tiempo se reflejan al momento, sin recálculos ni tareas en segundo plano, y se puede filtrar, ordenar y paginar en la base de datos.
  - El desglose del detalle lo calcula `scoreLead()` con los mismos pesos y la misma hora de referencia. Un test comprueba que ambos cálculos coinciden.
- **Desempate estable:** `ORDER BY score DESC, id ASC`.
- **Rendimiento medido con 100 000 leads:** unos 170 ms sin filtros y unos 70 ms filtrando y buscando.
- **La web trunca la puntuación a un decimal**, no la redondea, para que la cifra nunca contradiga la prioridad: 74,96 se muestra como «74,9 / Media», no «75,0 / Media».

## Concurrencia y consistencia

| Escenario | Solución | Comprobado en |
| --- | --- | --- |
| **Dos agentes se asignan el mismo lead a la vez** | `UPDATE … SET agent_id = $agente WHERE id = $1 AND agent_id IS NULL`. PostgreSQL bloquea la fila durante el `UPDATE`: solo una petición la encuentra libre y la otra actualiza 0 filas y recibe **409**. Repetir la misma asignación (doble clic) devuelve 200. | `assign.test.ts`: 2 y 10 peticiones simultáneas |
| **Dos usuarios editan información desactualizada** | Bloqueo optimista: cada lead tiene `version`. El cliente envía la que leyó y se hace `UPDATE … WHERE id = $1 AND version = $v`. Si alguien guardó antes, **409** con los datos actuales. La web muestra qué cambió la otra persona y deja elegir entre «Descartar mis cambios» y «Guardar mis cambios encima» (reenvía solo los campos propios con la versión nueva). | `leads.test.ts`: 5 ediciones simultáneas, se aplica una |
| **Un administrador cambia los pesos mientras otros consultan o editan** | No hay nada que recalcular: el total se calcula al consultar. Cada lectura va en una transacción `REPEATABLE READ READ ONLY`, así que los pesos, la página y el total de resultados salen del mismo estado de la base de datos y nunca se mezclan dos configuraciones. Las ediciones de leads no dependen de los pesos. Cada listado devuelve `weightsVersion` y la web avisa si ha cambiado. Dos administradores a la vez: bloqueo optimista también en los pesos. | `weights.test.ts` |
| **Pesos no válidos o datos insuficientes** | Pesos inválidos → 400 con el detalle, sin cambios. Criterio sin datos → 0 con nota en el desglose. Si no existe la configuración de pesos → **503** con un mensaje claro, no un error genérico. | `weights.test.ts`, `leads.test.ts` |

No hacen falta transacciones `SERIALIZABLE` ni reintentos: con el nivel de aislamiento por defecto y actualizaciones condicionales, cada escritura es atómica.

## Autenticación simulada y permisos

- **Identificación:** la web envía la cabecera `X-Agent-Id` con el usuario elegido en el selector de sesión. **El backend determina la identidad:**
  - Comprueba en la base de datos que el agente existe y lee su rol.
  - Sin cabecera o con un agente desconocido, responde 401.

  En producción se sustituiría por una sesión o un JWT firmado, sin cambiar el resto del código.
- **Permisos:**

  | Acción | Agente | Administrador |
  | --- | --- | --- |
  | Ver, crear y editar leads | ✓ | ✓ |
  | Asignar un lead | Solo a sí mismo | A cualquier agente |
  | Desasignar un lead | Solo los suyos | Cualquiera |
  | Cambiar los pesos | — | ✓ |

- **Puntuación no manipulable:** el navegador nunca envía puntuaciones ni valoraciones. Los esquemas son estrictos: si una petición incluye `score`, `agentId` u otro campo no previsto, se rechaza con 400.
- **Demo pública:** al ser autenticación simulada, cualquiera puede entrar como administrador y cambiar los pesos.

## API

Todas las rutas cuelgan de `/api`. Los errores tienen siempre el formato `{ "error": { "code", "message", "details" } }`. En los 409, `details.current` trae los datos actuales.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/agents` | Usuarios (pública: la usa el selector de sesión) |
| GET | `/me` | Usuario actual |
| GET | `/leads?status=&agentId=&q=&page=&pageSize=` | Listado ordenado por puntuación. `agentId=none` muestra los sin asignar; `q` busca por nombre o teléfono; `pageSize` es como máximo 100 |
| GET | `/leads/:id` | Detalle con el desglose de la puntuación |
| POST | `/leads` | Alta (201) |
| PATCH | `/leads/:id` | Edición parcial y cambio de estado; exige `version` |
| POST | `/leads/:id/assign` | Asignar (cuerpo opcional `{ agentId }`, solo para administradores) |
| POST | `/leads/:id/unassign` | Desasignar |
| GET / PUT | `/weights` | Ver los pesos / cambiarlos (solo administradores; `{ weights: [{criterion, weight}], version }`) |

## Limitaciones conocidas y mejoras

- **Ordenar por puntuación no usa un índice,** porque es una expresión calculada. Con cientos de miles de leads va bien, como muestran las mediciones. Para millones: puntuación materializada con recálculo periódico, aceptando un pequeño desfase en la antigüedad.
- **Paginación por desplazamiento (`OFFSET`):** permite saltar a cualquier página, pero si los datos o los pesos cambian entre una página y la siguiente, un lead puede repetirse o saltarse. La paginación por cursor no es directa con un orden calculado.
- **Sin historial de pesos ni auditoría** de cambios en los leads.
- **Autenticación simulada:** en producción, una sesión o un JWT y un proveedor de identidad.
- **El aviso de pesos cambiados aparece al volver a pedir datos** (al recuperar el foco o navegar), no en tiempo real. Mejora: Server-Sent Events.
- **La web no tiene tests automáticos:** la lógica crítica está cubierta en `shared` y en la API. Mejora: tests de componentes y unos pocos flujos de extremo a extremo con Playwright.
- **Sin límite de peticiones por cliente ni CORS:** la web y la API se sirven desde el mismo origen.

---

Desarrollado con apoyo de Claude Code (IA). Las decisiones de diseño y sus alternativas están razonadas en este README.
