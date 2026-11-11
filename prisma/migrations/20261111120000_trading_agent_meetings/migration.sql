-- Reuniones de los agentes durante el día: turno para que dos servidores no reúnan al mismo agente a la vez.
-- Aditiva; aplicar después de 20261111100000_trading_live.
ALTER TABLE "trading_accounts" ADD COLUMN IF NOT EXISTS "meeting_lease_until" TIMESTAMPTZ(6);
