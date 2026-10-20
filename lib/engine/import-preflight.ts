/**
 * Phase 2: preflight for structured facts extracted from imported documents.
 * Pure validation only: no database writes and no AI inference.
 *
 * Candidates are drafts until an authorized, transactional persistence
 * workflow is introduced. Evidence must be an exact substring of the
 * extracted document, not a fabricated explanation.
 */
export type EngineImportDocument = {
  id: string;
  workspaceId: string;
  extractedText: string;
};

export type EngineImportCandidate = {
  objectTypeId: string;
  values: Record<string, unknown>;
  documentId: string;
  evidenceText: string;
  fieldKey: string;
};

export type EngineImportCandidateIssue = {
  index: number;
  code:
    | "WORKSPACE_MISMATCH"
    | "DOCUMENT_NOT_FOUND"
    | "MISSING_EVIDENCE"
    | "EVIDENCE_NOT_IN_DOCUMENT"
    | "INVALID_FIELD"
    | "DUPLICATE_CANDIDATE";
};

export function preflightEngineImportCandidates(input: {
  workspaceId: string;
  documents: readonly EngineImportDocument[];
  candidates: readonly EngineImportCandidate[];
}): { accepted: EngineImportCandidate[]; issues: EngineImportCandidateIssue[] } {
  const documents = new Map(input.documents.map((document) => [document.id, document]));
  const seen = new Set<string>();
  const accepted: EngineImportCandidate[] = [];
  const issues: EngineImportCandidateIssue[] = [];

  input.candidates.forEach((candidate, index) => {
    const document = documents.get(candidate.documentId);
    const reject = (code: EngineImportCandidateIssue["code"]) => issues.push({ index, code });

    if (!input.workspaceId || !document || !document.workspaceId ||
        document.workspaceId !== input.workspaceId) {
      reject(document ? "WORKSPACE_MISMATCH" : "DOCUMENT_NOT_FOUND");
      return;
    }
    if (!candidate.evidenceText?.trim()) {
      reject("MISSING_EVIDENCE");
      return;
    }
    if (!document.extractedText.includes(candidate.evidenceText)) {
      reject("EVIDENCE_NOT_IN_DOCUMENT");
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(candidate.fieldKey) ||
        !Object.prototype.hasOwnProperty.call(candidate.values, candidate.fieldKey)) {
      reject("INVALID_FIELD");
      return;
    }
    const identity = JSON.stringify([
      candidate.documentId, candidate.objectTypeId, candidate.fieldKey,
      candidate.values, candidate.evidenceText,
    ]);
    if (seen.has(identity)) {
      reject("DUPLICATE_CANDIDATE");
      return;
    }
    seen.add(identity);
    accepted.push(candidate);
  });

  return { accepted, issues };
}
