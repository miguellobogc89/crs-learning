-- CRS Finance · Mi plan: objetivo (meta de gasto por ciclo) de cada paquete. Opcional.
ALTER TABLE "finance_packages" ADD COLUMN IF NOT EXISTS "goal" NUMERIC(14,2);
