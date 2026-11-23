-- Avisos de Trading (17/11/2026): cuando algo se rompe (FARO parado, revisión parada, un exchange que no
-- se lee, el límite de IA, una copia con dinero real que falla) y cuando se arregla. Aplicada en Neon.
CREATE TABLE IF NOT EXISTS "trading_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  -- Identifica el problema: mientras siga abierto (resolved_at nulo) no se repite el aviso.
  "key" TEXT NOT NULL,
  -- error | aviso | ok
  "level" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "href" TEXT,
  "resolved_at" TIMESTAMPTZ(6),
  "read_at" TIMESTAMPTZ(6),
  CONSTRAINT "trading_notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "trading_notifications_created" ON "trading_notifications" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "trading_notifications_open" ON "trading_notifications" ("key") WHERE "resolved_at" IS NULL;
