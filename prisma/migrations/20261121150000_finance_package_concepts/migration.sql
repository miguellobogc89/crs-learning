-- CRS Finance · Mi plan: conceptos de cada paquete (entran sus cargos pasados y futuros, aunque cambie el importe).
ALTER TABLE "finance_packages" ADD COLUMN IF NOT EXISTS "concept_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
