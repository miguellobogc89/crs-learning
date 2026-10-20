import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import { validateSchemaDiscovery, type SchemaDiscoveryProposal } from "./validation";
import { planRelationDefinitions } from "./relation-definition-plan";

/**
 * Persist only explicitly selected, evidence-backed relation definitions.
 * Does not create links between business records.
 */
export async function persistApprovedRelationDefinitions(input: {
  workspaceId: string;
  userId: string;
  proposal: SchemaDiscoveryProposal;
  selectedRelationKeys: string[];
}) {
  if (!input.workspaceId || !input.userId ||
      !Array.isArray(input.selectedRelationKeys) ||
      input.selectedRelationKeys.length === 0 ||
      new Set(input.selectedRelationKeys).size !== input.selectedRelationKeys.length) {
    throw new Error("Explicit distinct relation keys are required.");
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
      throw new Error("Workspace owner or admin required.");
    }
    const evidence = [
      ...input.proposal.entities.flatMap((entity) => [
        ...entity.evidence, ...entity.fields.flatMap((field) => field.evidence),
      ]),
      ...input.proposal.relations.flatMap((relation) => relation.evidence),
    ];
    const fileIds = [...new Set(evidence.map((item) => item.documentId))];
    if (fileIds.length === 0 || fileIds.length > 10) {
      throw new Error("Approval requires evidence from 1 to 10 files.");
    }
    const files = await tx.knowledge_files.findMany({
      where: {
        id: { in: fileIds }, status: "ready",
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
    const selected = new Set(input.selectedRelationKeys);
    const selectedRelations = checked.proposal.relations.filter((relation) => selected.has(relation.key));
    if (selectedRelations.length !== selected.size) {
      throw new Error("Selected relation keys do not match the reviewed proposal.");
    }
    const types = await tx.engine_object_types.findMany({
      where: { workspace_id: input.workspaceId, status: "active" },
      select: { id: true, key: true },
    });
    const existing = await tx.engine_relation_definitions.findMany({
      where: { workspace_id: input.workspaceId },
      select: { key: true },
    });
    const plan = planRelationDefinitions({
      relations: selectedRelations,
      existingTypeKeys: types.map((type) => type.key),
      existingRelationKeys: existing.map((relation) => relation.key),
    });
    if (!plan.valid || plan.ready.length !== selected.size) {
      throw new Error("Invalid relation definitions: " + JSON.stringify(plan.issues));
    }
    const ids = new Map(types.map((type) => [type.key, type.id]));
    const created = [];
    for (const relation of plan.ready) {
      const row = await tx.engine_relation_definitions.create({
        data: {
          workspace_id: input.workspaceId,
          key: relation.key,
          name: relation.key.replace(/_/g, " "),
          description: relation.description,
          from_object_type_id: ids.get(relation.fromEntity)!,
          to_object_type_id: ids.get(relation.toEntity)!,
          cardinality: relation.cardinality,
          created_by_user_id: input.userId,
        },
        select: { id: true, key: true, cardinality: true },
      });
      created.push(row);
    }
    return { count: created.length, created };
  });
}
