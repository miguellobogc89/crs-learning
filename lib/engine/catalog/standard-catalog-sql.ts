import { STANDARD_CATALOG_REVISION, STANDARD_RELATIONS, STANDARD_TYPES } from "./standard-catalog";

/**
 * Idempotent SQL that publishes the standard catalog in the global Engine catalog (run once in Neon; re-runnable).
 * - Missing types: created with a published version 1.
 * - Existing types: only the fields they lack are added, in a new published version that clones the previous one;
 *   an existing field with a different type stops the script (nothing is retyped). Workspaces already bound to the
 *   type receive the new optional columns and move to the new version, and so do their records (new revision).
 * - Relations: created when missing; an existing one with other endpoints is reported, never changed.
 * Never changes the values of engine_records nor other catalog types.
 */
export function standardCatalogSql(): string {
  const spec = JSON.stringify({ types: STANDARD_TYPES, relations: STANDARD_RELATIONS });
  if (spec.includes("$spec$")) throw new Error("La especificación no puede contener $spec$");
  const notes = `Catálogo estándar ${STANDARD_CATALOG_REVISION}`;
  return `-- CRS Engine · Standard global catalog ${STANDARD_CATALOG_REVISION}
-- GENERATED from lib/engine/catalog/standard-catalog.ts (npm run engine:standard-catalog-sql). Do not edit by hand.
-- Run in the Neon SQL Editor. Re-runnable: creates missing types and relations, adds missing fields to existing
-- types in a new published version (their records move to it, same values), never renames, retypes or removes anything.
BEGIN;

DO $$
DECLARE
  v_spec jsonb := $spec$${spec}$spec$::jsonb;
  v_notes text := ${sqlString(notes)};
  v_type jsonb; v_rel jsonb; v_missing jsonb;
  v_tid uuid; v_from uuid; v_to uuid;
  v_latest int; v_next int; v_sort int;
  v_existing record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('engine-standard-catalog'));

  FOR v_type IN SELECT value FROM jsonb_array_elements(v_spec->'types') LOOP
    -- Same lock the app takes before binding a catalog type.
    PERFORM pg_advisory_xact_lock(hashtext('engine-catalog-type:' || (v_type->>'key')));
    SELECT id INTO v_tid FROM public.engine_catalog_types WHERE key = v_type->>'key';

    IF v_tid IS NULL THEN
      INSERT INTO public.engine_catalog_types (key, name, description)
        VALUES (v_type->>'key', v_type->>'name', v_type->>'description') RETURNING id INTO v_tid;
      INSERT INTO public.engine_catalog_type_versions (type_id, version, status, notes, published_at)
        VALUES (v_tid, 1, 'published', v_notes, now());
      INSERT INTO public.engine_catalog_fields (type_id, type_version, key, name, field_type, description, is_required, is_unique, sort_order, configuration, status)
        SELECT v_tid, 1, x->>'key', x->>'name', x->>'type', x->>'description',
               COALESCE((x->>'required')::boolean, false), COALESCE((x->>'unique')::boolean, false), (ord::int - 1) * 10, '{}'::jsonb, 'active'
        FROM jsonb_array_elements(v_type->'fields') WITH ORDINALITY AS e(x, ord);
      RAISE NOTICE 'Tipo creado: %', v_type->>'key';
      CONTINUE;
    END IF;

    IF (SELECT status FROM public.engine_catalog_types WHERE id = v_tid) <> 'active' THEN
      RAISE EXCEPTION 'El tipo % existe pero no está activo; revisión manual', v_type->>'key';
    END IF;
    SELECT max(version) INTO v_latest FROM public.engine_catalog_type_versions WHERE type_id = v_tid AND status = 'published';
    IF v_latest IS NULL THEN
      RAISE EXCEPTION 'El tipo % no tiene ninguna versión publicada; revisión manual', v_type->>'key';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_type->'fields') x
      JOIN public.engine_catalog_fields cf ON cf.type_id = v_tid AND cf.type_version = v_latest AND cf.key = x->>'key'
      WHERE cf.field_type <> x->>'type'
    ) THEN
      RAISE EXCEPTION 'El tipo % tiene campos con otro tipo de dato; no se cambia nada', v_type->>'key';
    END IF;

    SELECT jsonb_agg(x ORDER BY ord) INTO v_missing
      FROM jsonb_array_elements(v_type->'fields') WITH ORDINALITY AS e(x, ord)
      WHERE NOT EXISTS (SELECT 1 FROM public.engine_catalog_fields cf WHERE cf.type_id = v_tid AND cf.type_version = v_latest AND cf.key = x->>'key');
    IF v_missing IS NULL THEN
      RAISE NOTICE 'Tipo sin cambios: % (v%)', v_type->>'key', v_latest;
      CONTINUE;
    END IF;

    SELECT max(version) + 1 INTO v_next FROM public.engine_catalog_type_versions WHERE type_id = v_tid;
    SELECT COALESCE(max(sort_order), 0) INTO v_sort FROM public.engine_catalog_fields WHERE type_id = v_tid AND type_version = v_latest;
    INSERT INTO public.engine_catalog_type_versions (type_id, version, status, notes, published_at)
      VALUES (v_tid, v_next, 'published', v_notes, now());
    -- The previous published definition is cloned unchanged, then the missing fields are added (optional).
    INSERT INTO public.engine_catalog_fields (type_id, type_version, key, name, field_type, description, is_required, is_unique, sort_order, configuration, status)
      SELECT type_id, v_next, key, name, field_type, description, is_required, is_unique, sort_order, configuration, status
      FROM public.engine_catalog_fields WHERE type_id = v_tid AND type_version = v_latest;
    INSERT INTO public.engine_catalog_fields (type_id, type_version, key, name, field_type, description, is_required, is_unique, sort_order, configuration, status)
      SELECT v_tid, v_next, x->>'key', x->>'name', x->>'type', x->>'description',
             false, COALESCE((x->>'unique')::boolean, false), v_sort + ord::int * 10, '{}'::jsonb, 'active'
      FROM jsonb_array_elements(v_missing) WITH ORDINALITY AS e(x, ord);

    -- Workspaces already using the type get the new optional columns and move to the new version.
    IF EXISTS (
      SELECT 1 FROM public.engine_workspace_catalog_bindings b
      JOIN public.engine_field_definitions d ON d.workspace_id = b.workspace_id AND d.object_type_id = b.local_object_type_id
      JOIN jsonb_array_elements(v_missing) x ON d.key = x->>'key'
      WHERE b.catalog_type_id = v_tid AND (d.field_type <> x->>'type' OR d.status <> 'active')
    ) THEN
      RAISE EXCEPTION 'Algún espacio de trabajo tiene en % un campo nuevo con otro tipo; revisión manual', v_type->>'key';
    END IF;
    INSERT INTO public.engine_field_definitions (workspace_id, object_type_id, key, name, field_type, is_required, is_unique, sort_order, configuration, status)
      SELECT b.workspace_id, b.local_object_type_id, x->>'key', x->>'name', x->>'type', false, false, v_sort + ord::int * 10, '{}'::jsonb, 'active'
      FROM public.engine_workspace_catalog_bindings b
      CROSS JOIN jsonb_array_elements(v_missing) WITH ORDINALITY AS e(x, ord)
      WHERE b.catalog_type_id = v_tid AND b.local_object_type_id IS NOT NULL AND b.status = 'active'
      ON CONFLICT (object_type_id, key) DO NOTHING;
    UPDATE public.engine_object_types o SET schema_version = o.schema_version + 1, updated_at = now()
      FROM public.engine_workspace_catalog_bindings b
      WHERE b.catalog_type_id = v_tid AND b.local_object_type_id = o.id AND b.status = 'active';
    -- Their records move to that version too (a new revision with the same values: the new fields are optional),
    -- so they stay editable.
    UPDATE public.engine_records r SET schema_version = o.schema_version, revision = r.revision + 1, updated_at = now()
      FROM public.engine_object_types o
      JOIN public.engine_workspace_catalog_bindings b ON b.local_object_type_id = o.id AND b.catalog_type_id = v_tid AND b.status = 'active'
      WHERE r.object_type_id = o.id AND r.schema_version < o.schema_version;
    UPDATE public.engine_workspace_catalog_bindings SET catalog_version = v_next, updated_at = now()
      WHERE catalog_type_id = v_tid AND catalog_version < v_next;
    RAISE NOTICE 'Tipo ampliado: % v% → v% (+% campos)', v_type->>'key', v_latest, v_next, jsonb_array_length(v_missing);
  END LOOP;

  FOR v_rel IN SELECT value FROM jsonb_array_elements(v_spec->'relations') LOOP
    SELECT id INTO v_from FROM public.engine_catalog_types WHERE key = v_rel->>'from';
    SELECT id INTO v_to FROM public.engine_catalog_types WHERE key = v_rel->>'to';
    IF v_from IS NULL OR v_to IS NULL THEN
      RAISE EXCEPTION 'Relación % con un tipo inexistente', v_rel->>'key';
    END IF;
    SELECT * INTO v_existing FROM public.engine_catalog_relations WHERE key = v_rel->>'key' ORDER BY version DESC LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO public.engine_catalog_relations (key, version, name, description, from_type_id, to_type_id, cardinality, status)
        VALUES (v_rel->>'key', 1, v_rel->>'name', v_rel->>'description', v_from, v_to, v_rel->>'cardinality', 'active');
      RAISE NOTICE 'Relación creada: %', v_rel->>'key';
    ELSIF v_existing.from_type_id = v_from AND v_existing.to_type_id = v_to AND v_existing.cardinality = v_rel->>'cardinality' THEN
      RAISE NOTICE 'Relación sin cambios: %', v_rel->>'key';
    ELSE
      RAISE NOTICE 'Relación % ya existe con otra definición: NO se cambia (revisar)', v_rel->>'key';
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Verification (read-only): types, latest published version and fields; relations.
SELECT t.key, v.version, v.notes, count(f.*) AS campos
FROM public.engine_catalog_types t
JOIN LATERAL (SELECT * FROM public.engine_catalog_type_versions v WHERE v.type_id = t.id AND v.status = 'published' ORDER BY v.version DESC LIMIT 1) v ON true
LEFT JOIN public.engine_catalog_fields f ON f.type_id = t.id AND f.type_version = v.version AND f.status = 'active'
GROUP BY t.key, v.version, v.notes ORDER BY t.key;
`;
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
