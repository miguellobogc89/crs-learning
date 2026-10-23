-- CRS Engine · Factura catalog v2
-- Run ONCE in Neon SQL Editor before using the updated importer.
-- Re-runnable: all inserts/upgrades are idempotent.
-- Changes only catalog metadata, workspace field definitions and catalog bindings.
-- It never modifies engine_records or their history.
BEGIN;

DO $$
DECLARE
  invoice_type_id uuid;
BEGIN
  SELECT id INTO invoice_type_id
    FROM public.engine_catalog_types
    WHERE key = 'invoice' AND status = 'active'
    FOR UPDATE;

  IF invoice_type_id IS NULL THEN
    RAISE EXCEPTION 'Missing active invoice catalog type';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.engine_catalog_type_versions
    WHERE type_id = invoice_type_id AND version = 1 AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'Invoice catalog v1 must be published before creating v2';
  END IF;

  -- Do not silently overwrite another, unrelated v2.
  IF EXISTS (
    SELECT 1 FROM public.engine_catalog_type_versions
    WHERE type_id = invoice_type_id AND version = 2
      AND COALESCE(notes, '') <> 'Invoice payment_method: distinguish payment channel from payment terms'
  ) THEN
    RAISE EXCEPTION 'Invoice catalog v2 already exists with a different definition';
  END IF;

  INSERT INTO public.engine_catalog_type_versions
    (type_id, version, status, notes, published_at)
  VALUES
    (invoice_type_id, 2, 'published',
     'Invoice payment_method: distinguish payment channel from payment terms',
     now())
  ON CONFLICT (type_id, version) DO NOTHING;

  -- Clone the published v1 definition without mutating it.
  INSERT INTO public.engine_catalog_fields
    (type_id, type_version, key, name, field_type, description,
     is_required, is_unique, sort_order, configuration, status)
  SELECT
    type_id, 2, key, name, field_type, description,
    is_required, is_unique, sort_order, configuration, status
  FROM public.engine_catalog_fields
  WHERE type_id = invoice_type_id AND type_version = 1
  ON CONFLICT (type_id, type_version, key) DO NOTHING;

  UPDATE public.engine_catalog_fields
  SET description =
    'Condiciones o plazo de pago (por ejemplo, al contado, vencimiento a 30 días). '
    || 'No incluir el medio utilizado: transferencia, tarjeta, efectivo o domiciliación.'
  WHERE type_id = invoice_type_id AND type_version = 2
    AND key = 'payment_terms';

  INSERT INTO public.engine_catalog_fields
    (type_id, type_version, key, name, field_type, description,
     is_required, is_unique, sort_order, configuration, status)
  SELECT
    invoice_type_id, 2, 'payment_method', 'Forma de pago', 'text',
    'Medio de pago identificado en la factura: transferencia, tarjeta, efectivo, '
    || 'domiciliación, etc. No indica el plazo de vencimiento.',
    false, false, COALESCE(MAX(sort_order), 0) + 10,
    '{}'::jsonb, 'active'
  FROM public.engine_catalog_fields
  WHERE type_id = invoice_type_id AND type_version = 1
  ON CONFLICT (type_id, type_version, key) DO NOTHING;

  -- Only a compatible optional text column may be introduced automatically.
  IF EXISTS (
    SELECT 1
    FROM public.engine_workspace_catalog_bindings b
    JOIN public.engine_field_definitions f
      ON f.workspace_id = b.workspace_id
     AND f.object_type_id = b.local_object_type_id
     AND f.key = 'payment_method'
    WHERE b.catalog_type_id = invoice_type_id
      AND (f.field_type <> 'text' OR f.status <> 'active')
  ) THEN
    RAISE EXCEPTION 'Existing payment_method field is incompatible; manual review required';
  END IF;

  INSERT INTO public.engine_field_definitions
    (workspace_id, object_type_id, key, name, field_type,
     is_required, is_unique, sort_order, configuration, status)
  SELECT
    b.workspace_id, b.local_object_type_id,
    'payment_method', 'Forma de pago', 'text',
    false, false, f.sort_order, '{}'::jsonb, 'active'
  FROM public.engine_workspace_catalog_bindings b
  JOIN public.engine_catalog_fields f
    ON f.type_id = b.catalog_type_id
   AND f.type_version = 2
   AND f.key = 'payment_method'
  WHERE b.catalog_type_id = invoice_type_id
    AND b.local_object_type_id IS NOT NULL
  ON CONFLICT (object_type_id, key) DO NOTHING;

  -- v1 -> v2 only; do not downgrade a workspace at a newer version.
  UPDATE public.engine_workspace_catalog_bindings
  SET catalog_version = 2, updated_at = now()
  WHERE catalog_type_id = invoice_type_id
    AND catalog_version = 1;
END $$;

COMMIT;

-- Verification (read-only):
SELECT v.version, v.status, f.key, f.field_type, f.description
FROM public.engine_catalog_types t
JOIN public.engine_catalog_type_versions v ON v.type_id = t.id
JOIN public.engine_catalog_fields f
  ON f.type_id = v.type_id AND f.type_version = v.version
WHERE t.key = 'invoice' AND v.version = 2
  AND f.key IN ('payment_method', 'payment_terms')
ORDER BY f.key;
