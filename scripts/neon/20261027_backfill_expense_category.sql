-- CRS Engine · Expense category of invoices already saved by the intake pipeline (for analytics)
-- Run ONCE in the Neon SQL Editor AFTER 20261027_standard_catalog.sql (catalog 2026-10-27.4). Re-runnable.
-- Fills invoice.expense_category / expense_subcategory from the classification stored with each import, only on
-- invoices that do not have it yet. Each change is a new record revision; nothing else is modified.
BEGIN;

WITH saved AS (
  SELECT k.id AS batch_id, reg->>'registroId' AS record_id, reg->>'ref' AS ref, k.proposal_json AS p
  FROM public.knowledge_imports k
  CROSS JOIN LATERAL jsonb_array_elements(k.proposal_json->'escritura'->'resultado'->'registros') reg
  WHERE k.proposal_json->'escritura'->>'status' = 'completed' AND reg->>'tipo' = 'invoice' AND reg->>'accion' = 'creado'
), located AS (
  SELECT s.record_id, m->>'archivoId' AS file_id, m->>'parteId' AS part_id, s.p
  FROM saved s
  CROSS JOIN LATERAL jsonb_array_elements(s.p->'conciliacion'->'resultado'->'entidades') e
  CROSS JOIN LATERAL (SELECT e->'menciones'->0 AS m) first
  WHERE e->>'ref' = s.ref
), classified AS (
  SELECT l.record_id, part->>'subtipo' AS subtipo
  FROM located l
  CROSS JOIN LATERAL jsonb_array_elements(l.p->'clasificacion'->'resultado'->'archivos') f
  CROSS JOIN LATERAL jsonb_array_elements(f->'partes') part
  WHERE f->>'archivoId' = l.file_id AND part->>'id' = l.part_id
), mapped AS (
  SELECT record_id::uuid AS id,
    CASE subtipo WHEN 'suministro_electricidad' THEN 'suministros' WHEN 'suministro_gas' THEN 'suministros' WHEN 'suministro_agua' THEN 'suministros'
      WHEN 'telecomunicaciones' THEN 'suministros' WHEN 'compra_articulos' THEN 'compras' WHEN 'factura_simplificada' THEN 'compras'
      WHEN 'servicios_profesionales' THEN 'servicios' WHEN 'alquiler' THEN 'alquiler' WHEN 'rectificativa_abono' THEN 'rectificativas' ELSE 'otros' END AS category,
    CASE subtipo WHEN 'suministro_electricidad' THEN 'electricidad' WHEN 'suministro_gas' THEN 'gas' WHEN 'suministro_agua' THEN 'agua'
      WHEN 'factura_simplificada' THEN 'ticket' ELSE COALESCE(subtipo, 'sin_subtipo') END AS subcategory
  FROM classified
), updated AS (
  UPDATE public.engine_records r
  SET values_json = r.values_json || jsonb_build_object('expense_category', m.category, 'expense_subcategory', m.subcategory),
      revision = r.revision + 1, updated_at = now()
  FROM mapped m
  WHERE r.id = m.id AND NOT (r.values_json ? 'expense_category')
  RETURNING r.*
)
INSERT INTO public.engine_record_revisions (workspace_id, record_id, object_type_id, revision, schema_version, status, values_json, changed_by_user_id)
SELECT workspace_id, id, object_type_id, revision, schema_version, status, values_json, updated_by_user_id FROM updated
ON CONFLICT (record_id, revision) DO NOTHING;

COMMIT;

-- Verification (read-only)
SELECT values_json->>'invoice_number' AS factura, values_json->>'expense_category' AS categoria, values_json->>'expense_subcategory' AS subcategoria
FROM public.engine_records r JOIN public.engine_object_types t ON t.id = r.object_type_id AND t.key = 'invoice'
WHERE r.status <> 'archived' ORDER BY values_json->>'issue_date';
