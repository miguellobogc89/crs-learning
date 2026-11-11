-- Copia de agentes en tu bróker (Binance): por cada agente que copias, un presupuesto en euros y
-- un modo (ensayo: calcula las órdenes sin enviarlas; real: las envía). Cada posición del agente
-- copiada es un «tramo» con su compra y su venta. Aditiva.
CREATE TABLE "trading_mirrors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "agent" TEXT NOT NULL,
  "budget" DOUBLE PRECISION NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'ensayo',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "trading_mirrors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "trading_mirrors_workspace_agent" ON "trading_mirrors" ("workspace_id", "agent");

CREATE TABLE "trading_mirror_legs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "mirror_id" UUID NOT NULL,
  "source_position_id" UUID NOT NULL,
  "mode" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "pair" TEXT,
  "status" TEXT NOT NULL DEFAULT 'abriendo',
  "amount" DOUBLE PRECISION,
  "quantity" DOUBLE PRECISION,
  "entry_price" DOUBLE PRECISION,
  "exit_price" DOUBLE PRECISION,
  "result" DOUBLE PRECISION,
  "buy_order_id" TEXT,
  "sell_order_id" TEXT,
  "sell_attempts" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "opened_at" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "trading_mirror_legs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trading_mirror_legs_mirror_fkey" FOREIGN KEY ("mirror_id") REFERENCES "trading_mirrors" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "trading_mirror_legs_source" ON "trading_mirror_legs" ("mirror_id", "source_position_id");
CREATE INDEX "trading_mirror_legs_status" ON "trading_mirror_legs" ("mirror_id", "status");
