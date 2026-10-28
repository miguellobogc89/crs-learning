-- CRS · Templates for document types that have no reviewed field set (payslips, rent receipts, tax forms…).
-- Proposed from the workspace's own documents, reviewed by a person; each one creates a workspace table.
-- Run ONCE in the Neon SQL Editor. Re-runnable.
BEGIN;

CREATE TABLE IF NOT EXISTS public.intake_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  familia             text NOT NULL,
  tipo                text NOT NULL,
  subtipo             text,
  nombre              text NOT NULL,
  object_type_key     text NOT NULL,
  definition_json     jsonb NOT NULL,
  version             integer NOT NULL DEFAULT 1,
  status              text NOT NULL DEFAULT 'active',
  created_by_user_id  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intake_templates_status_check CHECK (status IN ('active', 'archived'))
);
-- One active template per document type and workspace.
CREATE UNIQUE INDEX IF NOT EXISTS intake_templates_type_unique ON public.intake_templates (workspace_id, familia, tipo, coalesce(subtipo, '')) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.intake_template_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      uuid NOT NULL REFERENCES public.intake_templates(id) ON DELETE CASCADE,
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  import_file_id   uuid NOT NULL REFERENCES public.knowledge_import_files(id) ON DELETE CASCADE,
  status           text NOT NULL,
  records          integer NOT NULL DEFAULT 0,
  template_version integer NOT NULL DEFAULT 1,
  detail_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  error            text,
  processed_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  processed_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intake_template_documents_status_check CHECK (status IN ('completed', 'error', 'ignored')),
  CONSTRAINT intake_template_documents_unique UNIQUE (template_id, import_file_id)
);

COMMIT;

SELECT 'intake_templates' AS tabla, count(*) FROM public.intake_templates
UNION ALL SELECT 'intake_template_documents', count(*) FROM public.intake_template_documents;
