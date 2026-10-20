import type { EngineImportCandidate } from "./import-preflight";
import { extractionObservationKey } from "./import-observation-identity";
import { planRecordIdentityReview } from "./import-record-identity";
import { planConflictAwareImport } from "./conflicts/import-plan";
import type { ValueConflictCandidate } from "./conflicts/validation";

export type ReviewedBatchPlan = {
  status: "READY_FOR_EXPLICIT_APPROVAL" | "REVIEW_REQUIRED";
  eligible: { observationKey: string; candidate: EngineImportCandidate }[];
  heldForConflict: { candidate: EngineImportCandidate; conflictIndexes: number[] }[];
  heldForIdentity: ReturnType<typeof planRecordIdentityReview>["possibleDuplicates"];
  repeatedObservations: { observationKey: string; candidate: EngineImportCandidate }[];
};

/**
 * Pure, conservative planning after workspace authorization, evidence validation
 * and typed validation. Never persists, resolves identity or approves candidates.
 * Same-document observations are deduplicated by their exact evidence identity;
 * same-value observations across different sources are held for human review.
 */
export function planReviewedKnowledgeBatch(input: {
  workspaceId: string;
  candidates: readonly EngineImportCandidate[];
  conflicts: readonly ValueConflictCandidate[];
}): ReviewedBatchPlan {
  if (!input.workspaceId || !Array.isArray(input.candidates) ||
      input.candidates.length > 500 || !Array.isArray(input.conflicts)) {
    throw new Error("Invalid reviewed batch.");
  }
  const unique: EngineImportCandidate[] = [];
  const repeatedObservations: ReviewedBatchPlan["repeatedObservations"] = [];
  const seen = new Set<string>();
  for (const candidate of input.candidates) {
    const observationKey = extractionObservationKey({
      workspaceId: input.workspaceId, candidate,
    });
    if (seen.has(observationKey)) {
      repeatedObservations.push({ observationKey, candidate });
    } else {
      seen.add(observationKey);
      unique.push(candidate);
    }
  }
  const conflictPlan = planConflictAwareImport({
    accepted: unique, conflicts: input.conflicts,
  });
  const identityPlan = planRecordIdentityReview(conflictPlan.ready);
  const eligible = identityPlan.unique.map((candidate) => ({
    observationKey: extractionObservationKey({
      workspaceId: input.workspaceId, candidate,
    }),
    candidate,
  }));
  return {
    status: conflictPlan.pending.length || identityPlan.possibleDuplicates.length ||
      repeatedObservations.length ? "REVIEW_REQUIRED" : "READY_FOR_EXPLICIT_APPROVAL",
    eligible,
    heldForConflict: conflictPlan.pending,
    heldForIdentity: identityPlan.possibleDuplicates,
    repeatedObservations,
  };
}
