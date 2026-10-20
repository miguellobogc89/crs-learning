import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import {
  planEngineRelation,
  type RelationProposal,
  type RelationDefinition,
} from "./relation-review-plan";

/**
 * Creates a PENDING proposal, not an approved record-level relation.
 * This service does not assert that a document quote proves the relationship;
 * a human reviewer must assess its meaning before any future approval.
 */
export async function proposeEngineRecordRelation(input: {
  workspaceId: string;
  userId: string;
  proposal: RelationProposal;
}) {
  const { workspaceId, userId, proposal } = input;
  if (!workspaceId || !userId || !proposal ||
      !proposal.relationDefinitionId || !proposal.fromRecordId ||
      !proposal.toRecordId || !proposal.documentId ||
      typeof proposal.evidenceText !== "string" ||
      !proposal.evidenceText.trim() || proposal.evidenceText.length > 4000) {
    throw new Error("Invalid relation proposal.");
  }
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

    const [definition, from, to, document] = await Promise.all([
      tx.engine_relation_definitions.findFirst({
        where: { id: proposal.relationDefinitionId, workspace_id: workspaceId },
      }),
      tx.engine_records.findFirst({
        where: { id: proposal.fromRecordId, workspace_id: workspaceId },
        select: { id: true, workspace_id: true, object_type_id: true, status: true },
      }),
      tx.engine_records.findFirst({
        where: { id: proposal.toRecordId, workspace_id: workspaceId },
        select: { id: true, workspace_id: true, object_type_id: true, status: true },
      }),
      tx.knowledge_files.findFirst({
        where: {
          id: proposal.documentId,
          status: "ready",
          knowledge_sources: knowledgeSourceReadWhere(userId, workspaceId),
        },
        select: { id: true, extracted_text: true },
      }),
    ]);
    if (!definition || !from || !to || !document) {
      throw new Error("Definition, records or accessible ready evidence not found.");
    }
    const supportedCardinality = ["one_to_one", "one_to_many", "many_to_many"];
    if (!supportedCardinality.includes(definition.cardinality)) {
      throw new Error("Unsupported relation cardinality.");
    }
    const plan = planEngineRelation({
      workspaceId,
      definition: {
        id: definition.id,
        workspaceId: definition.workspace_id,
        fromObjectTypeId: definition.from_object_type_id,
        toObjectTypeId: definition.to_object_type_id,
        cardinality: definition.cardinality as RelationDefinition["cardinality"],
        status: definition.status as RelationDefinition["status"],
      },
      from: {
        id: from.id, workspaceId: from.workspace_id,
        objectTypeId: from.object_type_id,
        status: from.status as "draft" | "active" | "archived",
      },
      to: {
        id: to.id, workspaceId: to.workspace_id,
        objectTypeId: to.object_type_id,
        status: to.status as "draft" | "active" | "archived",
      },
      document: {
        id: document.id, workspaceId, extractedText: document.extracted_text,
      },
      // There is no approved relation storage yet. Never treat proposals as links.
      existingRelations: [],
      proposal,
    });
    if (plan.status !== "REVIEW_REQUIRED") {
      throw new Error("Relation proposal held: " + plan.issues.join(", "));
    }

    const key = {
      workspace_id: workspaceId,
      relation_definition_id: proposal.relationDefinitionId,
      from_record_id: proposal.fromRecordId,
      to_record_id: proposal.toRecordId,
      document_id: proposal.documentId,
      evidence_text: proposal.evidenceText,
    };
    // The unique database constraint protects concurrent identical submissions.
    // Never revive a rejected proposal through a retry.
    const existing = await tx.engine_relation_proposals.findFirst({
      where: key, select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status !== "pending_review") {
        throw new Error("Previously rejected proposal requires a new review process.");
      }
      return { id: existing.id, created: false, status: "pending_review" as const };
    }
    const created = await tx.engine_relation_proposals.create({
      data: { ...key, status: "pending_review", proposed_by_user_id: userId },
      select: { id: true },
    });
    return { id: created.id, created: true, status: "pending_review" as const };
  });
}
