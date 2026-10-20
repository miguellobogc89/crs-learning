import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import { preflightEngineImportCandidates, type EngineImportCandidate } from "./import-preflight";
import { validateEngineRecordValues } from "./validation";
import { planReviewedKnowledgeBatch } from "./import-reviewed-batch-plan";
import { selectApprovedBatchObservations } from "./import-batch-approval";
import { persistReviewedKnowledgeObservation } from "./persist-reviewed-observation.service";
import type { ValueConflictCandidate } from "./conflicts/validation";

/**
 * Explicitly approved, conflict-aware batch persistence.
 *
 * Each observation is committed in its own transaction by the single-record
 * service, not as an all-or-nothing batch. On failure, return the committed
 * prefix and the error; retry is safe for unchanged drafts. No publication.
 *
 * The read-only plan is recomputed from current accessible documents and
 * pending conflicts. The single-record service checks all of them again
 * inside each write transaction.
 */
export async function persistApprovedKnowledgeBatch(input: {
  workspaceId: string;
  userId: string;
  candidates: EngineImportCandidate[];
  approvedObservationKeys: string[];
}) {
  if (!input.workspaceId || !input.userId ||
      !Array.isArray(input.candidates) || input.candidates.length === 0 ||
      input.candidates.length > 100 ||
      !Array.isArray(input.approvedObservationKeys) ||
      input.approvedObservationKeys.length === 0 ||
      input.approvedObservationKeys.length > 100) {
    throw new Error("Batch requires candidates and explicit approvals (max 100).");
  }
  const { workspaceId, userId } = input;
  const workspace = await prisma.workspaces.findFirst({
    where: { id: workspaceId, status: "active" },
    select: { owner_user_id: true, workspace_members: {
      where: { user_id: userId, status: "active" },
      select: { role: true },
    } },
  });
  const role = workspace?.workspace_members[0]?.role;
  if (!workspace || (workspace.owner_user_id !== userId &&
      !["owner", "admin"].includes(role ?? ""))) {
    throw new Error("Workspace owner or admin required.");
  }

  const documentIds = [...new Set(input.candidates.map((candidate) => candidate.documentId))];
  if (documentIds.length > 10) throw new Error("At most 10 documents per batch.");
  const files = await prisma.knowledge_files.findMany({
    where: { id: { in: documentIds }, status: "ready",
      knowledge_sources: knowledgeSourceReadWhere(userId, workspaceId) },
    select: { id: true, extracted_text: true },
  });
  if (files.length !== documentIds.length) {
    throw new Error("Some evidence documents are inaccessible.");
  }
  const preflight = preflightEngineImportCandidates({
    workspaceId,
    documents: files.map((file) => ({
      id: file.id, workspaceId, extractedText: file.extracted_text,
    })),
    candidates: input.candidates,
  });
  // Exact repetitions are accepted by the batch planner, but all other
  // evidence failures block the entire request.
  if (preflight.issues.some((issue) => issue.code !== "DUPLICATE_CANDIDATE")) {
    throw new Error("Invalid candidate evidence: " + JSON.stringify(preflight.issues));
  }

  const types = await prisma.engine_object_types.findMany({
    where: { workspace_id: workspaceId, status: "active",
      id: { in: [...new Set(input.candidates.map((c) => c.objectTypeId))] } },
    include: { engine_field_definitions: { where: { status: "active" } } },
  });
  const typeById = new Map(types.map((type) => [type.id, type]));
  for (const candidate of input.candidates) {
    const type = typeById.get(candidate.objectTypeId);
    if (!type || type.engine_field_definitions.some((field) =>
      field.is_unique || ["entity_reference", "record_reference"].includes(field.field_type)) ||
      !type.engine_field_definitions.some((field) => field.key === candidate.fieldKey)) {
      throw new Error("Unsupported or missing object type/field.");
    }
    const checked = validateEngineRecordValues(candidate.values, type.engine_field_definitions);
    if (!checked.ok) throw new Error("Invalid typed candidate: " + JSON.stringify(checked.issues));
  }

  const pending = await prisma.engine_value_conflicts.findMany({
    where: { workspace_id: workspaceId, status: "pending_review" },
    select: { subject: true, attribute: true, context: true, alternatives_json: true },
    take: 100,
  });
  if (pending.length === 100) throw new Error("Pending conflict list may be truncated.");
  const conflicts: ValueConflictCandidate[] = pending.map((item) => {
    const alternatives = item.alternatives_json;
    if (!Array.isArray(alternatives) || !alternatives.length ||
        !alternatives.every((alternative) =>
          alternative && typeof alternative === "object" &&
          !Array.isArray(alternative) && typeof alternative.value === "string" &&
          Array.isArray(alternative.evidence) &&
          alternative.evidence.every((evidence: unknown) =>
            evidence && typeof evidence === "object" && !Array.isArray(evidence) &&
            typeof (evidence as { documentId?: unknown }).documentId === "string" &&
            typeof (evidence as { quote?: unknown }).quote === "string" &&
            !!(evidence as { quote: string }).quote.trim()))) {
      throw new Error("Malformed stored conflict evidence.");
    }
    return {
      subject: item.subject, attribute: item.attribute, context: item.context,
      status: "PENDING_REVIEW", scope: "AFFECTED_VALUE_ONLY",
      alternatives: alternatives as unknown as ValueConflictCandidate["alternatives"],
    };
  });
  const plan = planReviewedKnowledgeBatch({
    workspaceId, candidates: input.candidates, conflicts,
  });
  const selected = selectApprovedBatchObservations({
    plan, approvedObservationKeys: input.approvedObservationKeys,
  });
  const committed: { observationKey: string; recordId: string; created: boolean }[] = [];
  for (const item of selected) {
    try {
      const result = await persistReviewedKnowledgeObservation({
        workspaceId, userId, candidate: item.candidate, approved: true,
      });
      committed.push({
        observationKey: item.observationKey, recordId: result.id,
        created: result.created,
      });
    } catch (error) {
      return {
        ok: false as const, committed, failedObservationKey: item.observationKey,
        error: error instanceof Error ? error.message : "Unknown persistence failure",
        note: "Earlier observations were committed individually. Retry after review.",
      };
    }
  }
  return {
    ok: true as const, committed,
    heldForConflict: plan.heldForConflict.length,
    heldForIdentity: plan.heldForIdentity.length,
    repeatedObservations: plan.repeatedObservations.length,
  };
}
