-- Crussader · Revisión de compras: lo que la persona acepta o corrige de cada línea de compra.
-- Se guarda aparte, nunca encima de lo leído en la factura. Ejecutar UNA vez en el SQL Editor de Neon (se puede repetir).
BEGIN;

CREATE TABLE IF NOT EXISTS public.purchase_line_reviews (
  line_id       uuid PRIMARY KEY REFERENCES public.engine_records(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  review_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by_user_id uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_line_reviews_object CHECK (jsonb_typeof(review_json) = 'object')
);
CREATE INDEX IF NOT EXISTS purchase_line_reviews_workspace ON public.purchase_line_reviews (workspace_id);

COMMIT;
