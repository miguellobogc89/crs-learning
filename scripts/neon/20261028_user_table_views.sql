-- CRS · How each person likes to see each table in Analítica (visible columns, grouping, order, rows per page).
-- Run ONCE in the Neon SQL Editor. Re-runnable.
BEGIN;

CREATE TABLE IF NOT EXISTS public.user_table_views (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  table_key      text NOT NULL,
  settings_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_table_views_unique UNIQUE (user_id, workspace_id, table_key)
);

COMMIT;
