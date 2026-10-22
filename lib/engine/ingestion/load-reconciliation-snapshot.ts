import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { EngineSnapshot, IdentityRules } from "./reconcile-engine-import";

/** Read-only, workspace-scoped snapshot. Identity keys come only from
 * explicitly configured unique Engine fields, never from guessed names. */
export async function loadEngineReconciliationSnapshot(workspaceId: string, db: Prisma.TransactionClient = prisma):
  Promise<{ snapshot: EngineSnapshot; identityRules: IdentityRules }> {
  const [types, definitions, records, links] = await Promise.all([
    db.engine_object_types.findMany({
      where: { workspace_id: workspaceId, status: "active" },
      select: { id: true, key: true, engine_field_definitions: {
        where: { status: "active" },
        select: { key: true, field_type: true, is_unique: true },
      } },
    }),
    db.engine_relation_definitions.findMany({
      where: { workspace_id: workspaceId, status: "active" },
      select: { id: true, key: true, from_object_type_id: true,
        to_object_type_id: true, cardinality: true },
    }),
    db.engine_records.findMany({
      where: { workspace_id: workspaceId },
      select: { id: true, object_type_id: true, values_json: true },
    }),
    db.engine_record_relations.findMany({
      where: { workspace_id: workspaceId },
      select: { relation_definition_id: true, from_record_id: true, to_record_id: true },
    }),
  ]);
  const keyById = new Map(types.map(type => [type.id, type.key]));
  const relationKeyById = new Map(definitions.map(relation => [relation.id, relation.key]));
  const identityRules: IdentityRules = {};
  for (const type of types) {
    const unique = type.engine_field_definitions.filter(field => field.is_unique);
    // Each unique field is individually an identity candidate. Multiple unique
    // fields cannot safely be treated as a composite key without a configured rule.
    if (unique.length === 1) identityRules[type.key] = [unique[0].key];
  }
  const asValues = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
  return {
    identityRules,
    snapshot: {
      entities: types.map(type => ({ id: type.id, key: type.key,
        fields: type.engine_field_definitions.map(field => ({ key: field.key, type: field.field_type })) })),
      relations: definitions.flatMap(relation => {
        const fromEntity = keyById.get(relation.from_object_type_id);
        const toEntity = keyById.get(relation.to_object_type_id);
        return fromEntity && toEntity ? [{
          id: relation.id, key: relation.key, fromEntity, toEntity, cardinality: relation.cardinality,
        }] : [];
      }),
      records: records.flatMap(record => {
        const entityKey = keyById.get(record.object_type_id);
        return entityKey ? [{ id: record.id, entityKey, values: asValues(record.values_json) }] : [];
      }),
      links: links.flatMap(link => {
        const relationKey = relationKeyById.get(link.relation_definition_id);
        return relationKey ? [{ relationKey, fromId: link.from_record_id, toId: link.to_record_id }] : [];
      }),
    },
  };
}
