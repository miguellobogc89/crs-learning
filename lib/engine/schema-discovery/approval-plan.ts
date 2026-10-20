import type { SchemaDiscoveryProposal, DiscoveredEntity } from "./validation";
import type { SemanticMatchReview } from "./semantic-review";

export type DefinitionApprovalIssue = {
  entityKey: string;
  code: "NOT_SELECTED" | "SEMANTIC_REVIEW_REQUIRED" | "EXISTING_KEY" |
    "UNSUPPORTED_ENUM" | "INVALID_DEFINITION" | "INVALID_REVIEW";
};
export type DefinitionApprovalPlan = {
  status: "READY_FOR_APPROVAL" | "NEEDS_CLARIFICATION" | "NOTHING_SELECTED";
  entities: DiscoveredEntity[];
  deferred: DefinitionApprovalIssue[];
  relationsForLaterReview: SchemaDiscoveryProposal["relations"];
};

/**
 * Pure approval plan for AI-discovered enterprise definitions.
 * Does not create schema, merge entities, or publish data.
 *
 * Selection is explicit. All ambiguous semantic pairs block both entities
 * until reviewed. Enum options cannot be invented from evidence, so those
 * entities are deferred until options are explicitly defined.
 */
export function planDiscoveredDefinitionApproval(input: {
  proposal: SchemaDiscoveryProposal;
  semantic: SemanticMatchReview;
  selectedEntityKeys: readonly string[];
  existingEntityKeys: readonly string[];
}): DefinitionApprovalPlan {
  const { proposal, semantic, selectedEntityKeys, existingEntityKeys } = input;
  if (!semantic.valid) {
    return {
      status: "NEEDS_CLARIFICATION", entities: [],
      deferred: proposal.entities.map((entity) => ({
        entityKey: entity.key, code: "INVALID_REVIEW" as const,
      })),
      relationsForLaterReview: [...proposal.relations],
    };
  }
  const selected = new Set(selectedEntityKeys);
  const existing = new Set(existingEntityKeys);
  const ambiguous = new Set(semantic.candidates.filter((candidate) => candidate.requiresReview)
    .flatMap((candidate) => [candidate.leftEntity, candidate.rightEntity]));
  const deferred: DefinitionApprovalIssue[] = [];
  const entities: DiscoveredEntity[] = [];
  for (const entity of proposal.entities) {
    let code: DefinitionApprovalIssue["code"] | undefined;
    if (!selected.has(entity.key)) code = "NOT_SELECTED";
    else if (ambiguous.has(entity.key)) code = "SEMANTIC_REVIEW_REQUIRED";
    else if (existing.has(entity.key)) code = "EXISTING_KEY";
    else if (!entity.fields.length || entity.fields.some((field) =>
      field.key.length > 80 || field.name.length > 160 ||
      !field.name.trim() || field.type === "enum")) {
      code = entity.fields.some((field) => field.type === "enum")
        ? "UNSUPPORTED_ENUM" : "INVALID_DEFINITION";
    } else if (entity.key.length > 80 || entity.name.length > 160 || !entity.name.trim()) {
      code = "INVALID_DEFINITION";
    }
    if (code) deferred.push({ entityKey: entity.key, code });
    else entities.push(entity);
  }
  return {
    status: entities.length === 0 && selected.size === 0 ? "NOTHING_SELECTED"
      : deferred.some((item) => item.code !== "NOT_SELECTED") ? "NEEDS_CLARIFICATION"
      : "READY_FOR_APPROVAL",
    entities,
    deferred,
    // Relationships are not persisted until an Engine relationship model exists.
    relationsForLaterReview: [...proposal.relations],
  };
}
