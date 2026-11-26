-- CRS Finance: cargos retenidos (autorizaciones de tarjeta que el banco aún no ha contabilizado). Se guardan para que
-- cuenten ya como gastado; al contabilizarse se convierten en el movimiento definitivo, y si se anulan se borran.
ALTER TABLE "finance_transactions" ADD COLUMN IF NOT EXISTS "pending" BOOLEAN NOT NULL DEFAULT false;
