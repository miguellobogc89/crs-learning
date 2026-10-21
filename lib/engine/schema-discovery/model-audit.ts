import type { SchemaDiscoveryProposal } from "./validation";

export type ModelAudit = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

/**
 * Provider-independent structural audit. It does not guess domain semantics,
 * mutate data, or equate coincidentally matching values with foreign keys.
 */
export function auditDiscoveredModel(
  schema: SchemaDiscoveryProposal,
  rows: readonly { entity: string; values: Record<string, unknown> }[],
  links: readonly { fromRow: number; toRow: number; relationKey: string }[],
): ModelAudit {
  const errors: string[] = [];
  const warnings: string[] = [];
  const types = new Map(schema.entities.map(entity => [entity.key, entity]));
  const relations = new Map(schema.relations.map(relation => [relation.key, relation]));
  const normalize = (value: unknown) => typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es")
    : JSON.stringify(value);

  for (const [i, row] of rows.entries()) {
    const type = types.get(row.entity);
    if (!type) {
      errors.push(`Row ${i}: unknown entity ${row.entity}.`);
      continue;
    }
    for (const field of type.fields) {
      if (field.required && (row.values[field.key] === undefined ||
          row.values[field.key] === null || row.values[field.key] === "")) {
        warnings.push(`Row ${i}: missing required field ${row.entity}.${field.key}.`);
      }
    }
  }

  // Exact duplicate snapshots are suspicious but not proof of equal identity.
  for (const type of schema.entities) {
    const seen = new Map<string, number>();
    for (const [i, row] of rows.entries()) {
      if (row.entity !== type.key) continue;
      const fingerprint = JSON.stringify(Object.entries(row.values)
        .map(([key, value]) => [key, normalize(value)])
        .sort(([a], [b]) => String(a).localeCompare(String(b))));
      const previous = seen.get(fingerprint);
      if (previous !== undefined)
        warnings.push(`Rows ${previous} and ${i}: identical ${type.key} values; review identity and reuse.`);
      else seen.set(fingerprint, i);
    }
  }

  const seenLinks = new Set<string>();
  for (const [i, link] of links.entries()) {
    const definition = relations.get(link.relationKey);
    const from = rows[link.fromRow];
    const to = rows[link.toRow];
    if (!definition || !from || !to ||
        from.entity !== definition.fromEntity || to.entity !== definition.toEntity) {
      errors.push(`Link ${i}: missing or incompatible endpoints.`);
      continue;
    }
    const key = JSON.stringify([link.relationKey, link.fromRow, link.toRow]);
    if (seenLinks.has(key)) warnings.push(`Link ${i}: duplicate relation.`);
    seenLinks.add(key);
  }
  return { valid: errors.length === 0, errors, warnings };
}
