-- CRS Finance: ahorro de un mes concreto (clave: el día en que empieza ese mes de nómina), por encima del ahorro fijo.
ALTER TABLE "finance_settings" ADD COLUMN IF NOT EXISTS "savings_by_month" JSONB NOT NULL DEFAULT '{}';
