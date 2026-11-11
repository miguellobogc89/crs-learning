-- Kamikazes: por qué no han entrado (o qué hicieron) en la última revisión. Aditiva.
ALTER TABLE "trading_kamikaze_rounds" ADD COLUMN "last_note" TEXT;
ALTER TABLE "trading_kamikaze_rounds" ADD COLUMN "last_note_at" TIMESTAMPTZ(6);
