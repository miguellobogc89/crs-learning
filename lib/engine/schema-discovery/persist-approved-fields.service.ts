import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import { validateSchemaDiscovery, type SchemaDiscoveryProposal } from "./validation";
import { validateExistingSchemaSemanticCandidates, type ExistingSchemaSemanticCandidate } from "./existing-semantic-review";
import { planExistingFieldExtensions } from "./field-extension-plan";

/**
 * Explicit approval boundary for extending existing Engine object types.
 * AI never invokes this as part of discovery. Atomic, permission-scoped,
 * evidence-checked; creates definitions only, not records or relations.
 */
export async function persistApprovedExistingFields(input: {
  workspaceId: string;
  userId: string;
  proposal: SchemaDiscoveryProposal;
  approvedFields: Array<{ entityKey: string; fieldKey: string }>;
  semanticCandidates: ExistingSchemaSemanticCandidate[];
  approved: true;
}) {
  if (input.approved !== true || !input.workspaceId || !input.userId ||
      !Array.isArray(input.approvedFields) || !input.approvedFields.length ||
      !Array.isArray(input.semanticCandidates)) {
    throw new Error("Explicit field approval and semantic review are required.");
  }
  const selections = input.approvedFields.map(f => JSON.stringify([f.entityKey, f.fieldKey]));
  if (new Set(selections).size !== selections.length ||
      input.approvedFields.some(f => !f.entityKey || !f.fieldKey)) {
    throw new Error("Approved fields must be distinct and identified.");
  }
  return prisma.$transaction(async tx => {
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
      ...input.proposal.entities.flatMap(entity => [
        ...entity.evidence, ...entity.fields.flatMap(field => field.evidence),
      ]),
      ...input.proposal.relations.flatMap(relation => relation.evidence),
    ];
    const fileIds = [...new Set(evidence.map(e => e.documentId))];
    if (!fileIds.length || fileIds.length > 10) throw new Error("Invalid evidence file count.");
    const files = await tx.knowledge_files.findMany({
      where: {
        id: { in: fileIds }, status: "ready",
        knowledge_sources: knowledgeSourceReadWhere(input.userId, input.workspaceId),
      },
      select: { id: true, extracted_text: true },
    });
    if (files.length !== fileIds.length) throw new Error("Evidence documents unavailable.");
    const checked = validateSchemaDiscovery({
      workspaceId: input.workspaceId,
      documents: files.map(file => ({
        id: file.id, workspaceId: input.workspaceId, extractedText: file.extracted_text,
      })),
      proposal: input.proposal,
    });
    if (!checked.valid || !checked.proposal) {
      throw new Error("Invalid evidence-backed proposal: " + JSON.stringify(checked.issues));
    }

    const types = await tx.engine_object_types.findMany({
      where: { workspace_id: input.workspaceId },
      select: {
        id: true, key: true, status: true,
        engine_field_definitions: {
          select: { key: true, field_type: true, status: true, sort_order: true },
        },
      },
    });
    const active = types.filter(t => t.status === "active");
    const current = {
      entities: active.map(t => ({
        key: t.key,
        // Include inactive keys to avoid violating unique constraints or
        // silently reviving previously deactivated definitions.
        fields: t.engine_field_definitions.map(f => ({ key: f.key, type: f.field_type })),
      })),
      relations: [],
    };
    const semantic = validateExistingSchemaSemanticCandidates({
      proposal: checked.proposal, current, candidates: input.semanticCandidates,
    });
    if (!semantic.valid) throw new Error("Invalid semantic review: " + JSON.stringify(semantic.issues));
    const approvedEntityKeys = [...new Set(input.approvedFields.map(f => f.entityKey))];
    const plan = planExistingFieldExtensions({
      proposal: checked.proposal, current, approvedEntityKeys,
      semanticCandidates: semantic.candidates,
    });
    const selected = new Set(selections);
    const matching = plan.additions.filter(item =>
      selected.has(JSON.stringify([item.entityKey, item.field.key])));
    if (matching.length !== selected.size ||
        plan.deferred.some(item => selected.has(JSON.stringify([item.entityKey, item.fieldKey])))) {
      throw new Error("One or more selected fields are not safe to add.");
    }
    const created: Array<{ entityKey: string; fieldKey: string; id: string }> = [];
    for (const item of matching) {
      const type = active.find(t => t.key === item.entityKey)!;
      const maxOrder = Math.max(-1, ...type.engine_field_definitions.map(f => f.sort_order));
      const sameTypeCount = created.filter(f => f.entityKey === item.entityKey).length;
      const field = await tx.engine_field_definitions.create({
        data: {
          workspace_id: input.workspaceId,
          object_type_id: type.id,
          key: item.field.key,
          name: item.field.name.trim(),
          field_type: item.field.type,
          is_required: false,
          sort_order: maxOrder + 1 + sameTypeCount,
          configuration: {} as Prisma.InputJsonObject,
        },
      });
      created.push({ entityKey: item.entityKey, fieldKey: field.key, id: field.id });
    }
    return { created, count: created.length, recordsModified: 0 };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
