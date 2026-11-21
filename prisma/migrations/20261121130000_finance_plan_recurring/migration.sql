-- CRS Finance · Planificación: recibos detectados que forman cada partida fija (para recordarlos al editar el plan).
ALTER TABLE "finance_budgets" ADD COLUMN IF NOT EXISTS "recurring_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
