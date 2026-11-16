-- FARO también analiza la bolsa de EE. UU.: cada análisis lleva su ámbito ('crypto' o 'us') para que uno
-- no bloquee al otro y cada tablón enseñe su lectura del mercado. Aplicada en Neon el 16/11/2026.
ALTER TABLE "trading_faro_runs" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'crypto';
