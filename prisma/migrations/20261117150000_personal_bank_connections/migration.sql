-- CRS Finance: consentimientos bancarios privados y aislados por usuario.
CREATE TABLE IF NOT EXISTS "personal_bank_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "bank" TEXT NOT NULL,
  "institution_name" TEXT NOT NULL,
  "session_id_enc" TEXT NOT NULL,
  "account_ids_enc" TEXT NOT NULL,
  "consent_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "personal_bank_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_bank_connections_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "personal_bank_connections_user_id_bank_key" UNIQUE ("user_id", "bank")
);
CREATE INDEX IF NOT EXISTS "personal_bank_connections_user_id_idx"
  ON "personal_bank_connections"("user_id");
