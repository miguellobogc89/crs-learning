import { detectKnowledgeValueConflicts } from "./detect-ai.service";
import { persistReviewedValueConflictCandidates } from "./persistence.service";
import { planConflictAwareImport } from "./import-plan";
import { extractEngineCandidatesFromKnowledge } from "../import-ai-extraction.service";

/**
 * Opt-in conflict-aware import preparation. This is not automatic publication:
 * all extracted records remain proposals for subsequent reviewed persistence.
 *
 * Fail closed: if conflict detection is invalid, no extracted candidate is
 * declared ready and no conflict is persisted.
 */
export async function prepareConflictAwareKnowledgeImport(input: {
  workspaceId: string;
  userId: string;
  knowledgeFileIds: string[];
}) {
  const detected = await detectKnowledgeValueConflicts(input);
  if (!detected.valid) {
    return {
      status: "INVALID_CONFLICT_REVIEW" as const,
      conflicts: detected.conflicts,
      conflictIssues: detected.issues,
      ready: [],
      pending: [],
      extractionIssues: [],
      persistedConflictCount: 0,
    };
  }

  // Only evidence-validated conflicts are persisted. A failed write aborts
  // preparation rather than presenting unresolved values as unambiguous.
  const persisted = await persistReviewedValueConflictCandidates({
    workspaceId: input.workspaceId,
    userId: input.userId,
    candidates: detected.conflicts,
  });
  const extracted = await extractEngineCandidatesFromKnowledge(input);
  const plan = planConflictAwareImport({
    accepted: extracted.accepted,
    conflicts: detected.conflicts,
  });
  return {
    ...plan,
    conflictIssues: detected.issues,
    extractionIssues: extracted.issues,
    proposedCount: extracted.proposedCount,
    persistedConflictCount: persisted.count,
    // READY_FOR_REVIEW means human-reviewed persistence is still required.
    status: plan.status,
  };
}
