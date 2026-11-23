-- CRS Trading · Notificaciones push en el móvil (22/11/2026).
-- Una fila por móvil o navegador suscrito (la PWA instalada en la pantalla de inicio en iPhone).
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "endpoint" TEXT NOT NULL UNIQUE,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT,
  -- Qué avisos quiere este móvil: compras y ventas, movimientos del stop, fallos (y su «resuelto»).
  "notify_trades" BOOLEAN NOT NULL DEFAULT true,
  "notify_stops" BOOLEAN NOT NULL DEFAULT false,
  "notify_health" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_ok_at" TIMESTAMPTZ,
  "last_error" TEXT,
  "failures" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_idx" ON "push_subscriptions" ("user_id");

-- Claves VAPID del servidor (una sola fila). Se generan solas la primera vez si no están en las variables de
-- entorno VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
CREATE TABLE IF NOT EXISTS "push_vapid_keys" (
  "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "public_key" TEXT NOT NULL,
  "private_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cuándo se mandó cada aviso al móvil (los anteriores a hoy se dan por enviados: nada de avalancha de avisos viejos).
ALTER TABLE "trading_notifications" ADD COLUMN IF NOT EXISTS "pushed_at" TIMESTAMPTZ;
UPDATE "trading_notifications" SET "pushed_at" = now() WHERE "pushed_at" IS NULL;
CREATE INDEX IF NOT EXISTS "trading_notifications_unpushed_idx" ON "trading_notifications" ("created_at") WHERE "pushed_at" IS NULL;
