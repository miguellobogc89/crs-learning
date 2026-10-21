-- Approved record-level relations are separate from pending AI proposals.
-- Apply only to an isolated test database before any production migration.
CREATE TABLE IF NOT EXISTS "engine_record_relations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "relation_definition_id" UUID NOT NULL,
  "from_record_id" UUID NOT NULL,
  "to_record_id" UUID NOT NULL,
  "source_proposal_id" UUID,
  "reviewed_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "engine_record_relations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "engine_record_relations_distinct_endpoints" CHECK ("from_record_id" <> "to_record_id"),
  CONSTRAINT "engine_record_relations_definition_fk" FOREIGN KEY ("workspace_id", "relation_definition_id") REFERENCES "engine_relation_definitions"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "engine_record_relations_from_fk" FOREIGN KEY ("workspace_id", "from_record_id") REFERENCES "engine_records"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "engine_record_relations_to_fk" FOREIGN KEY ("workspace_id", "to_record_id") REFERENCES "engine_records"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "engine_record_relations_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  CONSTRAINT "engine_record_relations_reviewer_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "engine_record_relations_proposal_fk" FOREIGN KEY ("source_proposal_id") REFERENCES "engine_relation_proposals"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "engine_record_relations_unique_pair" ON "engine_record_relations"("workspace_id", "relation_definition_id", "from_record_id", "to_record_id");
CREATE UNIQUE INDEX IF NOT EXISTS "engine_record_relations_source_proposal_id_key" ON "engine_record_relations"("source_proposal_id");
CREATE INDEX IF NOT EXISTS "engine_record_relations_from_idx" ON "engine_record_relations"("workspace_id", "from_record_id");
CREATE INDEX IF NOT EXISTS "engine_record_relations_to_idx" ON "engine_record_relations"("workspace_id", "to_record_id");

-- Serializes all relation approvals within one workspace, even from multiple app instances.
-- This is essential because cardinality checks read other approved relations.
