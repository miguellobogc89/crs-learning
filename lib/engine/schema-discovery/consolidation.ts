import type {
  DiscoveryEvidence, DiscoveredEntity, DiscoveredField, DiscoveredRelation,
  SchemaDiscoveryProposal,
} from "./validation";

export type ConsolidationQuestion = {
  id: string;
  kind: "FIELD_TYPE_CONFLICT" | "FIELD_REQUIRED_CONFLICT" |
    "RELATION_CONFLICT" | "ENTITY_NAME_CONFLICT" | "FIELD_NAME_CONFLICT";
  path: string;
  alternatives: string[];
  evidence: DiscoveryEvidence[];
  blocking: boolean;
};

export type ConsolidationResult = {
  proposal: SchemaDiscoveryProposal;
  questions: ConsolidationQuestion[];
  sourceCount: number;
  status: "READY_FOR_REVIEW" | "NEEDS_CLARIFICATION";
};

function mergeEvidence(a: DiscoveryEvidence[], b: DiscoveryEvidence[]) {
  const seen = new Set<string>();
  return [...a, ...b].filter((e) => {
    const key = JSON.stringify([e.documentId, e.quote]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(values: string[]) {
  return [...new Set(values)];
}

/**
 * Merge already-validated schema proposals by exact stable keys.
 * No fuzzy equivalence, database access, AI or persistence.
 * On incompatible definitions, retain the first proposal as an unapproved
 * placeholder and report all alternatives as blocking questions.
 * Consumers MUST NOT publish the result while blocking questions exist.
 */
export function consolidateSchemaProposals(
  proposals: readonly SchemaDiscoveryProposal[],
): ConsolidationResult {
  if (proposals.length < 1 || proposals.length > 20) {
    throw new Error("Consolidation requires between 1 and 20 validated proposals.");
  }
  const entities = new Map<string, DiscoveredEntity>();
  const relations = new Map<string, DiscoveredRelation>();
  const warnings: string[] = [];
  const questions = new Map<string, ConsolidationQuestion>();

  function question(
    kind: ConsolidationQuestion["kind"], path: string,
    left: string, right: string, evidence: DiscoveryEvidence[],
  ) {
    const id = kind + ":" + path;
    const existing = questions.get(id);
    if (existing) {
      existing.alternatives = unique([...existing.alternatives, right]);
      existing.evidence = mergeEvidence(existing.evidence, evidence);
    } else {
      questions.set(id, {
        id, kind, path, alternatives: unique([left, right]),
        evidence: [...evidence], blocking: true,
      });
    }
  }

  for (const proposal of proposals) {
    warnings.push(...proposal.warnings);
    for (const entity of proposal.entities) {
      const existing = entities.get(entity.key);
      if (!existing) {
        entities.set(entity.key, {
          ...entity,
          fields: entity.fields.map((field) => ({ ...field, evidence: [...field.evidence] })),
          evidence: [...entity.evidence],
        });
        continue;
      }
      const entityEvidence = mergeEvidence(existing.evidence, entity.evidence);
      if (existing.name !== entity.name) {
        question("ENTITY_NAME_CONFLICT", `entities.${entity.key}.name`,
          existing.name, entity.name, entityEvidence);
      }
      existing.evidence = entityEvidence;
      if (!existing.description && entity.description) existing.description = entity.description;
      const fields = new Map(existing.fields.map((field) => [field.key, field]));
      for (const field of entity.fields) {
        const prior = fields.get(field.key);
        if (!prior) {
          const copy: DiscoveredField = { ...field, evidence: [...field.evidence] };
          existing.fields.push(copy);
          fields.set(field.key, copy);
          continue;
        }
        const evidence = mergeEvidence(prior.evidence, field.evidence);
        const path = `entities.${entity.key}.fields.${field.key}`;
        if (prior.name !== field.name) {
          question("FIELD_NAME_CONFLICT", path + ".name", prior.name, field.name, evidence);
        }
        if (prior.type !== field.type) {
          question("FIELD_TYPE_CONFLICT", path + ".type", prior.type, field.type, evidence);
        }
        if (prior.required !== field.required) {
          question("FIELD_REQUIRED_CONFLICT", path + ".required",
            String(prior.required), String(field.required), evidence);
        }
        prior.evidence = evidence;
      }
    }

    for (const relation of proposal.relations) {
      const existing = relations.get(relation.key);
      if (!existing) {
        relations.set(relation.key, { ...relation, evidence: [...relation.evidence] });
        continue;
      }
      const evidence = mergeEvidence(existing.evidence, relation.evidence);
      const signature = (r: DiscoveredRelation) =>
        JSON.stringify([r.fromEntity, r.toEntity, r.cardinality]);
      if (signature(existing) !== signature(relation)) {
        question("RELATION_CONFLICT", `relations.${relation.key}`,
          signature(existing), signature(relation), evidence);
      }
      existing.evidence = evidence;
    }
  }

  const pending = [...questions.values()];
  return {
    proposal: {
      entities: [...entities.values()],
      relations: [...relations.values()],
      warnings: unique(warnings),
    },
    questions: pending,
    sourceCount: proposals.length,
    status: pending.length ? "NEEDS_CLARIFICATION" : "READY_FOR_REVIEW",
  };
}
