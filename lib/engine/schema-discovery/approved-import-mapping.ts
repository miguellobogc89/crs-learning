import type { SchemaDiscoveryProposal } from "./validation";
import type { CurrentSchema } from "./compare-existing";
import type { ExistingSchemaSemanticCandidate } from "./existing-semantic-review";

/**
 * Pure, read-only mapping of discovered keys onto EXISTING schema.
 * Approval is explicit per entity and field; AI candidates are hints only.
 * This plan never creates definitions, records, or relations.
 */
export type ApprovedEntityMapping = { sourceEntity: string; targetEntity: string };
export type ApprovedFieldMapping = {
  sourceEntity: string; sourceField: string;
  targetEntity: string; targetField: string;
};
export type ApprovedImportMappingPlan = {
  status: "READY" | "BLOCKED";
  entities: ApprovedEntityMapping[];
  fields: ApprovedFieldMapping[];
  issues: string[];
};

export function planApprovedImportMapping(input: {
  proposal: SchemaDiscoveryProposal;
  current: CurrentSchema;
  semanticCandidates: readonly ExistingSchemaSemanticCandidate[];
  approvedEntities: readonly ApprovedEntityMapping[];
  approvedFields: readonly ApprovedFieldMapping[];
}): ApprovedImportMappingPlan {
  const issues: string[] = [];
  const entities: ApprovedEntityMapping[] = [];
  const fields: ApprovedFieldMapping[] = [];
  const sources = new Map(input.proposal.entities.map(e => [e.key, e]));
  const targets = new Map(input.current.entities.map(e => [e.key, e]));
  const entityApprovals = new Map<string, ApprovedEntityMapping>();
  const fieldApprovals = new Map<string, ApprovedFieldMapping>();
  const usedTargets = new Set<string>();
  for (const mapping of input.approvedEntities) {
    if (entityApprovals.has(mapping.sourceEntity)) {
      issues.push(`DUPLICATE_ENTITY_APPROVAL:${mapping.sourceEntity}`);
    } else entityApprovals.set(mapping.sourceEntity, mapping);
    if (!sources.has(mapping.sourceEntity) || !targets.has(mapping.targetEntity))
      issues.push(`UNKNOWN_ENTITY:${mapping.sourceEntity}:${mapping.targetEntity}`);
  }
  for (const mapping of input.approvedFields) {
    const key = `${mapping.sourceEntity}.${mapping.sourceField}`;
    if (fieldApprovals.has(key)) issues.push(`DUPLICATE_FIELD_APPROVAL:${key}`);
    else fieldApprovals.set(key, mapping);
  }
  for (const source of input.proposal.entities) {
    const entityMapping = entityApprovals.get(source.key);
    if (!entityMapping) {
      issues.push(`UNAPPROVED_ENTITY:${source.key}`);
      continue;
    }
    const target = targets.get(entityMapping.targetEntity);
    if (!target) continue;
    // An explicit approval is needed even for identical keys.
    entities.push(entityMapping);
    for (const field of source.fields) {
      const key = `${source.key}.${field.key}`;
      const mapping = fieldApprovals.get(key);
      if (!mapping) { issues.push(`UNAPPROVED_FIELD:${key}`); continue; }
      if (mapping.targetEntity !== entityMapping.targetEntity ||
          mapping.sourceEntity !== source.key) {
        issues.push(`ENTITY_MISMATCH:${key}`); continue;
      }
      const targetField = target.fields.find(f => f.key === mapping.targetField);
      if (!targetField) { issues.push(`UNKNOWN_TARGET_FIELD:${key}`); continue; }
      if (targetField.type !== field.type) {
        issues.push(`TYPE_MISMATCH:${key}:${field.type}:${targetField.type}`); continue;
      }
      // Reject AI-flagged uncertainty or distinctness on the exact proposed pair.
      const conflicts = input.semanticCandidates.filter(c =>
        c.sourceEntity === source.key && c.sourceField === field.key &&
        c.targetEntity === mapping.targetEntity && c.targetField === mapping.targetField &&
        c.decision !== "POSSIBLE_EQUIVALENCE");
      if (conflicts.length) { issues.push(`SEMANTIC_CONFLICT:${key}`); continue; }
      const targetKey = `${mapping.targetEntity}.${mapping.targetField}`;
      if (usedTargets.has(targetKey)) {
        issues.push(`TARGET_FIELD_COLLISION:${targetKey}`); continue;
      }
      usedTargets.add(targetKey);
      fields.push(mapping);
    }
  }
  for (const mapping of input.approvedFields) {
    const source = sources.get(mapping.sourceEntity);
    if (!source || !source.fields.some(f => f.key === mapping.sourceField))
      issues.push(`UNKNOWN_SOURCE_FIELD:${mapping.sourceEntity}.${mapping.sourceField}`);
  }
  return { status: issues.length ? "BLOCKED" : "READY", entities, fields, issues };
}
