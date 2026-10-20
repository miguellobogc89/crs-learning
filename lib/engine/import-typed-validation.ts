import { validateEngineRecordValues, type EngineFieldDefinition } from "./validation";
import {
  preflightEngineImportCandidates,
  type EngineImportCandidate,
  type EngineImportCandidateIssue,
  type EngineImportDocument,
} from "./import-preflight";

/**
 * Pure second-stage validation. Definitions must be loaded for the requested
 * workspace by an authorized caller; this is not a permissions check.
 * No AI calls, DB reads, or writes happen here.
 */
export type EngineImportObjectDefinition = {
  id: string;
  workspaceId: string;
  status: string;
  fields: readonly (EngineFieldDefinition & { is_unique?: boolean })[];
};

export type EngineTypedImportIssue = {
  index: number;
  code: EngineImportCandidateIssue["code"] |
    "OBJECT_TYPE_NOT_FOUND" | "OBJECT_TYPE_INACTIVE" |
    "UNSUPPORTED_FIELD" | "INVALID_VALUES";
  field?: string;
  message?: string;
};

export function validateTypedEngineImport(input: {
  workspaceId: string;
  documents: readonly EngineImportDocument[];
  candidates: readonly EngineImportCandidate[];
  definitions: readonly EngineImportObjectDefinition[];
}): { accepted: EngineImportCandidate[]; issues: EngineTypedImportIssue[] } {
  const preflight = preflightEngineImportCandidates(input);
  const issues: EngineTypedImportIssue[] = [...preflight.issues];
  const accepted: EngineImportCandidate[] = [];
  const definitions = new Map(input.definitions
    .filter((definition) => definition.workspaceId === input.workspaceId)
    .map((definition) => [definition.id, definition]));
  const indices = new Map(input.candidates.map((candidate, index) => [candidate, index]));

  for (const candidate of preflight.accepted) {
    const index = indices.get(candidate)!;
    const definition = definitions.get(candidate.objectTypeId);
    if (!definition) {
      issues.push({ index, code: "OBJECT_TYPE_NOT_FOUND" });
      continue;
    }
    if (definition.status !== "active") {
      issues.push({ index, code: "OBJECT_TYPE_INACTIVE" });
      continue;
    }
    const field = definition.fields.find((item) =>
      item.key === candidate.fieldKey && item.status === "active");
    if (!field) {
      issues.push({ index, code: "INVALID_FIELD", field: candidate.fieldKey });
      continue;
    }
    // The draft record service cannot persist unique or reference fields yet.
    if (definition.fields.some((item) => item.status === "active" &&
      (item.is_unique || item.field_type === "entity_reference" ||
        item.field_type === "record_reference"))) {
      issues.push({ index, code: "UNSUPPORTED_FIELD" });
      continue;
    }
    const validation = validateEngineRecordValues(candidate.values, definition.fields);
    if (!validation.ok) {
      for (const issue of validation.issues) {
        issues.push({
          index, code: "INVALID_VALUES", field: issue.field,
          message: issue.message,
        });
      }
      continue;
    }
    accepted.push(candidate);
  }
  return { accepted, issues };
}
