-- CRS Data Engine 003: workspace-first scope.
-- PRECONDITION: all five engine tables are empty. This migration refuses to
-- run otherwise. Execute in Neon development branch only.
BEGIN;

DO $$
DECLARE n bigint;
BEGIN
  SELECT SUM(cnt) INTO n FROM (
    SELECT count(*) cnt FROM engine_object_types UNION ALL
    SELECT count(*) FROM engine_field_definitions UNION ALL
    SELECT count(*) FROM engine_records UNION ALL
    SELECT count(*) FROM engine_record_revisions UNION ALL
    SELECT count(*) FROM engine_record_provenance
  ) counts;
  IF n <> 0 THEN
    RAISE EXCEPTION 'Workspace migration requires empty engine tables; found % rows', n;
  END IF;
END $$;

-- Remove composite organization-scoped FKs/uniques in dependency order,
-- including the implicit organization FK on engine_object_types.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE conrelid IN (
      'engine_object_types'::regclass, 'engine_field_definitions'::regclass,
      'engine_records'::regclass, 'engine_record_revisions'::regclass,
      'engine_record_provenance'::regclass
    )
    AND EXISTS (
      SELECT 1 FROM unnest(conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k.attnum
      WHERE a.attname = 'organization_id'
    )
    ORDER BY CASE conrelid::regclass::text
      WHEN 'engine_record_provenance' THEN 1
      WHEN 'engine_record_revisions' THEN 2
      WHEN 'engine_records' THEN 3
      WHEN 'engine_field_definitions' THEN 4 ELSE 5 END
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.table_name, c.conname);
  END LOOP;
END $$;

ALTER TABLE engine_object_types
  DROP COLUMN organization_id,
  ADD COLUMN workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE engine_field_definitions
  DROP COLUMN organization_id,
  ADD COLUMN workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE engine_records
  DROP COLUMN organization_id,
  ADD COLUMN workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE engine_record_revisions
  DROP COLUMN organization_id,
  ADD COLUMN workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE engine_record_provenance
  DROP COLUMN organization_id,
  ADD COLUMN workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT;

ALTER TABLE engine_object_types
  ADD CONSTRAINT engine_object_types_workspace_id_unique UNIQUE (workspace_id, id),
  ADD CONSTRAINT engine_object_types_workspace_key_unique UNIQUE (workspace_id, key);
ALTER TABLE engine_field_definitions
  ADD CONSTRAINT engine_fields_object_fk FOREIGN KEY (workspace_id, object_type_id)
    REFERENCES engine_object_types(workspace_id, id) ON DELETE CASCADE;
ALTER TABLE engine_records
  ADD CONSTRAINT engine_records_object_fk FOREIGN KEY (workspace_id, object_type_id)
    REFERENCES engine_object_types(workspace_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT engine_records_workspace_id_unique UNIQUE (workspace_id, id);
ALTER TABLE engine_record_revisions
  ADD CONSTRAINT engine_revision_record_fk FOREIGN KEY (workspace_id, record_id)
    REFERENCES engine_records(workspace_id, id) ON DELETE RESTRICT;
ALTER TABLE engine_record_provenance
  ADD CONSTRAINT engine_provenance_record_fk FOREIGN KEY (workspace_id, record_id)
    REFERENCES engine_records(workspace_id, id) ON DELETE RESTRICT;

DROP INDEX IF EXISTS engine_fields_org_object_idx;
DROP INDEX IF EXISTS engine_records_org_type_status_idx;
DROP INDEX IF EXISTS engine_records_org_created_idx;
DROP INDEX IF EXISTS engine_revision_org_record_idx;
DROP INDEX IF EXISTS engine_provenance_record_idx;
CREATE INDEX engine_fields_workspace_object_idx
  ON engine_field_definitions(workspace_id, object_type_id, sort_order);
CREATE INDEX engine_records_workspace_type_status_idx
  ON engine_records(workspace_id, object_type_id, status);
CREATE INDEX engine_records_workspace_created_idx
  ON engine_records(workspace_id, created_at DESC);
CREATE INDEX engine_revision_workspace_record_idx
  ON engine_record_revisions(workspace_id, record_id, revision DESC);
CREATE INDEX engine_provenance_workspace_record_idx
  ON engine_record_provenance(workspace_id, record_id, revision);

-- The revision trigger must capture the new scope and continue enforcing
-- immutable record identity and sequential snapshots.
CREATE OR REPLACE FUNCTION engine_capture_record_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.object_type_id IS DISTINCT FROM OLD.object_type_id
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
      RAISE EXCEPTION 'Engine record identity is immutable';
    END IF;
    IF NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'Engine record revision must increase by exactly one';
    END IF;
  ELSIF NEW.revision <> 1 THEN
    RAISE EXCEPTION 'New engine records must start at revision 1';
  END IF;
  INSERT INTO engine_record_revisions (
    workspace_id, record_id, object_type_id, revision, schema_version,
    status, values_json, changed_by_user_id
  ) VALUES (
    NEW.workspace_id, NEW.id, NEW.object_type_id, NEW.revision, NEW.schema_version,
    NEW.status, NEW.values_json, NEW.updated_by_user_id
  );
  RETURN NEW;
END;
$$;

COMMIT;
