-- CRS Engine 006: evidence-backed relation proposals between concrete records.
-- REVIEW ONLY: this migration does not create approved relations.
-- Apply manually to the designated Neon development branch after review.
-- Requires 003_workspace_scope.sql and 005_relation_definitions.sql.
BEGIN;

CREATE TABLE engine_relation_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  relation_definition_id uuid NOT NULL,
  from_record_id uuid NOT NULL,
  to_record_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES knowledge_files(id) ON DELETE RESTRICT,
  evidence_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review',
  proposed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_relation_proposals_definition_fk
    FOREIGN KEY (workspace_id, relation_definition_id)
    REFERENCES engine_relation_definitions(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT engine_relation_proposals_from_fk
    FOREIGN KEY (workspace_id, from_record_id)
    REFERENCES engine_records(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT engine_relation_proposals_to_fk
    FOREIGN KEY (workspace_id, to_record_id)
    REFERENCES engine_records(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT engine_relation_proposals_distinct_records
    CHECK (from_record_id <> to_record_id),
  CONSTRAINT engine_relation_proposals_evidence
    CHECK (length(trim(evidence_text)) BETWEEN 1 AND 4000),
  CONSTRAINT engine_relation_proposals_status
    CHECK (status IN ('pending_review', 'rejected')),
  CONSTRAINT engine_relation_proposals_review_consistency
    CHECK (
      (status = 'pending_review' AND reviewed_at IS NULL AND reviewed_by_user_id IS NULL)
      OR
      (status = 'rejected' AND reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL)
    ),
  CONSTRAINT engine_relation_proposals_unique_evidence
    UNIQUE (workspace_id, relation_definition_id, from_record_id,
            to_record_id, document_id, evidence_text)
);

CREATE INDEX engine_relation_proposals_pending_idx
  ON engine_relation_proposals(workspace_id, status, created_at DESC);
CREATE INDEX engine_relation_proposals_from_idx
  ON engine_relation_proposals(workspace_id, from_record_id);
CREATE INDEX engine_relation_proposals_to_idx
  ON engine_relation_proposals(workspace_id, to_record_id);

-- A proposal's types must agree with the selected definition.
-- The document FK proves existence only. The application must validate\n-- source workspace, reader authorization, ready status, and exact quote.\n-- A shared document does NOT itself prove that a relationship exists.\n-- Cardinality is deliberately not enforced here: approved links need\n-- a separate transactional write path with concurrency protection.
CREATE FUNCTION engine_validate_relation_proposal_types()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_from uuid;
  expected_to uuid;
  actual_from uuid;
  actual_to uuid;
BEGIN
  SELECT from_object_type_id, to_object_type_id
    INTO expected_from, expected_to
    FROM engine_relation_definitions
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.relation_definition_id AND status = 'active';
  IF expected_from IS NULL THEN
    RAISE EXCEPTION 'Relation definition must be active in workspace';
  END IF;
  SELECT object_type_id INTO actual_from FROM engine_records
    WHERE workspace_id = NEW.workspace_id AND id = NEW.from_record_id
      AND status <> 'archived';
  SELECT object_type_id INTO actual_to FROM engine_records
    WHERE workspace_id = NEW.workspace_id AND id = NEW.to_record_id
      AND status <> 'archived';
  IF actual_from IS DISTINCT FROM expected_from OR actual_to IS DISTINCT FROM expected_to THEN
    RAISE EXCEPTION 'Relation endpoint types do not match active definition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER engine_relation_proposal_types
BEFORE INSERT OR UPDATE OF relation_definition_id, from_record_id, to_record_id
ON engine_relation_proposals
FOR EACH ROW EXECUTE FUNCTION engine_validate_relation_proposal_types();

COMMIT;
