-- CRS Finance: periodo y cuentas elegidos en pantalla (se recuerdan entre visitas y dispositivos).
ALTER TABLE "finance_settings" ADD COLUMN IF NOT EXISTS "view" JSONB;

-- Titular de cada cuenta bancaria (el nombre visible se puede cambiar).
ALTER TABLE "finance_accounts" ADD COLUMN IF NOT EXISTS "holder_name" TEXT;
UPDATE "finance_accounts" SET "holder_name" = "name" WHERE "source" = 'bank' AND "holder_name" IS NULL;
