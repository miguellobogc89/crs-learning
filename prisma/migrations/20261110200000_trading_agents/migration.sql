-- Agentes: cada agente tiene su propia cartera virtual y sus propias reuniones del comité.
-- La cartera del usuario es la de agent = ''.
ALTER TABLE "trading_accounts" ADD COLUMN IF NOT EXISTS "agent" TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS "trading_accounts_workspace_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "trading_accounts_workspace_id_agent_key" ON "trading_accounts"("workspace_id", "agent");

ALTER TABLE "trading_committee_runs" ADD COLUMN IF NOT EXISTS "agent" TEXT NOT NULL DEFAULT '';
ALTER TABLE "trading_proposals" ADD COLUMN IF NOT EXISTS "agent" TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "trading_committee_runs_workspace_id_agent_created_at_idx" ON "trading_committee_runs"("workspace_id", "agent", "created_at");
CREATE INDEX IF NOT EXISTS "trading_proposals_workspace_id_agent_created_at_idx" ON "trading_proposals"("workspace_id", "agent", "created_at");
