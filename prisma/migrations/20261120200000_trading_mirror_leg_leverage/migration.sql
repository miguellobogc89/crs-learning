-- Apalancamiento con el que se abrió cada copia de un corto en Kraken (NULL en las copias sin apalancamiento).
ALTER TABLE "trading_mirror_legs" ADD COLUMN IF NOT EXISTS "leverage" DOUBLE PRECISION;
-- Las ya abiertas: el que dice su nota («Corto x3 en Kraken»); sin «xN», x1.
UPDATE "trading_mirror_legs" SET "leverage" = COALESCE(substring("note" from 'Corto x([0-9]+)')::double precision, 1)
WHERE "leverage" IS NULL AND "pair" LIKE 'PF\_%';
