-- Apalancamiento propio de una copia de un agente de cortos (Kraken). NULL = el del agente.
ALTER TABLE "trading_mirrors" ADD COLUMN IF NOT EXISTS "leverage" DOUBLE PRECISION;
