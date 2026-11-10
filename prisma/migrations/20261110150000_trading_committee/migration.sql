-- Comité de inversión (coordinador con IA) y cantidades fraccionarias para crypto.
-- Aplicar después de 20261110120000_trading_news.

ALTER TABLE "trading_positions" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;

CREATE TABLE "trading_committee_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "as_of" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "market_view" TEXT,
    "watchlist" JSONB NOT NULL DEFAULT '[]',
    "context" JSONB NOT NULL DEFAULT '{}',
    "raw" JSONB,
    "error" TEXT,
    "model" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trading_committee_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trading_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "conviction" INTEGER NOT NULL,
    "horizon_days" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "stop" DOUBLE PRECISION,
    "target" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION,
    "rationale" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "risks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'propuesta',
    "rejection" TEXT,
    "position_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trading_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trading_committee_runs_workspace_id_created_at_idx" ON "trading_committee_runs"("workspace_id", "created_at");
CREATE INDEX "trading_proposals_workspace_id_created_at_idx" ON "trading_proposals"("workspace_id", "created_at");
CREATE INDEX "trading_proposals_run_id_idx" ON "trading_proposals"("run_id");
ALTER TABLE "trading_proposals" ADD CONSTRAINT "trading_proposals_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "trading_committee_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
