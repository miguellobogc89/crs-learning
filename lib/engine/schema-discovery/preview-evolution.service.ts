import { prisma } from "@/lib/prisma";
import { discoverEngineSchemaFromKnowledge } from "./discover.service";
import { compareDiscoveredSchema, type CurrentSchema } from "./compare-existing";
import { reviewDiscoveredAgainstExistingSchema } from "./existing-semantic-ai.service";

/**
 * Read-only first-pass delta between AI-discovered evidence-backed schema
 * and the workspace's active Engine definitions.
 *
 * No schema or records are persisted. Exact-key matches are not semantic
 * proof; proposed changes require semantic comparison and approval.
 */
export async function previewDynamicSchemaEvolution(input: {
  workspaceId: string;
  userId: string;
  knowledgeFileIds: string[];
}) {
  const discovery = await discoverEngineSchemaFromKnowledge(input);
  if (!discovery.valid || !discovery.proposal) {
    return {
      status: "INVALID_PROPOSAL" as const,
      discovery,
      comparison: null,
    };
  }
  const [types, relations] = await Promise.all([
    prisma.engine_object_types.findMany({
      where: { workspace_id: input.workspaceId, status: "active" },
      select: {
        key: true,
        engine_field_definitions: {
          where: { status: "active" },
          select: { key: true, field_type: true },
        },
      },
    }),
    prisma.engine_relation_definitions.findMany({
      where: { workspace_id: input.workspaceId, status: "active" },
      select: {
        key: true, cardinality: true,
        from_object_type_id: true, to_object_type_id: true,
      },
    }),
  ]);
  // Resolve relation endpoints from active types; definitions referencing
  // inactive endpoints are not safe to treat as reusable.
  const typeIds = await prisma.engine_object_types.findMany({
    where: { workspace_id: input.workspaceId, status: "active" },
    select: { id: true, key: true },
  });
  const byId = new Map(typeIds.map((type) => [type.id, type.key]));
  const current: CurrentSchema = {
      entities: types.map((type) => ({
        key: type.key,
        fields: type.engine_field_definitions.map((field) => ({
          key: field.key, type: field.field_type,
        })),
      })),
      relations: relations.flatMap((relation) => {
        const fromEntity = byId.get(relation.from_object_type_id);
        const toEntity = byId.get(relation.to_object_type_id);
        return fromEntity && toEntity ? [{
          key: relation.key,
          fromEntity, toEntity, cardinality: relation.cardinality,
        }] : [];
      }),
    };
  const comparison = compareDiscoveredSchema({ proposal: discovery.proposal, current });
  return {
    status: "READY_FOR_SEMANTIC_REVIEW" as const,
    discovery,
    comparison,
    currentSchema: current,
    // Even exact-key reuse is not proof of equivalence across documents.
    requiresSemanticReview: true,
    writesPerformed: false,
  };
}


/**
 * Optional second AI pass to compare newly discovered concepts with the
 * actual existing workspace types and fields. No database writes.
 * Possible aliases are never automatically merged or approved.
 */
export async function previewDynamicSchemaEvolutionWithSemanticReview(input: {
  workspaceId: string;
  userId: string;
  knowledgeFileIds: string[];
}) {
  const preview = await previewDynamicSchemaEvolution(input);
  if (preview.status === "INVALID_PROPOSAL") {
    return { ...preview, semantic: null, status: "INVALID_PROPOSAL" as const };
  }
  const semantic = await reviewDiscoveredAgainstExistingSchema({
    proposal: preview.discovery.proposal!,
    current: preview.currentSchema,
  });
  return {
    ...preview,
    semantic,
    status: semantic.valid
      ? "NEEDS_HUMAN_SCHEMA_APPROVAL" as const
      : "INVALID_SEMANTIC_REVIEW" as const,
    writesPerformed: false as const,
  };
}
