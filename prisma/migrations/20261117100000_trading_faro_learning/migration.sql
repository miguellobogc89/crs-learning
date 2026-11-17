-- Base para que FARO aprenda (17/11/2026). Aplicada en Neon el 17/11/2026.
-- 1) Versión de FARO en cada análisis: para comparar versiones en las mismas condiciones.
ALTER TABLE "trading_faro_runs" ADD COLUMN IF NOT EXISTS "version" TEXT;

-- 2) Todos los candidatos que vio cada análisis (los que propuso y los que no), con su foto del mercado
--    y lo que pasó después (6 h y 24 h): para saber qué se le escapa y no solo en qué se equivoca.
CREATE TABLE IF NOT EXISTS "trading_faro_candidates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL REFERENCES "trading_faro_runs"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "pair" TEXT NOT NULL,
  "base" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "styles" TEXT[] NOT NULL DEFAULT '{}',
  "chosen" BOOLEAN NOT NULL DEFAULT false,
  "idea_id" UUID,
  "features" JSONB,
  "outcome" JSONB,
  "checked_at" TIMESTAMPTZ(6),
  CONSTRAINT "trading_faro_candidates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "trading_faro_candidates_created" ON "trading_faro_candidates" ("created_at");
CREATE INDEX IF NOT EXISTS "trading_faro_candidates_pending" ON "trading_faro_candidates" ("created_at") WHERE "outcome" IS NULL;
CREATE INDEX IF NOT EXISTS "trading_faro_candidates_run" ON "trading_faro_candidates" ("run_id");
