import type { EngineImportCandidate } from "./import-preflight";
import type { ReviewedBatchPlan } from "./import-reviewed-batch-plan";

/**
 * Pure approval boundary for a previously validated and reviewed batch plan.
 * No writes. The caller must revalidate evidence, permissions, conflicts and
 * identity before persistence; a stale plan is not an authorization token.
 */
export function selectApprovedBatchObservations(input: {
  plan: ReviewedBatchPlan;
  approvedObservationKeys: readonly string[];
}): { observationKey: string; candidate: EngineImportCandidate }[] {
  const { plan, approvedObservationKeys } = input;
  if (!plan || !Array.isArray(plan.eligible) ||
      !Array.isArray(plan.heldForConflict) ||
      !Array.isArray(plan.heldForIdentity) ||
      !Array.isArray(plan.repeatedObservations) ||
      !Array.isArray(approvedObservationKeys) ||
      approvedObservationKeys.length === 0 ||
      approvedObservationKeys.length > 100 ||
      new Set(approvedObservationKeys).size !== approvedObservationKeys.length) {
    throw new Error("Explicit distinct approved observation keys required.");
  }
  const eligible = new Map<string, ReviewedBatchPlan["eligible"][number]>();
  for (const item of plan.eligible) {
    if (!item || !/^obs_[a-f0-9]{64}$/.test(item.observationKey) ||
        eligible.has(item.observationKey)) {
      throw new Error("Invalid or duplicated eligible observation.");
    }
    eligible.set(item.observationKey, item);
  }
  return approvedObservationKeys.map((key) => {
    const item = eligible.get(key);
    if (!item) throw new Error("Approval includes an ineligible observation.");
    return item;
  });
}
