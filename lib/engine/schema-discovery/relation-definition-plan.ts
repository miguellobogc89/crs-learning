import type { DiscoveredRelation } from "./validation";

export type RelationDefinitionCandidate = Pick<
  DiscoveredRelation, "key" | "fromEntity" | "toEntity" | "cardinality" | "description"
>;
export type RelationDefinitionIssue = {
  key: string;
  code: "INVALID_SHAPE" | "DUPLICATE_KEY" | "UNKNOWN_FROM" |
    "UNKNOWN_TO" | "EXISTING_KEY" | "INVALID_CARDINALITY";
};
export type RelationDefinitionPlan = {
  valid: boolean;
  ready: RelationDefinitionCandidate[];
  issues: RelationDefinitionIssue[];
};

/** Pure, workspace-agnostic structural validation. Caller must scope the type lookup. */
export function planRelationDefinitions(input: {
  relations: readonly RelationDefinitionCandidate[];
  existingTypeKeys: readonly string[];
  existingRelationKeys: readonly string[];
}): RelationDefinitionPlan {
  const issues: RelationDefinitionIssue[] = [];
  const ready: RelationDefinitionCandidate[] = [];
  if (!Array.isArray(input.relations) || input.relations.length > 200 ||
      !Array.isArray(input.existingTypeKeys) || !Array.isArray(input.existingRelationKeys)) {
    return { valid: false, ready: [], issues: [{ key: "*", code: "INVALID_SHAPE" }] };
  }
  const types = new Set(input.existingTypeKeys);
  const existing = new Set(input.existingRelationKeys);
  const seen = new Set<string>();
  const validKey = (value: unknown) => typeof value === "string" &&
    /^[a-z][a-z0-9_]*$/.test(value) && value.length <= 80;
  for (const relation of input.relations) {
    const key = relation?.key ?? "*";
    if (!relation || !validKey(key) || !validKey(relation.fromEntity) ||
        !validKey(relation.toEntity) || typeof relation.description !== "string" ||
        relation.description.length > 2000) {
      issues.push({ key, code: "INVALID_SHAPE" }); continue;
    }
    if (seen.has(key)) { issues.push({ key, code: "DUPLICATE_KEY" }); continue; }
    seen.add(key);
    if (existing.has(key)) { issues.push({ key, code: "EXISTING_KEY" }); continue; }
    if (!types.has(relation.fromEntity)) { issues.push({ key, code: "UNKNOWN_FROM" }); continue; }
    if (!types.has(relation.toEntity)) { issues.push({ key, code: "UNKNOWN_TO" }); continue; }
    if (!["one_to_one", "one_to_many", "many_to_many"].includes(relation.cardinality)) {
      issues.push({ key, code: "INVALID_CARDINALITY" }); continue;
    }
    ready.push(relation);
  }
  return { valid: issues.length === 0, ready: issues.length === 0 ? ready : [], issues };
}
