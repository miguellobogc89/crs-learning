-- CRS Engine 005: universal, workspace-scoped relationship definitions.
-- Applies to existing Engine object types; no industry-specific tables.
-- Run in the designated Neon development branch after review.
BEGIN;

CREATE TABLE engine_relation_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  from_object_type_id uuid NOT NULL,
  to_object_type_id uuid NOT NULL,
  cardinality text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_relation_definitions_workspace_key_unique UNIQUE (workspace_id, key),
  CONSTRAINT engine_relation_definitions_workspace_id_unique UNIQUE (workspace_id, id),
  CONSTRAINT engine_relation_definitions_from_fk FOREIGN KEY (workspace_id, from_object_type_id)
    REFERENCES engine_object_types(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT engine_relation_definitions_to_fk FOREIGN KEY (workspace_id, to_object_type_id)
    REFERENCES engine_object_types(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT engine_relation_definitions_cardinality_check
    CHECK (cardinality IN ('one_to_one', 'one_to_many', 'many_to_many')),
  CONSTRAINT engine_relation_definitions_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT engine_relation_definitions_key_check
    CHECK (key ~ '^[a-z][a-z0-9_]*$' AND length(key) <= 80),
  CONSTRAINT engine_relation_definitions_name_check
    CHECK (length(trim(name)) BETWEEN 1 AND 160)
);

CREATE INDEX engine_relation_definitions_from_idx
  ON engine_relation_definitions(workspace_id, from_object_type_id);
CREATE INDEX engine_relation_definitions_to_idx
  ON engine_relation_definitions(workspace_id, to_object_type_id);

COMMIT;
