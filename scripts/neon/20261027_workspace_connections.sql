-- CRS · Connectors: one connection per workspace and provider (Google Drive first).
-- Run ONCE in the Neon SQL Editor. Re-runnable. Tokens are stored ENCRYPTED by the app (AES-256-GCM,
-- CONNECTORS_ENCRYPTION_KEY); the database never sees them in clear.
BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_connections (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider                  text NOT NULL,
  status                    text NOT NULL DEFAULT 'active',
  account_email             text,
  account_name              text,
  scopes                    text,
  refresh_token_enc         text,
  access_token_enc          text,
  access_token_expires_at   timestamptz,
  settings_json             jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error                text,
  connected_by_user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_connections_provider_check CHECK (provider IN ('google_drive')),
  CONSTRAINT workspace_connections_status_check CHECK (status IN ('active', 'error')),
  CONSTRAINT workspace_connections_unique UNIQUE (workspace_id, provider)
);

COMMIT;

-- Verification (read-only)
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'workspace_connections' ORDER BY ordinal_position;
