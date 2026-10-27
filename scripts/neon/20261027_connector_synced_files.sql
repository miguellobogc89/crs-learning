-- CRS · Connectors: what happened to each external file (Drive) so a sync never brings it twice.
-- Run ONCE in the Neon SQL Editor AFTER 20261027_workspace_connections.sql. Re-runnable.
BEGIN;

CREATE TABLE IF NOT EXISTS public.connector_synced_files (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider         text NOT NULL,
  external_id      text NOT NULL,
  external_name    text NOT NULL,
  external_md5     text,
  external_modified_at timestamptz,
  content_hash     text,
  outcome          text NOT NULL,
  detail           text,
  import_id        uuid REFERENCES public.knowledge_imports(id) ON DELETE SET NULL,
  import_file_id   uuid REFERENCES public.knowledge_import_files(id) ON DELETE SET NULL,
  synced_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connector_synced_files_outcome_check CHECK (outcome IN ('importado', 'duplicado', 'omitido')),
  CONSTRAINT connector_synced_files_unique UNIQUE (workspace_id, provider, external_id)
);
CREATE INDEX IF NOT EXISTS connector_synced_files_hash_idx ON public.connector_synced_files (workspace_id, content_hash) WHERE content_hash IS NOT NULL;

COMMIT;

SELECT outcome, count(*) FROM public.connector_synced_files GROUP BY 1;
