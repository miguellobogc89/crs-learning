-- Precio en directo durante la sesión (vela provisional del día, separada de las velas de cierre)
-- y marca de las órdenes ejecutadas en la apertura con ese precio provisional.
-- Aditiva; aplicar después de 20261111090000_broker_integrations.

ALTER TABLE "market_instruments" ADD COLUMN IF NOT EXISTS "live_day" DATE;
ALTER TABLE "market_instruments" ADD COLUMN IF NOT EXISTS "live_open" DOUBLE PRECISION;
ALTER TABLE "market_instruments" ADD COLUMN IF NOT EXISTS "live_high" DOUBLE PRECISION;
ALTER TABLE "market_instruments" ADD COLUMN IF NOT EXISTS "live_low" DOUBLE PRECISION;
ALTER TABLE "market_instruments" ADD COLUMN IF NOT EXISTS "live_price" DOUBLE PRECISION;
ALTER TABLE "market_instruments" ADD COLUMN IF NOT EXISTS "live_at" TIMESTAMPTZ(6);

ALTER TABLE "trading_positions" ADD COLUMN IF NOT EXISTS "filled_intraday" BOOLEAN NOT NULL DEFAULT false;
