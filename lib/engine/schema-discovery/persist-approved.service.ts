import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import { validateSchemaDiscovery, type SchemaDiscoveryProposal } from "./validation";
import { reviewSemanticEntityMatches, type SemanticMatchCandidate } from "./semantic-review";
import { planDiscoveredDefinitionApproval } from "./approval-plan";

/**
 * Explicitly approved, atomic creation of Engine object types and fields.
 * Caller must supply the original proposal and semantic comparison decisions;
 * evidence is rechecked against authorized ready Knowledge files inside the
 * transaction. No relation or record is created here.
 *
 * This is a backend approval boundary, not an automatic AI publishing step.
 */
export async function persistApprovedDiscoveredDefinitions(input: {
  workspaceId: string;
  userId: string;
  proposal: SchemaDiscoveryProposal;
  semanticCandidates: SemanticMatchCandidate[];
  selectedEntityKeys: string[];
}) {
  if (!input.workspaceId || !input.userId ||
      !Array.isArray(input.selectedEntityKeys) ||
      input.selectedEntityKeys.length === 0 ||
      new Set(input.selectedEntityKeys).size !== input.selectedEntityKeys.length ||
      !Array.isArray(input.semanticCandidates)) {
    throw new Error("Explicit, distinct approved entity keys are required.");
  }
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspaces.findFirst({
      where: { id: input.workspaceId, status: "active" },
      select: {
        owner_user_id: true,
        workspace_members: {
          where: { user_id: input.userId, status: "active" },
          select: { role: true },
        },
      },
    });
    const role = workspace?.workspace_members[0]?.role;
    if (!workspace || (workspace.owner_user_id !== input.userId &&
        !["owner", "admin"].includes(role ?? ""))) {
      throw new Error("Workspace owner or admin required to approve Engine definitions.");
    }

    // Do not accept model-supplied quotes without checking original documents.
    const evidence = [
      ...input.proposal.entities.flatMap((entity) => [
        ...entity.evidence,
        ...entity.fields.flatMap((field) => field.evidence),
      ]),
      ...input.proposal.relations.flatMap((relation) => relation.evidence),
    ];
    const fileIds = [...new Set(evidence.map((item) => item.documentId))];
    if (fileIds.length === 0 || fileIds.length > 10) {
      throw new Error("Approval requires evidence from 1 to 10 Knowledge files.");
    }
    const files = await tx.knowledge_files.findMany({
      where: {
        id: { in: fileIds },
        status: "ready",
        knowledge_sources: knowledgeSourceReadWhere(input.userId, input.workspaceId),
      },
      select: { id: true, extracted_text: true },
    });
    if (files.length !== fileIds.length) {
      throw new Error("Schema evidence is no longer accessible.");
    }
    const checked = validateSchemaDiscovery({
      workspaceId: input.workspaceId,
      documents: files.map((file) => ({
        id: file.id, workspaceId: input.workspaceId, extractedText: file.extracted_text,
      })),
      proposal: input.proposal,
    });
    if (!checked.valid || !checked.proposal) {
      throw new Error("Invalid schema evidence: " + JSON.stringify(checked.issues));
    }
    const semantic = reviewSemanticEntityMatches(checked.proposal, input.semanticCandidates);
    if (!semantic.valid) {
      throw new Error("Invalid semantic review: " + JSON.stringify(semantic.issues));
    }
    const existing = await tx.engine_object_types.findMany({
      where: { workspace_id: input.workspaceId },
      select: { key: true },
    });
    const plan = planDiscoveredDefinitionApproval({
      proposal: checked.proposal,
      semantic,
      selectedEntityKeys: input.selectedEntityKeys,
      existingEntityKeys: existing.map((entity) => entity.key),
    });
    if (plan.status !== "READY_FOR_APPROVAL" ||
        plan.entities.length !== input.selectedEntityKeys.length ||
        input.selectedEntityKeys.some((key) => !plan.entities.some((entity) => entity.key === key))) {
      throw new Error("Selected definitions require clarification: " + JSON.stringify(plan.deferred));
    }

    const created = [];
    for (const entity of plan.entities) {
      const objectType = await tx.engine_object_types.create({
        data: {
          workspace_id: input.workspaceId,
          key: entity.key,
          name: entity.name.trim(),
          description: entity.description.trim() || null,
        },
      });
      for (const [index, field] of entity.fields.entries()) {
        await tx.engine_field_definitions.create({
          data: {
            workspace_id: input.workspaceId,
            object_type_id: objectType.id,
            key: field.key,
            name: field.name.trim(),
            field_type: field.type,
            is_required: field.required,
            sort_order: index,
            configuration: {} as Prisma.InputJsonObject,
          },
        });
      }
      created.push({ id: objectType.id, key: entity.key, fieldCount: entity.fields.length });
    }
    return {
      created,
      count: created.length,
      deferredRelations: plan.relationsForLaterReview.length,
    };
  });
}
