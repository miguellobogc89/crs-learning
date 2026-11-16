-- Foto diaria del panorama del mercado (miedo y codicia, RSI y tendencia de Bitcoin, funding, dólar…).
-- Sirve para estudiar después qué contexto acompaña a las ideas que ganan y a las que pierden. Se lee y
-- escribe por SQL directo (fuera del esquema de Prisma): sin esta migración, todo lo demás sigue igual.
CREATE TABLE IF NOT EXISTS "trading_market_pulse" (
  "day" DATE NOT NULL,
  "data" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "trading_market_pulse_pkey" PRIMARY KEY ("day")
);
