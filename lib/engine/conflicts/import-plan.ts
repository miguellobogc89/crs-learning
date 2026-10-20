import type { EngineImportCandidate } from "../import-preflight";
import type { ValueConflictCandidate } from "./validation";

export type ConflictAwareImportPlan = {
  ready: EngineImportCandidate[];
  pending: { candidate: EngineImportCandidate; conflictIndexes: number[] }[];
  conflicts: ValueConflictCandidate[];
  status: "READY_FOR_REVIEW" | "PARTIAL_REVIEW_REQUIRED" | "CONFLICT_REVIEW_REQUIRED";
};

/**
 * Conservative nonblocking import planner.
 *
 * A candidate is held only when its evidence overlaps a quoted conflicting
 * alternative in the same document. Unrelated candidates continue to review.
 * This does NOT claim to have resolved entity identity or value semantics:
 * overlapping evidence is intentionally held, never silently published.
 *
 * No writes, no model calls. The caller must validate all candidates and
 * conflict evidence before invoking this function.
 */
export function planConflictAwareImport(input: {
  accepted: readonly EngineImportCandidate[];
  conflicts: readonly ValueConflictCandidate[];
}): ConflictAwareImportPlan {
  const ready: EngineImportCandidate[] = [];
  const pending: ConflictAwareImportPlan["pending"] = [];

  for (const candidate of input.accepted) {
    const matches: number[] = [];
    input.conflicts.forEach((conflict, index) => {
      const overlaps = conflict.alternatives.some((alternative) =>
        alternative.evidence.some((source) =>
          source.documentId === candidate.documentId &&
          (candidate.evidenceText.includes(source.quote) ||
            source.quote.includes(candidate.evidenceText))));
      if (overlaps) matches.push(index);
    });
    if (matches.length) pending.push({ candidate, conflictIndexes: matches });
    else ready.push(candidate);
  }
  return {
    ready,
    pending,
    conflicts: [...input.conflicts],
    status: pending.length === 0 ? "READY_FOR_REVIEW"
      : ready.length === 0 ? "CONFLICT_REVIEW_REQUIRED"
      : "PARTIAL_REVIEW_REQUIRED",
  };
}
