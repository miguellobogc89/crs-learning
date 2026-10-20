-- CRS Engine: workspace-scoped, unresolved factual alternatives.
-- Apply in a controlled migration before enabling conflict persistence.
-- Never overwrites engine_records values or chooses a winning alternative.
CREATE TABLE IF NOT EXISTS engine_value_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  subject text NOT NULL,
  attribute text NOT NULL,
  context text NOT NULL DEFAULT '',
  alternatives_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending_review',
  scope text NOT NULL DEFAULT 'affected_value_only',
  detected_by text NOT NULL DEFAULT 'ai',
  resolved_value text,
  resolution_note text,
  resolved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_value_conflicts_status_check
    CHECK (status IN ('pending_review', 'resolved', 'dismissed')),
  CONSTRAINT engine_value_conflicts_scope_check
    CHECK (scope = 'affected_value_only'),
  CONSTRAINT engine_value_conflicts_alternatives_check
    CHECK (jsonb_typeof(alternatives_json) = 'array' AND jsonb_array_length(alternatives_json) >= 2),
  CONSTRAINT engine_value_conflicts_resolution_check
    CHECK (status <> 'resolved' OR (resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS engine_value_conflicts_workspace_fingerprint_idx
  ON engine_value_conflicts (workspace_id, fingerprint);
CREATE INDEX IF NOT EXISTS engine_value_conflicts_workspace_status_idx
  ON engine_value_conflicts (workspace_id, status, created_at DESC);
