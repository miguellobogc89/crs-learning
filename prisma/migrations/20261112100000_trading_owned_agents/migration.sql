-- Agentes de cada usuario (espacio): como mucho 3. Los agentes siguen siendo públicos para todos;
-- esto dice de quién son y cuáles mueven su dinero real.
CREATE TABLE IF NOT EXISTS "trading_user_agents" (
  "workspace_id" UUID NOT NULL,
  "agent" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "trading_user_agents_pkey" PRIMARY KEY ("workspace_id", "agent")
);

-- Saldo de cada exchange conectado, una foto por día (la última del día), para la gráfica de Mi cartera.
CREATE TABLE IF NOT EXISTS "trading_wallet_snapshots" (
  "connection_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "day" DATE NOT NULL,
  "total" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "trading_wallet_snapshots_pkey" PRIMARY KEY ("connection_id", "day")
);
CREATE INDEX IF NOT EXISTS "trading_wallet_snapshots_workspace_day_idx" ON "trading_wallet_snapshots" ("workspace_id", "day");

-- El espacio que ya copia a FÉNIX AJUSTADO se queda como dueño de CAMALEÓN-4 y FÉNIX AJUSTADO.
INSERT INTO "trading_user_agents" ("workspace_id", "agent")
SELECT w."workspace_id", a."agent"
FROM (SELECT "workspace_id" FROM "trading_mirrors" WHERE "agent" = 'fenix-ajustado' ORDER BY "created_at" LIMIT 1) w
CROSS JOIN (VALUES ('camaleon'), ('fenix-ajustado')) AS a("agent")
ON CONFLICT DO NOTHING;
