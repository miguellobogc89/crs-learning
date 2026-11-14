-- Lo que veía FARO al publicar cada idea (métricas del par, fase del mercado, hora…), para poder
-- analizar en qué situaciones acierta y aprender de ello. Nulo en las ideas anteriores.
ALTER TABLE "trading_faro_ideas" ADD COLUMN IF NOT EXISTS "features" JSONB;
