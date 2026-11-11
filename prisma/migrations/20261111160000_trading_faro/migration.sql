-- FARO: un analista que mira el mercado cripto cada ~30 min y publica ideas en un tablón común.
-- Los kamikazes (y el usuario) toman de ahí; cada idea se puntúa después con lo que hizo el precio.
-- Aditiva; aplicar después de 20261111140000_trading_kamikaze.
CREATE TABLE "trading_faro_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "status" TEXT NOT NULL DEFAULT 'en_curso',
    "market_view" TEXT,
    "ideas" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    CONSTRAINT "trading_faro_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "trading_faro_runs_created_at" ON "trading_faro_runs"("created_at");

CREATE TABLE "trading_faro_ideas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "pair" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "conviction" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "invalidation" DOUBLE PRECISION NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "rationale" TEXT NOT NULL,
    "risks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'viva',
    "last_price" DOUBLE PRECISION,
    "best_pct" DOUBLE PRECISION,
    "worst_pct" DOUBLE PRECISION,
    "exit_price" DOUBLE PRECISION,
    "result_pct" DOUBLE PRECISION,
    "resolved_at" TIMESTAMPTZ(6),
    "checked_at" TIMESTAMPTZ(6),
    CONSTRAINT "trading_faro_ideas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "trading_faro_ideas_status" ON "trading_faro_ideas"("status");
CREATE INDEX "trading_faro_ideas_created_at" ON "trading_faro_ideas"("created_at");
