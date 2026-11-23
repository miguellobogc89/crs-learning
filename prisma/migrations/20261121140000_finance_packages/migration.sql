-- CRS Finance · Mi plan: paquetes de gasto que crea el usuario (Fijos, Tabaco, Gasolina…) con los cargos que marca.
CREATE TABLE IF NOT EXISTS "finance_packages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "tx_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_packages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_packages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "finance_packages_user_id_idx" ON "finance_packages"("user_id");
