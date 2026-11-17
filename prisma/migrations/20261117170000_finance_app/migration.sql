-- CRS Finance: movimientos guardados, clasificación aprendida, ciclo, presupuestos y copiloto.
-- Todo pertenece a una persona (user_id), nunca a un workspace.

CREATE TABLE IF NOT EXISTS "finance_settings" (
  "user_id" UUID NOT NULL,
  "cycle_start_day" INTEGER NOT NULL DEFAULT 25,
  "savings_goal" NUMERIC(14,2),
  "last_sync_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_settings_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "finance_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "finance_settings_cycle_day_check" CHECK ("cycle_start_day" BETWEEN 1 AND 28)
);

CREATE TABLE IF NOT EXISTS "finance_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'bank',
  "bank" TEXT,
  "external_uid" TEXT,
  "name" TEXT NOT NULL,
  "iban_last4" TEXT,
  "iban_hash" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "balance" NUMERIC(14,2),
  "balance_at" TIMESTAMPTZ(6),
  "included" BOOLEAN NOT NULL DEFAULT true,
  "last_synced_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "finance_accounts_user_id_external_uid_key" UNIQUE ("user_id", "external_uid")
);
CREATE INDEX IF NOT EXISTS "finance_accounts_user_id_idx" ON "finance_accounts"("user_id");

CREATE TABLE IF NOT EXISTS "finance_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "external_id" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'bank',
  "booking_date" DATE NOT NULL,
  "amount" NUMERIC(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "description" TEXT NOT NULL,
  "counterparty" TEXT,
  "counterparty_iban_hash" TEXT,
  "category" TEXT NOT NULL DEFAULT 'sin_clasificar',
  "kind" TEXT NOT NULL DEFAULT 'gasto',
  "category_source" TEXT NOT NULL DEFAULT 'pendiente',
  "extraordinary" BOOLEAN NOT NULL DEFAULT false,
  "transfer_pair_id" UUID,
  "note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "finance_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "finance_transactions_account_id_external_id_key" UNIQUE ("account_id", "external_id")
);
CREATE INDEX IF NOT EXISTS "finance_transactions_user_date_idx" ON "finance_transactions"("user_id", "booking_date" DESC);
CREATE INDEX IF NOT EXISTS "finance_transactions_user_source_idx" ON "finance_transactions"("user_id", "category_source");

CREATE TABLE IF NOT EXISTS "finance_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "pattern" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "extraordinary" BOOLEAN NOT NULL DEFAULT false,
  "label" TEXT,
  "hits" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "finance_rules_user_id_pattern_key" UNIQUE ("user_id", "pattern")
);

CREATE TABLE IF NOT EXISTS "finance_budgets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "amount" NUMERIC(14,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_budgets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "finance_budgets_user_id_idx" ON "finance_budgets"("user_id");

CREATE TABLE IF NOT EXISTS "finance_memory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_memory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_memory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "finance_memory_user_id_idx" ON "finance_memory"("user_id");

CREATE TABLE IF NOT EXISTS "finance_chat_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_chat_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "finance_chat_messages_user_created_idx" ON "finance_chat_messages"("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "finance_alert_dismissals" (
  "user_id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_alert_dismissals_pkey" PRIMARY KEY ("user_id", "key"),
  CONSTRAINT "finance_alert_dismissals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
