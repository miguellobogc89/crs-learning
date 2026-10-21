import type { SchemaDiscoveryProposal } from "./validation";

export type ExistingSchemaShape = {
  key: string;
  fields: readonly { key: string; type: string }[];
};
export type SchemaSimilarity = {
  proposedKey: string;
  existingKey: string;
  sharedDistinctiveFields: string[];
  compatible: boolean;
};

/**
 * Pure structural comparison for review. Structural similarity is not proof
 * of semantic equivalence and must never trigger an automatic rename.
 */
const GENERIC = new Set([
  "id", "name", "nombre", "title", "titulo", "description",
  "descripcion", "notes", "notas", "status", "estado",
  "created_at", "updated_at", "date", "fecha", "value", "valor",
]);

export function compareDiscoveredStructures(
  proposal: SchemaDiscoveryProposal,
  existing: readonly ExistingSchemaShape[],
): SchemaSimilarity[] {
  const results: SchemaSimilarity[] = [];
  for (const entity of proposal.entities) {
    const proposedFields = new Map(entity.fields.map(field => [field.key, field.type]));
    for (const stored of existing) {
      if (entity.key === stored.key) continue;
      const storedFields = new Map(stored.fields.map(field => [field.key, field.type]));
      const shared = [...proposedFields.keys()].filter(key =>
        !GENERIC.has(key) && storedFields.has(key)).sort();
      if (shared.length < 2) continue;
      const conflicting = [...proposedFields.entries()].some(([key, type]) =>
        storedFields.has(key) && storedFields.get(key) !== type);
      results.push({ proposedKey: entity.key, existingKey: stored.key,
        sharedDistinctiveFields: shared, compatible: !conflicting });
    }
  }
  return results.sort((a, b) =>
    a.proposedKey.localeCompare(b.proposedKey) ||
    a.existingKey.localeCompare(b.existingKey));
}
