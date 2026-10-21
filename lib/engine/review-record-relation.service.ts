import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import { planEngineRelation, type RelationDefinition } from "./relation-review-plan";

async function authorize(tx: Prisma.TransactionClient, workspaceId: string, userId: string, write: boolean) {
  const workspace = await tx.workspaces.findFirst({
    where: { id: workspaceId, status: "active" },
    select: { owner_user_id: true, workspace_members: {
      where: { user_id: userId, status: "active" }, select: { role: true },
    } },
  });
  if (!workspace || (workspace.owner_user_id !== userId &&
      !(write ? ["owner", "admin"] : ["owner", "admin", "member"])
        .includes(workspace.workspace_members[0]?.role ?? ""))) {
    throw new Error("Insufficient workspace permissions.");
  }
}

/** Read-only workspace-scoped review queue; evidence is restricted by Knowledge ACL. */
export async function listPendingEngineRelations(input: { workspaceId: string; userId: string }) {
  return prisma.$transaction(async tx => {
    await authorize(tx, input.workspaceId, input.userId, false);
    const proposals = await tx.engine_relation_proposals.findMany({
      where: { workspace_id: input.workspaceId, status: "pending_review",
        document: { knowledge_sources: knowledgeSourceReadWhere(input.userId, input.workspaceId) } },
      orderBy: { created_at: "desc" }, take: 100,
      include: { definition: { select: { key: true, name: true, cardinality: true } },
        from_record: { select: { values_json: true } },
        to_record: { select: { values_json: true } } },
    });
    return proposals;
  });
}

export async function listApprovedEngineRelations(input: {
  workspaceId: string; userId: string; recordIds: string[];
}) {
  if (input.recordIds.length > 100) throw new Error("Too many record IDs.");
  return prisma.$transaction(async tx => {
    await authorize(tx, input.workspaceId, input.userId, false);
    return tx.engine_record_relations.findMany({
      where: { workspace_id: input.workspaceId,
        OR: [{ from_record_id: { in: input.recordIds } },
          { to_record_id: { in: input.recordIds } }] },
      include: { definition: { select: { key: true, name: true, cardinality: true } } },
      take: 500,
    });
  });
}

/**
 * Explicit human decision. All approvals in a workspace acquire the same
 * transaction-scoped advisory lock before checking cardinality.
 */
export async function reviewEngineRelation(input: {
  workspaceId: string; userId: string; proposalId: string;
  decision: "approve" | "reject";
}) {
  if (!input.workspaceId || !input.userId || !input.proposalId ||
      !["approve", "reject"].includes(input.decision)) throw new Error("Invalid review request.");
  return prisma.$transaction(async tx => {
    await authorize(tx, input.workspaceId, input.userId, true);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"engine_relations:" + input.workspaceId}))`;
    const proposal = await tx.engine_relation_proposals.findFirst({
      where: { id: input.proposalId, workspace_id: input.workspaceId },
    });
    if (!proposal) throw new Error("Proposal not found.");
    if (proposal.status !== "pending_review") throw new Error("Proposal already reviewed.");
    if (input.decision === "reject") {
      const updated = await tx.engine_relation_proposals.updateMany({
        where: { id: proposal.id, workspace_id: input.workspaceId, status: "pending_review" },
        data: { status: "rejected", reviewed_by_user_id: input.userId, reviewed_at: new Date() },
      });
      if (updated.count !== 1) throw new Error("Concurrent review detected.");
      return { status: "rejected" as const };
    }
    const [definition, from, to, file] = await Promise.all([
      tx.engine_relation_definitions.findFirst({
        where: { id: proposal.relation_definition_id, workspace_id: input.workspaceId },
      }),
      tx.engine_records.findFirst({
        where: { id: proposal.from_record_id, workspace_id: input.workspaceId },
      }),
      tx.engine_records.findFirst({
        where: { id: proposal.to_record_id, workspace_id: input.workspaceId },
      }),
      tx.knowledge_files.findFirst({
        where: { id: proposal.document_id, status: { in: ["ready", "processed"] },
          knowledge_sources: knowledgeSourceReadWhere(input.userId, input.workspaceId) },
        select: { id: true, extracted_text: true },
      }),
    ]);
    if (!definition || !from || !to || !file) throw new Error("Relation evidence or records unavailable.");
    const existing = await tx.engine_record_relations.findMany({
      where: { workspace_id: input.workspaceId,
        relation_definition_id: definition.id },
      select: { relation_definition_id: true, from_record_id: true, to_record_id: true },
    });
    const plan = planEngineRelation({
      workspaceId: input.workspaceId,
      definition: { id: definition.id, workspaceId: definition.workspace_id,
        fromObjectTypeId: definition.from_object_type_id,
        toObjectTypeId: definition.to_object_type_id,
        cardinality: definition.cardinality as RelationDefinition["cardinality"],
        status: definition.status as RelationDefinition["status"] },
      from: { id: from.id, workspaceId: from.workspace_id,
        objectTypeId: from.object_type_id, status: from.status as "draft" | "active" | "archived" },
      to: { id: to.id, workspaceId: to.workspace_id,
        objectTypeId: to.object_type_id, status: to.status as "draft" | "active" | "archived" },
      document: { id: file.id, workspaceId: input.workspaceId, extractedText: file.extracted_text },
      existingRelations: existing.map(row => ({
        relationDefinitionId: row.relation_definition_id,
        fromRecordId: row.from_record_id, toRecordId: row.to_record_id,
      })),
      proposal: { relationDefinitionId: proposal.relation_definition_id,
        fromRecordId: proposal.from_record_id, toRecordId: proposal.to_record_id,
        documentId: proposal.document_id, evidenceText: proposal.evidence_text },
    });
    if (plan.status !== "REVIEW_REQUIRED") throw new Error("Relation held: " + plan.issues.join(", "));
    const relation = await tx.engine_record_relations.create({
      data: { workspace_id: input.workspaceId, relation_definition_id: definition.id,
        from_record_id: from.id, to_record_id: to.id,
        source_proposal_id: proposal.id, reviewed_by_user_id: input.userId },
    });
    const updated = await tx.engine_relation_proposals.updateMany({
      where: { id: proposal.id, workspace_id: input.workspaceId, status: "pending_review" },
      data: { status: "approved", reviewed_by_user_id: input.userId, reviewed_at: new Date() },
    });
    if (updated.count !== 1) throw new Error("Concurrent review detected.");
    return { status: "approved" as const, relationId: relation.id };
  }, { timeout: 20000 });
}
