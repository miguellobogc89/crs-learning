-- CRS Finance: foto del saldo de cada cuenta en cada sincronización (una por día).
CREATE TABLE IF NOT EXISTS "finance_balance_snapshots" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" UUID NOT NULL REFERENCES "finance_accounts"("id") ON DELETE CASCADE,
  "day" DATE NOT NULL,
  "balance" DECIMAL(14,2) NOT NULL,
  "taken_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("account_id", "day")
);
CREATE INDEX IF NOT EXISTS "finance_balance_snapshots_user_day_idx" ON "finance_balance_snapshots" ("user_id", "day");
