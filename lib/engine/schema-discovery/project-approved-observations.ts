import type { ApprovedImportMappingPlan } from "./approved-import-mapping";

export type SourceObservation = {
  sourceEntity: string;
  documentId: string;
  evidenceText: string;
  values: Record<string, unknown>;
};

export type ProjectedObservation = {
  targetEntity: string;
  documentId: string;
  evidenceText: string;
  values: Record<string, unknown>;
  fieldSources: Record<string, string>;
};

/** Read-only projection. Never infers values, validates evidence, or persists. */
export function projectApprovedObservations(input: {
  plan: ApprovedImportMappingPlan;
  observations: readonly SourceObservation[];
}): { status: "READY" | "BLOCKED"; mapped: ProjectedObservation[]; issues: string[] } {
  if (input.plan.status !== "READY" || input.plan.issues.length) {
    return { status: "BLOCKED", mapped: [], issues: ["MAPPING_NOT_READY"] };
  }
  if (input.observations.length > 500) {
    return { status: "BLOCKED", mapped: [], issues: ["LIMIT_EXCEEDED"] };
  }
  const entities = new Map(input.plan.entities.map(m => [m.sourceEntity, m.targetEntity]));
  const fields = new Map(input.plan.fields.map(m => [
    m.sourceEntity + "." + m.sourceField, m,
  ]));
  const mapped: ProjectedObservation[] = [];
  const issues: string[] = [];
  input.observations.forEach((observation, index) => {
    const targetEntity = entities.get(observation.sourceEntity);
    if (!targetEntity || !observation.documentId || !observation.evidenceText ||
        !observation.values || typeof observation.values !== "object" ||
        Array.isArray(observation.values)) {
      issues.push("INVALID_OBSERVATION:" + index);
      return;
    }
    const values: Record<string, unknown> = {};
    const fieldSources: Record<string, string> = {};
    let valid = true;
    for (const [sourceField, value] of Object.entries(observation.values)) {
      const mapping = fields.get(observation.sourceEntity + "." + sourceField);
      if (!mapping || mapping.targetEntity !== targetEntity ||
          Object.prototype.hasOwnProperty.call(values, mapping.targetField)) {
        issues.push("UNMAPPED_FIELD:" + index + ":" + sourceField);
        valid = false;
        continue;
      }
      values[mapping.targetField] = value;
      fieldSources[mapping.targetField] = sourceField;
    }
    if (!Object.keys(values).length) {
      issues.push("EMPTY_VALUES:" + index);
      return;
    }
    if (valid) mapped.push({
      targetEntity, documentId: observation.documentId,
      evidenceText: observation.evidenceText, values, fieldSources,
    });
  });
  return {
    status: issues.length ? "BLOCKED" : "READY",
    mapped: issues.length ? [] : mapped,
    issues,
  };
}
