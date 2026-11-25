-- CRS Finance: categorías que el usuario marca como «comprometido» (lo que se paga cada mes), además de sus grupos marcados.
ALTER TABLE "finance_settings" ADD COLUMN IF NOT EXISTS "committed_categories" TEXT[] NOT NULL DEFAULT '{}';
