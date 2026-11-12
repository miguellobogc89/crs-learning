-- Pausar una copia: no compra nada nuevo con tu dinero, pero sigue vendiendo lo que tiene cuando el agente sale.
ALTER TABLE "trading_mirrors" ADD COLUMN IF NOT EXISTS "paused" BOOLEAN NOT NULL DEFAULT false;
