import { createHash } from "node:crypto";
import type { EngineImportCandidate } from "./import-preflight";

export type RecordIdentityReview = {
  status: "READY_FOR_REVIEW" | "NEEDS_IDENTITY_REVIEW";
  unique: EngineImportCandidate[];
  possibleDuplicates: {
    fingerprint: string;
    objectTypeId: string;
    candidates: EngineImportCandidate[];
    reason: "SAME_TYPE_AND_VALUES_MULTIPLE_EVIDENCES";
  }[];
};

/**
 * Detect identical typed value sets across evidence-backed candidates.
 *
 * This is intentionally NOT entity resolution. A matching value set can
 * describe two real-world entities, and different values can describe the
 * same entity at different times. Neither case is silently merged.
 *
 * Caller must first authorize documents and validate candidate values and
 * source evidence. No writes, AI calls, or workspace-global assumptions.
 */
export function planRecordIdentityReview(
  candidates: readonly EngineImportCandidate[],
): RecordIdentityReview {
  if (!Array.isArray(candidates) || candidates.length > 500) {
    throw new Error("Record identity review supports at most 500 candidates.");
  }
  const canonical = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    const obj = value as Record<string, unknown>;
    return "{" + Object.keys(obj).sort().map((key) =>
      JSON.stringify(key) + ":" + canonical(obj[key])).join(",") + "}";
  };
  const groups = new Map<string, EngineImportCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.objectTypeId !== "string" ||
        !candidate.values || typeof candidate.values !== "object" ||
        Array.isArray(candidate.values) || !candidate.documentId ||
        !candidate.evidenceText || !candidate.fieldKey) {
      throw new Error("Malformed record candidate; validate extraction first.");
    }
    const fingerprint = createHash("sha256").update(canonical([
      candidate.objectTypeId, candidate.values,
    ])).digest("hex");
    const group = groups.get(fingerprint) ?? [];
    group.push(candidate);
    groups.set(fingerprint, group);
  }
  const unique: EngineImportCandidate[] = [];
  const possibleDuplicates: RecordIdentityReview["possibleDuplicates"] = [];
  for (const [fingerprint, group] of groups) {
    // Identical values with multiple evidence anchors must be reviewed,
    // including repeated mentions in one document.
    if (group.length === 1) unique.push(group[0]);
    else possibleDuplicates.push({
      fingerprint, objectTypeId: group[0].objectTypeId,
      candidates: group,
      reason: "SAME_TYPE_AND_VALUES_MULTIPLE_EVIDENCES",
    });
  }
  return {
    status: possibleDuplicates.length ? "NEEDS_IDENTITY_REVIEW" : "READY_FOR_REVIEW",
    unique, possibleDuplicates,
  };
}
