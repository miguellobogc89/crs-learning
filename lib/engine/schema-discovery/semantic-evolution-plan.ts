import type { SchemaDiscoveryProposal } from "./validation";
import type { CurrentSchema, SchemaChangeSuggestion } from "./compare-existing";
import type { ExistingSchemaSemanticCandidate } from "./existing-semantic-review";

export type SemanticEvolutionDecision = {
  kind: "REUSE_EXACT_KEY" | "POSSIBLE_ENTITY_ALIAS" | "NEW_ENTITY_REVIEW" |
    "NEW_FIELD_REVIEW" | "NEW_RELATION_REVIEW" | "OTHER_SCHEMA_REVIEW" |\n    "UNCERTAIN_ENTITY_MATCH" | "POSSIBLE_FIELD_ALIAS" | "UNCERTAIN_FIELD_MATCH";
  source: string;
  target?: string;
  reason: string;
  requiresApproval: boolean;
};

/**
 * Converts validated semantic hints to safe, business-readable review
 * decisions. Never auto-merges, renames, maps or creates schema.
 * Missing AI suggestions are NOT evidence of distinctness.
 */
export function planSemanticSchemaEvolution(input: {
  proposal: SchemaDiscoveryProposal;
  current: CurrentSchema;
  suggested: readonly SchemaChangeSuggestion[];
  candidates: readonly ExistingSchemaSemanticCandidate[];
}): SemanticEvolutionDecision[] {
  const existing = new Set(input.current.entities.map(e => e.key));
  const result: SemanticEvolutionDecision[] = [];
  for (const entity of input.proposal.entities) {
    if (existing.has(entity.key)) {
      result.push({
        kind: "REUSE_EXACT_KEY", source: entity.key,
        reason: "Existing key matches; confirm the business meaning before import.",
        requiresApproval: true,
      });
      continue;
    }
    const comparisons = input.candidates.filter(c =>
      c.sourceEntity === entity.key && c.sourceField === null &&
      c.targetField === null && c.decision !== "DISTINCT");
    if (comparisons.length) {
      for (const candidate of comparisons) result.push({
        kind: candidate.decision === "POSSIBLE_EQUIVALENCE"
          ? "POSSIBLE_ENTITY_ALIAS" : "UNCERTAIN_ENTITY_MATCH",
        source: entity.key, target: candidate.targetEntity,
        reason: candidate.reason, requiresApproval: true,
      });
    } else {
      result.push({
        kind: "NEW_ENTITY_REVIEW", source: entity.key,
        reason: "No confirmed existing equivalent; absence of AI suggestions is not proof.",
        requiresApproval: true,
      });
    }
  }
  for (const suggestion of input.suggested) {
    if (suggestion.kind === "NEW_ENTITY") continue;
    if (suggestion.kind === "NEW_FIELD") {
      const matching = input.candidates.filter(candidate =>
        candidate.sourceField !== null && candidate.targetField !== null &&
        candidate.decision !== "DISTINCT" &&
        suggestion.path === `entities.${candidate.sourceEntity}.fields.${candidate.sourceField}`);
      if (matching.length) {
        for (const candidate of matching) result.push({
          kind: candidate.decision === "POSSIBLE_EQUIVALENCE"
            ? "POSSIBLE_FIELD_ALIAS" : "UNCERTAIN_FIELD_MATCH",
          source: suggestion.path,
          target: `entities.${candidate.targetEntity}.fields.${candidate.targetField}`,
          reason: candidate.reason, requiresApproval: true,
        });
        continue;
      }
    }
    result.push({
      kind: suggestion.kind === "NEW_FIELD" ? "NEW_FIELD_REVIEW"
        : suggestion.kind === "NEW_RELATION" ? "NEW_RELATION_REVIEW"
        : "OTHER_SCHEMA_REVIEW",
      source: suggestion.path,
      reason: suggestion.reason,
      requiresApproval: true,
    });
  }
  return result;
}
