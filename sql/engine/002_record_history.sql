-- CRS Data Engine / microfase 1.5: historial inmutable de registros
-- Ejecutar una sola vez en Neon DESPUES de 001_core.sql.
-- Migracion aditiva: no elimina ni modifica datos existentes.

BEGIN;

CREATE TABLE IF NOT EXISTS engine_record_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  record_id uuid NOT NULL,
  object_type_id uuid NOT NULL,
  revision integer NOT NULL,
  schema_version integer NOT NULL,
  status text NOT NULL,
  values_json jsonb NOT NULL,
  changed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_revision_record_fk FOREIGN KEY (organization_id, record_id)
    REFERENCES engine_records (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT engine_revision_positive CHECK (revision > 0 AND schema_version > 0),
  CONSTRAINT engine_revision_values_object CHECK (jsonb_typeof(values_json) = 'object'),
  CONSTRAINT engine_revision_unique UNIQUE (record_id, revision)
);

CREATE INDEX IF NOT EXISTS engine_revision_org_record_idx
  ON engine_record_revisions (organization_id, record_id, revision DESC);

CREATE OR REPLACE FUNCTION engine_capture_record_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
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
    organization_id, record_id, object_type_id, revision, schema_version,
    status, values_json, changed_by_user_id
  ) VALUES (
    NEW.organization_id, NEW.id, NEW.object_type_id, NEW.revision, NEW.schema_version,
    NEW.status, NEW.values_json, NEW.updated_by_user_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_record_revision_capture ON engine_records;
CREATE TRIGGER engine_record_revision_capture
AFTER INSERT OR UPDATE ON engine_records
FOR EACH ROW EXECUTE FUNCTION engine_capture_record_revision();

-- Backfill de registros previos (si existen); no genera duplicados.
INSERT INTO engine_record_revisions (
  organization_id, record_id, object_type_id, revision, schema_version,
  status, values_json, changed_by_user_id, recorded_at
)
SELECT r.organization_id, r.id, r.object_type_id, r.revision, r.schema_version,
       r.status, r.values_json, r.updated_by_user_id, r.updated_at
FROM engine_records r
ON CONFLICT (record_id, revision) DO NOTHING;

-- Impedir modificaciones o eliminaciones del historial por operaciones ordinarias.
CREATE OR REPLACE FUNCTION engine_prevent_revision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Engine record revision history is immutable';
END;
$$;

DROP TRIGGER IF EXISTS engine_revision_immutable ON engine_record_revisions;
CREATE TRIGGER engine_revision_immutable
BEFORE UPDATE OR DELETE ON engine_record_revisions
FOR EACH ROW EXECUTE FUNCTION engine_prevent_revision_mutation();

COMMIT;
