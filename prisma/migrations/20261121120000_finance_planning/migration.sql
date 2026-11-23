-- CRS Finance · Planificación (la hucha): partidas con tipo y cuenta que las paga, ingreso esperado,
-- cuentas de cobro y de ahorro, y lista de deseos. Solo añade columnas y tablas: no cambia datos existentes.

ALTER TABLE "finance_budgets"
  ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'variable',
  ADD COLUMN IF NOT EXISTS "account_id" UUID;
DO $$ BEGIN
  ALTER TABLE "finance_budgets" ADD CONSTRAINT "finance_budgets_kind_check" CHECK ("kind" IN ('fijo', 'variable'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "finance_budgets" ADD CONSTRAINT "finance_budgets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "finance_settings"
  ADD COLUMN IF NOT EXISTS "expected_income" NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS "income_account_id" UUID,
  ADD COLUMN IF NOT EXISTS "savings_account_id" UUID;
DO $$ BEGIN
  ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_income_account_id_fkey" FOREIGN KEY ("income_account_id") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_savings_account_id_fkey" FOREIGN KEY ("savings_account_id") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "finance_wishlist_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "price" NUMERIC(14,2) NOT NULL,
  "saved" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "url" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 2,
  "purchased_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_wishlist_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_wishlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "finance_wishlist_items_price_check" CHECK ("price" > 0 AND "saved" >= 0),
  CONSTRAINT "finance_wishlist_items_priority_check" CHECK ("priority" BETWEEN 1 AND 3)
);
CREATE INDEX IF NOT EXISTS "finance_wishlist_items_user_id_idx" ON "finance_wishlist_items"("user_id");
