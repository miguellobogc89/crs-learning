-- Mis operaciones: compras que haces tú desde Oportunidades con tu dinero real (Bitvavo). La app vigila
-- el stop y el objetivo y vende sola; con «seguir si sube», al llegar al objetivo sube el stop en vez de vender.
CREATE TABLE IF NOT EXISTS "trading_manual_trades" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"  UUID NOT NULL,
  "idea_id"       UUID,
  "symbol"        TEXT NOT NULL,
  "pair"          TEXT,
  "status"        TEXT NOT NULL DEFAULT 'abriendo',
  "amount"        DOUBLE PRECISION NOT NULL,
  "quantity"      DOUBLE PRECISION,
  "entry_price"   DOUBLE PRECISION,
  "stop"          DOUBLE PRECISION NOT NULL,
  "initial_stop"  DOUBLE PRECISION NOT NULL,
  "target"        DOUBLE PRECISION NOT NULL,
  "trail"         BOOLEAN NOT NULL DEFAULT false,
  "trailing"      BOOLEAN NOT NULL DEFAULT false,
  "exit_price"    DOUBLE PRECISION,
  "result"        DOUBLE PRECISION,
  "buy_order_id"  TEXT,
  "sell_order_id" TEXT,
  "sell_attempts" INTEGER NOT NULL DEFAULT 0,
  "note"          TEXT,
  "opened_at"     TIMESTAMPTZ(6),
  "closed_at"     TIMESTAMPTZ(6),
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "trading_manual_trades_ws_status" ON "trading_manual_trades" ("workspace_id", "status");
