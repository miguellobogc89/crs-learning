-- CRS · Preferences per workspace (e.g. the example questions the assistant shows when it opens).
-- Run ONCE in the Neon SQL Editor. Re-runnable.
BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_preferences (
  workspace_id   uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  settings_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_preferences_settings_object CHECK (jsonb_typeof(settings_json) = 'object')
);

COMMIT;
