-- Ideas de control de FARO: en cada análisis, tantas como publica la IA, eligiendo al azar entre las
-- mismas monedas candidatas y con el mismo riesgo, recorrido y validez. No se enseñan ni se operan: solo
-- sirven para saber si la IA elige mejor que el azar. Se leen y escriben por SQL directo (fuera del
-- esquema de Prisma) para que, sin esta migración, todo lo demás siga funcionando.
CREATE TABLE IF NOT EXISTS "trading_faro_controls" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "pair" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "invalidation" DOUBLE PRECISION NOT NULL,
  "target" DOUBLE PRECISION NOT NULL,
  "valid_until" TIMESTAMPTZ(6) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'viva',
  "best_pct" DOUBLE PRECISION,
  "worst_pct" DOUBLE PRECISION,
  "last_price" DOUBLE PRECISION,
  "exit_price" DOUBLE PRECISION,
  "result_pct" DOUBLE PRECISION,
  "resolved_at" TIMESTAMPTZ(6),
  "checked_at" TIMESTAMPTZ(6),
  "features" JSONB,
  CONSTRAINT "trading_faro_controls_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "trading_faro_controls_status" ON "trading_faro_controls" ("status");
