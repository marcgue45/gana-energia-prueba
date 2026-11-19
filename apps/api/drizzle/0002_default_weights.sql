-- Configuración inicial de pesos (DEFAULT_WEIGHTS en packages/shared). Forma parte del esquema,
-- no de los datos de ejemplo: la API necesita siempre una fila de pesos para puntuar.
INSERT INTO "weights" ("id", "new_customer", "interest", "source", "age") VALUES (true, 40, 30, 20, 10) ON CONFLICT DO NOTHING;
