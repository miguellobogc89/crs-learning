-- Módulo de trading: datos de mercado (globales) y cartera virtual (por espacio). Aditiva; aplicar después de 20261105100000_public_tenders.

CREATE TABLE "market_instruments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "market" TEXT NOT NULL DEFAULT 'IBEX35',
    "is_index" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT,
    "last_candle_at" DATE,
    "last_sync_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "market_instruments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "market_candles" (
    "instrument_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "market_candles_pkey" PRIMARY KEY ("instrument_id", "day")
);

CREATE TABLE "market_backtests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "as_of" DATE NOT NULL,
    "instruments" INTEGER NOT NULL,
    "trades" INTEGER NOT NULL,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "params" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "market_backtests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trading_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Cartera virtual',
    "initial_capital" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "cash" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "risk_per_trade_pct" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "max_position_pct" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "max_open_positions" INTEGER NOT NULL DEFAULT 8,
    "commission_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "commission_min" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "slippage_bps" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "allow_short" BOOLEAN NOT NULL DEFAULT false,
    "auto_trade" BOOLEAN NOT NULL DEFAULT false,
    "min_score" INTEGER NOT NULL DEFAULT 65,
    "breakeven" BOOLEAN NOT NULL DEFAULT true,
    "patterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_processed_day" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trading_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trading_positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "quantity" INTEGER NOT NULL,
    "planned_entry" DOUBLE PRECISION NOT NULL,
    "entry_price" DOUBLE PRECISION,
    "entry_day" DATE,
    "stop" DOUBLE PRECISION NOT NULL,
    "initial_stop" DOUBLE PRECISION NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "max_hold_until" DATE,
    "exit_price" DOUBLE PRECISION,
    "exit_day" DATE,
    "exit_reason" TEXT,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pnl" DOUBLE PRECISION,
    "r_multiple" DOUBLE PRECISION,
    "pattern" TEXT,
    "signal_key" TEXT,
    "score" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trading_positions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trading_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "position_id" UUID,
    "kind" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "day" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trading_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trading_equity" (
    "account_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "equity" DOUBLE PRECISION NOT NULL,
    "cash" DOUBLE PRECISION NOT NULL,
    "invested" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "trading_equity_pkey" PRIMARY KEY ("account_id", "day")
);

CREATE UNIQUE INDEX "market_instruments_symbol_key" ON "market_instruments"("symbol");
CREATE INDEX "market_backtests_created_at_idx" ON "market_backtests"("created_at");
CREATE UNIQUE INDEX "trading_accounts_workspace_id_key" ON "trading_accounts"("workspace_id");
CREATE INDEX "trading_positions_account_id_status_idx" ON "trading_positions"("account_id", "status");
CREATE INDEX "trading_positions_workspace_id_idx" ON "trading_positions"("workspace_id");
CREATE INDEX "trading_transactions_account_id_created_at_idx" ON "trading_transactions"("account_id", "created_at");

ALTER TABLE "market_candles" ADD CONSTRAINT "market_candles_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "market_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trading_positions" ADD CONSTRAINT "trading_positions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trading_positions" ADD CONSTRAINT "trading_positions_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "market_instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trading_transactions" ADD CONSTRAINT "trading_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trading_equity" ADD CONSTRAINT "trading_equity_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
