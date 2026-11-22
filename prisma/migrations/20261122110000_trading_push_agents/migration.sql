-- CRS Trading · Notificaciones push (22/11/2026, tarde): nuevo interruptor «Primera operación de un agente».
-- Los fallos del sistema dejan de ir al móvil (se quedan en la campana); su columna se conserva sin uso.
ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "notify_agents" BOOLEAN NOT NULL DEFAULT true;
