export type ImportDecision = "APPLY" | "PENDING_REVIEW" | "BLOCKED";
export type ImportConflict = {
  code: string;
  scope: "document" | "entity" | "record" | "relation";
  subject: string;
  reason: string;
  proposedAction: string;
};
export type ImportPreflight = {
  decision: ImportDecision;
  conflicts: ImportConflict[];
  safeToWrite: boolean;
};

/**
 * Deterministic, provider-independent gate before any schema or record writes.
 * A partial document cannot be treated as a complete import: its missing
 * records and links are unknown. Keep the whole operation read-only until
 * complete extraction exists.
 */
export function planImportPreflight(input: {
  documentId: string;
  truncated: boolean;
  schemaValid: boolean;
  schemaIssues?: readonly string[];
  auditErrors?: readonly string[];
}): ImportPreflight {
  const conflicts: ImportConflict[] = [];
  if (input.truncated) {
    conflicts.push({
      code: "INCOMPLETE_DOCUMENT",
      scope: "document",
      subject: input.documentId,
      reason: "Document extraction did not cover the complete source.",
      proposedAction: "Reprocess the full document before persisting any data.",
    });
  }
  if (!input.schemaValid) {
    conflicts.push({
      code: "INVALID_SCHEMA",
      scope: "document",
      subject: input.documentId,
      reason: (input.schemaIssues ?? []).join("; ") || "Schema discovery failed validation.",
      proposedAction: "Review the discovered schema and retry import.",
    });
  }
  if (input.auditErrors?.length) {
    conflicts.push({
      code: "INVALID_RECORD_GRAPH",
      scope: "document",
      subject: input.documentId,
      reason: input.auditErrors.join("; "),
      proposedAction: "Repair record references or relationship definitions before import.",
    });
  }
  return {
    decision: conflicts.length ? "PENDING_REVIEW" : "APPLY",
    conflicts,
    safeToWrite: conflicts.length === 0,
  };
}
