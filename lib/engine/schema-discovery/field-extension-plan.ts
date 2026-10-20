import type { SchemaDiscoveryProposal, DiscoveredField } from "./validation";
import type { CurrentSchema } from "./compare-existing";
import type { ExistingSchemaSemanticCandidate } from "./existing-semantic-review";

export type FieldExtensionPlan = {
  status: "READY_FOR_APPROVAL" | "NEEDS_CLARIFICATION";
  additions: Array<{ entityKey: string; field: DiscoveredField }>;
  deferred: Array<{ entityKey: string; fieldKey: string; reason: string }>;
};

/**
 * Pure plan for adding fields to an existing logical entity.
 * No persistence. Does not assume that same-key entities are semantically
 * equivalent; caller must explicitly approve entity ownership.
 * Any possible alias/uncertainty blocks the field until resolved.
 */
export function planExistingFieldExtensions(input: {
  proposal: SchemaDiscoveryProposal;
  current: CurrentSchema;
  approvedEntityKeys: readonly string[];
  semanticCandidates: readonly ExistingSchemaSemanticCandidate[];
}): FieldExtensionPlan {
  const existing = new Map(input.current.entities.map(e => [e.key, e]));
  const approved = new Set(input.approvedEntityKeys);
  const additions: FieldExtensionPlan["additions"] = [];
  const deferred: FieldExtensionPlan["deferred"] = [];
  if (approved.size !== input.approvedEntityKeys.length ||
      input.approvedEntityKeys.some(key => !existing.has(key) ||
        !input.proposal.entities.some(entity => entity.key === key))) {
    throw new Error("Approved entity keys must be distinct and exist in both schemas.");
  }
  for (const entity of input.proposal.entities) {
    if (!approved.has(entity.key)) continue;
    const current = existing.get(entity.key)!;
    const fields = new Map(current.fields.map(f => [f.key, f]));
    for (const field of entity.fields) {
      const prior = fields.get(field.key);
      if (prior) {
        if (prior.type !== field.type) {
          deferred.push({ entityKey: entity.key, fieldKey: field.key, reason: "TYPE_CONFLICT" });
        }
        continue;
      }
      const related = input.semanticCandidates.filter(c =>
        c.sourceEntity === entity.key &&
        (c.sourceField === field.key || c.sourceField === null) &&
        c.decision !== "DISTINCT");
      let reason: string | null = null;
      if (related.length) reason = "POSSIBLE_ALIAS_OR_ENTITY_MISMATCH";
      else if (field.type === "enum") reason = "ENUM_REQUIRES_OPTIONS";
      else if (field.required) reason = "NEW_FIELD_CANNOT_BE_REQUIRED_ON_EXISTING_RECORDS";
      else if (field.key.length > 80 || field.name.length > 160 ||
               !field.name.trim()) reason = "INVALID_FIELD";
      if (reason) deferred.push({ entityKey: entity.key, fieldKey: field.key, reason });
      else additions.push({ entityKey: entity.key, field });
    }
  }
  return {
    status: deferred.length ? "NEEDS_CLARIFICATION" : "READY_FOR_APPROVAL",
    additions, deferred,
  };
}
