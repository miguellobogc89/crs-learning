import { Prisma } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import { validateEngineRecordValues } from "./validation";
import { extractionObservationKey } from "./import-observation-identity";
import { preflightEngineImportCandidates, type EngineImportCandidate } from "./import-preflight";

/**
 * Persist one explicitly reviewed observation as a DRAFT.
 *
 * This does not establish real-world entity identity or publish data.
 * An observation key is scoped to source evidence; distinct observations
 * remain separate until an explicit entity-resolution workflow exists.
 */
export async function persistReviewedKnowledgeObservation(input: {
  workspaceId: string;
  userId: string;
  candidate: EngineImportCandidate;
  approved: true;
}) {
  if (!input.workspaceId || !input.userId || input.approved !== true ||
      !input.candidate || typeof input.candidate.documentId !== "string") {
    throw new Error("Explicit approval and workspace identity required.");
  }
  const { workspaceId, userId, candidate } = input;
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspaces.findFirst({
      where: { id: workspaceId, status: "active" },
      select: {
        owner_user_id: true,
        workspace_members: {
          where: { user_id: userId, status: "active" },
          select: { role: true },
        },
      },
    });
    const role = workspace?.workspace_members[0]?.role;
    if (!workspace || (workspace.owner_user_id !== userId &&
        !["owner", "admin"].includes(role ?? ""))) {
      throw new Error("Workspace owner or admin required.");
    }

    const file = await tx.knowledge_files.findFirst({
      where: {
        id: candidate.documentId, status: "ready",
        knowledge_sources: knowledgeSourceReadWhere(userId, workspaceId),
      },
      select: { id: true, knowledge_source_id: true, extracted_text: true },
    });
    if (!file) throw new Error("Knowledge evidence inaccessible.");
    const preflight = preflightEngineImportCandidates({
      workspaceId,
      documents: [{ id: file.id, workspaceId, extractedText: file.extracted_text }],
      candidates: [candidate],
    });
    if (preflight.issues.length || preflight.accepted.length !== 1) {
      throw new Error("Invalid documentary evidence: " + JSON.stringify(preflight.issues));
    }

    const objectType = await tx.engine_object_types.findFirst({
      where: { id: candidate.objectTypeId, workspace_id: workspaceId, status: "active" },
      include: { engine_field_definitions: { where: { status: "active" } } },
    });
    if (!objectType) throw new Error("Active object type not found.");
    const fields = objectType.engine_field_definitions;
    if (fields.some((field) => field.is_unique ||
        ["entity_reference", "record_reference"].includes(field.field_type))) {
      throw new Error("Unique and reference fields require a separate resolution workflow.");
    }
    if (!fields.some((field) => field.key === candidate.fieldKey)) {
      throw new Error("Evidence field is not active.");
    }
    const validated = validateEngineRecordValues(candidate.values, fields);
    if (!validated.ok) {
      throw new Error("Invalid record values: " + JSON.stringify(validated.issues));
    }

    // Pending disputes must never be bypassed by a direct persistence call.
    // A full page is ambiguous (possibly truncated): fail closed.
    const pending = await tx.engine_value_conflicts.findMany({
      where: { workspace_id: workspaceId, status: "pending_review" },
      select: { alternatives_json: true },
      take: 100,
    });
    if (pending.length === 100) throw new Error("Pending conflict limit reached; review required.");
    for (const conflict of pending) {
      if (!Array.isArray(conflict.alternatives_json)) {
        throw new Error("Malformed pending conflict; review required.");
      }
      for (const alternative of conflict.alternatives_json) {
        if (!alternative || typeof alternative !== "object" || Array.isArray(alternative) ||
            !Array.isArray(alternative.evidence)) {
          throw new Error("Malformed pending conflict evidence.");
        }
        for (const evidence of alternative.evidence) {
          if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) ||
              typeof evidence.documentId !== "string" ||
              typeof evidence.quote !== "string" || !evidence.quote.trim()) {
            throw new Error("Malformed pending conflict quote.");
          }
          if (evidence.documentId === file.id &&
              (candidate.evidenceText.includes(evidence.quote) ||
               evidence.quote.includes(candidate.evidenceText))) {
            throw new Error("Candidate overlaps an unresolved value conflict.");
          }
        }
      }
    }

    const externalKey = extractionObservationKey({ workspaceId, candidate });
    const existing = await tx.engine_records.findFirst({
      where: { workspace_id: workspaceId, object_type_id: objectType.id, external_key: externalKey },
      select: { id: true, status: true, revision: true, values_json: true },
    });
    if (existing) {
      // A retry is safe only if the original draft and evidence still match.
      if (existing.status !== "draft" || existing.revision !== 1 ||
          !isDeepStrictEqual(existing.values_json, validated.values)) {
        throw new Error("Existing observation was modified; manual review required.");
      }
      const provenance = await tx.engine_record_provenance.findFirst({
        where: {
          workspace_id: workspaceId, record_id: existing.id, revision: 1,
          knowledge_file_id: file.id, knowledge_source_id: file.knowledge_source_id,
          field_key: candidate.fieldKey, evidence_text: candidate.evidenceText,
          origin_type: "document",
        },
        select: { id: true },
      });
      if (!provenance) throw new Error("Existing observation has missing provenance.");
      return { id: existing.id, created: false, status: "draft" as const };
    }

    const record = await tx.engine_records.create({
      data: {
        workspace_id: workspaceId,
        object_type_id: objectType.id,
        external_key: externalKey,
        status: "draft",
        schema_version: objectType.schema_version,
        revision: 1,
        values_json: validated.values as Prisma.InputJsonObject,
        created_by_user_id: userId,
        updated_by_user_id: userId,
      },
      select: { id: true },
    });
    // Revision 1 is captured by the database trigger on engine_records.
    // Any provenance failure rolls back the record as well.
    await tx.engine_record_provenance.create({
      data: {
        workspace_id: workspaceId,
        record_id: record.id,
        revision: 1,
        field_key: candidate.fieldKey,
        knowledge_source_id: file.knowledge_source_id,
        knowledge_file_id: file.id,
        evidence_text: candidate.evidenceText,
        origin_type: "document",
        created_by_user_id: userId,
      },
    });
    return { id: record.id, created: true, status: "draft" as const };
  });
}
