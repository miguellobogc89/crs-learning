import { detectKnowledgeValueConflicts } from "./detect-ai.service";
import {
  listPendingValueConflicts,
  persistReviewedValueConflictCandidates,
} from "./persistence.service";
import { planConflictAwareImport } from "./import-plan";
import { extractEngineCandidatesFromKnowledge } from "../import-ai-extraction.service";
import { planRecordIdentityReview } from "../import-record-identity";
import type { ValueConflictCandidate, ValueConflictAlternative } from "./validation";

function storedAlternatives(value: unknown): ValueConflictAlternative[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 10) {
    throw new Error("Invalid stored conflict alternatives.");
  }
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Invalid stored conflict alternative.");
    }
    const alternative = item as Record<string, unknown>;
    if (typeof alternative.value !== "string" || !alternative.value.trim() ||
        !Array.isArray(alternative.evidence) || alternative.evidence.length === 0) {
      throw new Error("Invalid stored conflict evidence.");
    }
    const evidence = alternative.evidence.map((entry: unknown) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error("Invalid stored conflict evidence.");
      }
      const source = entry as Record<string, unknown>;
      if (typeof source.documentId !== "string" || !source.documentId.trim() ||
          typeof source.quote !== "string" || !source.quote.trim() ||
          !source.quote.includes(alternative.value as string)) {
        throw new Error("Invalid stored conflict evidence.");
      }
      return { documentId: source.documentId, quote: source.quote };
    });
    return { value: alternative.value, evidence };
  });
}

/**
 * Opt-in conflict-aware import preparation. All records remain proposals for
 * subsequent reviewed persistence, never automatic publication.
 *
 * Pending conflicts already in the workspace remain protective even if a
 * subsequent model run fails to rediscover them. Resolved/dismissed conflicts
 * are not reopened. This service fails closed on invalid detection or an
 * incomplete pending-conflict read.
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

  const persisted = await persistReviewedValueConflictCandidates({
    workspaceId: input.workspaceId,
    userId: input.userId,
    candidates: detected.conflicts,
  });

  // The reader is permission checked and workspace scoped. Never use just
  // the conflicts from this model run: previous pending values also matter.
  const rows = await listPendingValueConflicts({
    workspaceId: input.workspaceId,
    userId: input.userId,
    take: 100,
  });
  // The reader currently has a hard 100-row cap; silently truncating could
  // expose an affected candidate as safe. Refuse to plan in that case.
  if (rows.length === 100) {
    throw new Error("Pending conflict review exceeds the safe read limit.");
  }
  const conflicts: ValueConflictCandidate[] = rows.map((row) => ({
    subject: row.subject,
    attribute: row.attribute,
    context: row.context,
    alternatives: storedAlternatives(row.alternatives_json),
    status: "PENDING_REVIEW",
    scope: "AFFECTED_VALUE_ONLY",
  }));

  const extracted = await extractEngineCandidatesFromKnowledge(input);
  const plan = planConflictAwareImport({
    accepted: extracted.accepted,
    conflicts,
  });
  // A second review gate: exact-value matches may be duplicate entities.
  // Keep the conflict-safe candidates as proposals; never auto-merge or persist.
  const identityReview = planRecordIdentityReview(plan.ready);
  return {
    ...plan,
    identityReview,
    conflictIssues: detected.issues,
    extractionIssues: extracted.issues,
    proposedCount: extracted.proposedCount,
    persistedConflictCount: persisted.count,
    status: plan.status,
  };
}
