-- Agentes kamikaze: rondas con capital, meta y plazo. Las operaciones viven en las carteras virtuales
-- de siempre (trading_accounts / trading_positions); aquí, el marcador de cada ronda.
-- Aditiva; aplicar después de 20261111120000_trading_agent_meetings.
CREATE TABLE "trading_kamikaze_rounds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'en_curso',
    "start_capital" DOUBLE PRECISION NOT NULL,
    "goal" DOUBLE PRECISION NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "deadline" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "end_equity" DOUBLE PRECISION,
    "best_equity" DOUBLE PRECISION,
    "trades" INTEGER NOT NULL DEFAULT 0,
    "last_decision_at" TIMESTAMPTZ(6),
    "last_decision_price" DOUBLE PRECISION,
    "cooldown_until" TIMESTAMPTZ(6),
    CONSTRAINT "trading_kamikaze_rounds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "trading_kamikaze_rounds_agent_number" ON "trading_kamikaze_rounds"("agent", "number");
CREATE INDEX "trading_kamikaze_rounds_agent_status" ON "trading_kamikaze_rounds"("agent", "status");
