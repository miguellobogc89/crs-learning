-- CRS Finance: «Es una deuda» al cambiar la fecha de un gasto. Solo el consumo pasa al mes elegido; el cargo
-- sigue contando, como dinero, en el mes en que se pagó (en Comprometido).
ALTER TABLE "finance_transactions" ADD COLUMN IF NOT EXISTS "imputed_debt" BOOLEAN NOT NULL DEFAULT false;
