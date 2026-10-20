-- CRS Data Engine / microfase 1.1
-- Ejecutar una sola vez en Neon (SQL Editor), sobre la BD de desarrollo.
-- No altera ni elimina tablas existentes.
-- Los valores de los registros se almacenan en JSONB; su validación tipada
-- se implementará en los servicios antes de habilitar escrituras.

BEGIN;

CREATE TABLE IF NOT EXISTS engine_object_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  schema_version integer NOT NULL DEFAULT 1,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_object_types_key_format CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT engine_object_types_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT engine_object_types_version_check CHECK (schema_version > 0),
  CONSTRAINT engine_object_types_settings_object CHECK (jsonb_typeof(settings) = 'object'),
  CONSTRAINT engine_object_types_org_key_unique UNIQUE (organization_id, key),
  CONSTRAINT engine_object_types_org_id_unique UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS engine_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  object_type_id uuid NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  field_type text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  is_unique boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_fields_object_fk FOREIGN KEY (organization_id, object_type_id)
    REFERENCES engine_object_types (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT engine_fields_key_format CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT engine_fields_type_check CHECK (field_type IN (
    'text', 'long_text', 'integer', 'decimal', 'boolean', 'date',
    'datetime', 'enum', 'entity_reference', 'record_reference', 'json'
  )),
  CONSTRAINT engine_fields_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT engine_fields_configuration_object CHECK (jsonb_typeof(configuration) = 'object'),
  CONSTRAINT engine_fields_object_key_unique UNIQUE (object_type_id, key)
);

CREATE TABLE IF NOT EXISTS engine_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  object_type_id uuid NOT NULL,
  external_key text,
  status text NOT NULL DEFAULT 'draft',
  values_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version integer NOT NULL DEFAULT 1,
  revision integer NOT NULL DEFAULT 1,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_records_object_fk FOREIGN KEY (organization_id, object_type_id)
    REFERENCES engine_object_types (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT engine_records_status_check CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT engine_records_values_object CHECK (jsonb_typeof(values_json) = 'object'),
  CONSTRAINT engine_records_version_check CHECK (schema_version > 0 AND revision > 0),
  CONSTRAINT engine_records_org_id_unique UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS engine_records_external_key_unique
  ON engine_records (object_type_id, external_key)
  WHERE external_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS engine_records_org_type_status_idx
  ON engine_records (organization_id, object_type_id, status);
CREATE INDEX IF NOT EXISTS engine_records_org_created_idx
  ON engine_records (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS engine_records_values_gin_idx
  ON engine_records USING gin (values_json);
CREATE INDEX IF NOT EXISTS engine_fields_org_object_idx
  ON engine_field_definitions (organization_id, object_type_id, sort_order);

COMMIT;
