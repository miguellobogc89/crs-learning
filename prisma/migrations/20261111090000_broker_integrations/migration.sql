-- Módulo de integraciones con brókeres: conexiones por usuario (credenciales cifradas, entorno fijo,
-- permisos) y registro auditable de órdenes con clave de idempotencia.
-- Aditiva; aplicar después de 20261110220000_trading_open_copy.

CREATE TABLE "broker_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "account_id" TEXT,
    "account_label" TEXT,
    "currency" TEXT,
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
    "credentials_enc" TEXT,
    "credentials_source" TEXT NOT NULL DEFAULT 'stored',
    "last_error" TEXT,
    "last_checked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "broker_connections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "broker_connections_environment_check" CHECK ("environment" IN ('demo', 'real'))
);
CREATE UNIQUE INDEX "broker_connections_owner_unique" ON "broker_connections"("user_id", "workspace_id", "provider", "environment");
CREATE INDEX "broker_connections_workspace_idx" ON "broker_connections"("workspace_id");

CREATE TABLE "broker_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "reference" TEXT,
    "symbol" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "provider_symbol" TEXT,
    "side" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "limit_price" DOUBLE PRECISION,
    "stop_price" DOUBLE PRECISION,
    "time_in_force" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_submit',
    "provider_order_id" TEXT,
    "provider_status" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "response_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "broker_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "broker_orders_connection_fkey" FOREIGN KEY ("connection_id") REFERENCES "broker_connections"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "broker_orders_idempotency_unique" ON "broker_orders"("connection_id", "idempotency_key");
CREATE INDEX "broker_orders_user_idx" ON "broker_orders"("user_id", "created_at");

-- Qué conexión usa la cartera de Trading de cada espacio (y con cuál se abrió cada operación protegida).
ALTER TABLE "trading_accounts" ADD COLUMN IF NOT EXISTS "broker_connection_id" UUID;
ALTER TABLE "trading_broker_brackets" ADD COLUMN IF NOT EXISTS "connection_id" UUID;
