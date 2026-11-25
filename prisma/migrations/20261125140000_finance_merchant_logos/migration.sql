-- CRS Finance: web (dominio) de cada comercio conocido, para enseñar su logo. Común a todos: es conocimiento público
-- (Netflix → netflix.com), no datos de nadie. domain NULL = no es una marca reconocible (no se vuelve a preguntar).
CREATE TABLE IF NOT EXISTS "finance_merchant_logos" (
  "merchant_key" TEXT PRIMARY KEY,
  "domain" TEXT,
  "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
