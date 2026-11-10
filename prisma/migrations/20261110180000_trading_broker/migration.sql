-- Bróker (Trading 212 Demo): vinculación de valores, autonomía del comité y operaciones protegidas.
-- Aditiva; aplicar después de 20261110150000_trading_committee.

ALTER TABLE "market_instruments" ADD COLUMN "isin" TEXT;
ALTER TABLE "market_instruments" ADD COLUMN "broker_ticker" TEXT;
ALTER TABLE "market_instruments" ADD COLUMN "broker_checked_at" TIMESTAMPTZ(6);
ALTER TABLE "market_instruments" ADD COLUMN "broker_note" TEXT;

ALTER TABLE "trading_accounts" ADD COLUMN "broker_autonomy" TEXT NOT NULL DEFAULT 'aprobacion';

CREATE TABLE "trading_broker_brackets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "broker" TEXT NOT NULL DEFAULT 'trading212_demo',
    "symbol" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "stop" DOUBLE PRECISION NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "planned_price" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'esperando_entrada',
    "entry_order_id" TEXT,
    "stop_order_id" TEXT,
    "exit_order_id" TEXT,
    "entry_price" DOUBLE PRECISION,
    "exit_price" DOUBLE PRECISION,
    "exit_reason" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "proposal_id" UUID,
    "last_checked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trading_broker_brackets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trading_broker_brackets_workspace_id_status_idx" ON "trading_broker_brackets"("workspace_id", "status");
