-- Muestreo de saldos reales en EUR por usuario cada cinco minutos.
-- Se almacena patrimonio, no rentabilidad: las transferencias alteran el importe.
CREATE TABLE IF NOT EXISTS "trading_wallet_intraday" (
  "user_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "sampled_at" TIMESTAMPTZ(6) NOT NULL,
  "total" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "trading_wallet_intraday_pkey" PRIMARY KEY ("user_id", "workspace_id", "sampled_at")
);
CREATE INDEX IF NOT EXISTS "trading_wallet_intraday_workspace_time_idx"
ON "trading_wallet_intraday" ("workspace_id", "sampled_at" DESC);
