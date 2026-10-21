import type { SchemaSimilarity } from "./compare-structures";

/** Read-only decision used before any Engine schema writes. */
export function decideSchemaCreation(
  proposedKey: string,
  existingKeys: readonly string[],
  similarities: readonly SchemaSimilarity[],
): { action: "reuse" | "create" | "review"; candidates: string[] } {
  if (existingKeys.includes(proposedKey)) return { action: "reuse", candidates: [] };
  const candidates = [...new Set(similarities.filter(match =>
    match.proposedKey === proposedKey && match.compatible)
    .map(match => match.existingKey))].sort();
  return candidates.length
    ? { action: "review", candidates }
    : { action: "create", candidates: [] };
}
