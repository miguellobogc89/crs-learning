-- 1) Agentes globales: una sola cartera por agente para toda la plataforma (espacio ficticio).
--    Se conservan las carteras y reuniones del primer espacio que los creó; el resto se borra.
CREATE TEMP TABLE _agents_src AS
  SELECT workspace_id FROM "trading_accounts" WHERE "agent" <> '' AND "agent" NOT LIKE 'copia:%' ORDER BY "created_at" LIMIT 1;

UPDATE "trading_proposals" SET "workspace_id" = '00000000-0000-4000-8000-000000000001'
  WHERE "agent" <> '' AND "workspace_id" IN (SELECT workspace_id FROM _agents_src);
UPDATE "trading_committee_runs" SET "workspace_id" = '00000000-0000-4000-8000-000000000001'
  WHERE "agent" <> '' AND "workspace_id" IN (SELECT workspace_id FROM _agents_src);
DELETE FROM "trading_committee_runs" WHERE "agent" <> '' AND "workspace_id" <> '00000000-0000-4000-8000-000000000001';
UPDATE "trading_positions" SET "workspace_id" = '00000000-0000-4000-8000-000000000001'
  WHERE "account_id" IN (SELECT id FROM "trading_accounts" WHERE "agent" <> '' AND "workspace_id" IN (SELECT workspace_id FROM _agents_src));
UPDATE "trading_accounts" SET "workspace_id" = '00000000-0000-4000-8000-000000000001'
  WHERE "agent" <> '' AND "workspace_id" IN (SELECT workspace_id FROM _agents_src);
DELETE FROM "trading_accounts" WHERE "agent" <> '' AND "workspace_id" <> '00000000-0000-4000-8000-000000000001';
DROP TABLE _agents_src;

-- 2) Abrir cuenta: la cartera del usuario existe pero no está abierta hasta que elige su capital.
ALTER TABLE "trading_accounts" ADD COLUMN IF NOT EXISTS "opened_at" TIMESTAMPTZ(6);
UPDATE "trading_accounts" SET "opened_at" = "created_at" WHERE "agent" = '' AND "opened_at" IS NULL;

-- 3) Copiar a un agente: subcartera del usuario (agent = 'copia:<clave>') con su peso.
ALTER TABLE "trading_accounts" ADD COLUMN IF NOT EXISTS "copy_weight_pct" DOUBLE PRECISION;
