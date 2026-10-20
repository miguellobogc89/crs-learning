import type { DiscoveryDocument, DiscoveryEvidence } from "../schema-discovery/validation";

/**
 * Candidate value conflicts are not proven contradictions: identity, dates,
 * units and applicability may still need review. Never auto-resolve.
 */
export type ValueConflictAlternative = {
  value: string;
  evidence: DiscoveryEvidence[];
};
export type ValueConflictCandidate = {
  subject: string;
  attribute: string;
  context: string;
  alternatives: ValueConflictAlternative[];
  status: "PENDING_REVIEW";
  scope: "AFFECTED_VALUE_ONLY";
};
export type ValueConflictIssue = {
  path: string;
  code: "INVALID_SHAPE" | "LIMIT_EXCEEDED" | "UNKNOWN_DOCUMENT" |
    "WORKSPACE_MISMATCH" | "EVIDENCE_NOT_IN_DOCUMENT" |
    "VALUE_NOT_IN_EVIDENCE" | "INSUFFICIENT_ALTERNATIVES" |
    "DUPLICATE_VALUE" | "DUPLICATE_CONFLICT";
};
export type ValueConflictReview = {
  valid: boolean;
  conflicts: ValueConflictCandidate[];
  issues: ValueConflictIssue[];
};

const obj = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown, max = 200): x is string =>
  typeof x === "string" && x.trim().length > 0 && x.length <= max;

/**
 * Deterministic boundary for model-proposed conflicts.
 * Evidence is checked against the exact authorized document text supplied
 * by the caller. Caller is responsible for authorization and read access.
 * No database calls, model calls or persistence.
 */
export function validateValueConflicts(input: {
  workspaceId: string;
  documents: readonly DiscoveryDocument[];
  candidates: unknown;
}): ValueConflictReview {
  const issues: ValueConflictIssue[] = [];
  const conflicts: ValueConflictCandidate[] = [];
  const fail = (path: string, code: ValueConflictIssue["code"]) => issues.push({ path, code });
  if (!Array.isArray(input.candidates)) {
    return { valid: false, conflicts: [], issues: [{ path: "$", code: "INVALID_SHAPE" }] };
  }
  if (input.candidates.length > 50) fail("$", "LIMIT_EXCEEDED");
  const docs = new Map(input.documents.map((d) => [d.id, d]));
  const seen = new Set<string>();
  for (const [i, candidate] of input.candidates.entries()) {
    const path = `candidates[${i}]`;
    if (!obj(candidate) || !str(candidate.subject) || !str(candidate.attribute) ||
        !str(candidate.context, 500) || !Array.isArray(candidate.alternatives)) {
      fail(path, "INVALID_SHAPE"); continue;
    }
    const identity = JSON.stringify([candidate.subject, candidate.attribute, candidate.context]);
    if (seen.has(identity)) fail(path, "DUPLICATE_CONFLICT");
    seen.add(identity);
    if (candidate.alternatives.length < 2) fail(path, "INSUFFICIENT_ALTERNATIVES");
    if (candidate.alternatives.length > 10) fail(path, "LIMIT_EXCEEDED");
    const values = new Set<string>();
    const alternatives: ValueConflictAlternative[] = [];
    for (const [j, alternative] of candidate.alternatives.entries()) {
      const ap = `${path}.alternatives[${j}]`;
      if (!obj(alternative) || !str(alternative.value, 500) ||
          !Array.isArray(alternative.evidence) || alternative.evidence.length === 0) {
        fail(ap, "INVALID_SHAPE"); continue;
      }
      if (values.has(alternative.value)) fail(ap, "DUPLICATE_VALUE");
      values.add(alternative.value);
      if (alternative.evidence.length > 20) fail(ap, "LIMIT_EXCEEDED");
      const evidence: DiscoveryEvidence[] = [];
      for (const [k, source] of alternative.evidence.entries()) {
        const ep = `${ap}.evidence[${k}]`;
        if (!obj(source) || !str(source.documentId) || !str(source.quote, 16000)) {
          fail(ep, "INVALID_SHAPE"); continue;
        }
        const doc = docs.get(source.documentId);
        if (!doc) fail(ep, "UNKNOWN_DOCUMENT");
        else if (doc.workspaceId !== input.workspaceId) fail(ep, "WORKSPACE_MISMATCH");
        else if (!doc.extractedText.includes(source.quote)) fail(ep, "EVIDENCE_NOT_IN_DOCUMENT");
        // Requiring literal value in the quote prevents attaching unrelated evidence.
        if (!source.quote.includes(alternative.value)) fail(ep, "VALUE_NOT_IN_EVIDENCE");
        evidence.push({ documentId: source.documentId, quote: source.quote });
      }
      alternatives.push({ value: alternative.value, evidence });
    }
    conflicts.push({
      subject: candidate.subject,
      attribute: candidate.attribute,
      context: candidate.context,
      alternatives,
      status: "PENDING_REVIEW",
      scope: "AFFECTED_VALUE_ONLY",
    });
  }
  return { valid: issues.length === 0, conflicts: issues.length === 0 ? conflicts : [], issues };
}
