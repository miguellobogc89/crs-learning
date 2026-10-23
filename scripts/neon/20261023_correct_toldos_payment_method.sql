-- CRS Engine · Correct one identified semantic error in Toldos invoice.
-- Prerequisite: run 20261023_invoice_payment_method_catalog_v2.sql.
-- Keeps every historical revision and original field evidence intact.
-- A new immutable revision records the corrected semantic assignment.
-- Safe to re-run: exits without changes after successful correction.
BEGIN;

DO $$
DECLARE
  original public.engine_records%ROWTYPE;
  corrected public.engine_records%ROWTYPE;
  previous_evidence public.engine_record_provenance%ROWTYPE;
  snapshot public.engine_record_revisions%ROWTYPE;
BEGIN
  SELECT * INTO original
  FROM public.engine_records
  WHERE id = 'ce78ea49-f507-4d22-80fb-1f8ad9309100'::uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target Toldos invoice not found; no changes applied';
  END IF;

  IF original.values_json ->> 'invoice_number' <> '018-2026'
     OR original.values_json ->> 'total_amount' <> '955' THEN
    RAISE EXCEPTION 'Target invoice identity / total differs; no changes applied';
  END IF;

  IF original.values_json ->> 'payment_method' = 'TRANSFERENCIA'
     AND NOT (original.values_json ? 'payment_terms') THEN
    RAISE NOTICE 'Invoice was already corrected; no changes made';
    RETURN;
  END IF;

  IF original.values_json ->> 'payment_terms' <> 'TRANSFERENCIA'
     OR original.values_json ? 'payment_method' THEN
    RAISE EXCEPTION 'Unexpected payment data; manual review required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.engine_field_definitions
    WHERE workspace_id = original.workspace_id
      AND object_type_id = original.object_type_id
      AND key = 'payment_method' AND field_type = 'text' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'The workspace is missing payment_method; apply catalog v2 first';
  END IF;

  SELECT * INTO previous_evidence
  FROM public.engine_record_provenance
  WHERE workspace_id = original.workspace_id
    AND record_id = original.id
    AND field_key = 'payment_terms'
    AND evidence_text = 'TRANSFERENCIA'
  ORDER BY revision DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original document evidence for TRANSFERENCIA is missing';
  END IF;

  UPDATE public.engine_records
  SET
    values_json = (original.values_json - 'payment_terms')
                  || jsonb_build_object('payment_method', 'TRANSFERENCIA'),
    revision = revision + 1,
    updated_at = now()
  WHERE id = original.id
  RETURNING * INTO corrected;

  -- Existing Neon trigger records the snapshot; fallback works without it.
  INSERT INTO public.engine_record_revisions
    (workspace_id, record_id, object_type_id, revision, schema_version,
     status, values_json, changed_by_user_id)
  VALUES
    (corrected.workspace_id, corrected.id, corrected.object_type_id,
     corrected.revision, corrected.schema_version, corrected.status,
     corrected.values_json, corrected.updated_by_user_id)
  ON CONFLICT (record_id, revision) DO NOTHING;

  SELECT * INTO snapshot
  FROM public.engine_record_revisions
  WHERE record_id = corrected.id AND revision = corrected.revision;

  IF NOT FOUND OR snapshot.values_json IS DISTINCT FROM corrected.values_json
     OR snapshot.schema_version IS DISTINCT FROM corrected.schema_version THEN
    RAISE EXCEPTION 'Revision snapshot mismatch; correction rolled back';
  END IF;

  INSERT INTO public.engine_record_provenance
    (workspace_id, record_id, revision, field_key,
     knowledge_source_id, knowledge_file_id, source_locator,
     evidence_text, origin_type, created_by_user_id)
  VALUES
    (corrected.workspace_id, corrected.id, corrected.revision, 'payment_method',
     previous_evidence.knowledge_source_id, previous_evidence.knowledge_file_id,
     'semantic-correction:payment_terms-to-payment_method',
     previous_evidence.evidence_text, 'document',
     previous_evidence.created_by_user_id);

  RAISE NOTICE 'Toldos invoice corrected: revision %', corrected.revision;
END $$;

COMMIT;

-- Verification: the original invoice ID is preserved; revision increments once.
SELECT id, revision, values_json ->> 'invoice_number' AS invoice_number,
       values_json ->> 'payment_method' AS payment_method,
       values_json ->> 'payment_terms' AS payment_terms
FROM public.engine_records
WHERE id = 'ce78ea49-f507-4d22-80fb-1f8ad9309100'::uuid;
