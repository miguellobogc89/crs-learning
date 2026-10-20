import type { SchemaDiscoveryProposal } from "./validation";

export type CurrentSchema = {
  entities: readonly {
    key: string;
    fields: readonly { key: string; type: string }[];
  }[];
  relations: readonly {
    key: string; fromEntity: string; toEntity: string; cardinality: string;
  }[];
};

export type SchemaChangeSuggestion = {
  kind: "NEW_ENTITY" | "NEW_FIELD" | "NEW_RELATION" |
    "REVIEW_FIELD_TYPE" | "REVIEW_RELATION" | "REVIEW_SEMANTICS";
  path: string;
  reason: string;
  evidence: readonly { documentId: string; quote: string }[];
};

/**
 * Conservative comparison of an already evidence-validated discovery against
 * an existing workspace schema. No mutations or automatic approvals.
 *
 * Exact keys are only a first-pass signal, NOT semantic equivalence.
 * In particular, unfamiliar entity/field names always require semantic review.
 */
export function compareDiscoveredSchema(input: {
  proposal: SchemaDiscoveryProposal;
  current: CurrentSchema;
}): {
  reused: string[];
  suggested: SchemaChangeSuggestion[];
  status: "NO_CHANGES" | "REVIEW_REQUIRED";
} {
  const { proposal, current } = input;
  const entities = new Map(current.entities.map((e) => [e.key, e]));
  const relations = new Map(current.relations.map((r) => [r.key, r]));
  if (entities.size !== current.entities.length ||
      relations.size !== current.relations.length) {
    throw new Error("Ambiguous existing schema keys.");
  }
  const reused: string[] = [];
  const suggested: SchemaChangeSuggestion[] = [];
  for (const entity of proposal.entities) {
    const existing = entities.get(entity.key);
    if (!existing) {
      suggested.push({
        kind: "NEW_ENTITY", path: `entities.${entity.key}`,
        reason: "No exact key match. Confirm this is not an existing semantic equivalent.",
        evidence: entity.evidence,
      });
      continue;
    }
    reused.push(`entities.${entity.key}`);
    const fields = new Map(existing.fields.map((f) => [f.key, f]));
    if (fields.size !== existing.fields.length) {
      throw new Error("Ambiguous existing field keys.");
    }
    for (const field of entity.fields) {
      const path = `entities.${entity.key}.fields.${field.key}`;
      const prior = fields.get(field.key);
      if (!prior) {
        suggested.push({
          kind: "NEW_FIELD", path,
          reason: "No exact field key match. Confirm semantic ownership and possible aliases.",
          evidence: field.evidence,
        });
      } else if (prior.type !== field.type) {
        suggested.push({
          kind: "REVIEW_FIELD_TYPE", path,
          reason: `Existing type ${prior.type} differs from proposed ${field.type}.`,
          evidence: field.evidence,
        });
      } else {
        reused.push(path);
      }
    }
  }
  for (const relation of proposal.relations) {
    const path = `relations.${relation.key}`;
    const prior = relations.get(relation.key);
    if (!prior) {
      suggested.push({
        kind: "NEW_RELATION", path,
        reason: "No exact relation key match. Confirm endpoints, meaning and cardinality.",
        evidence: relation.evidence,
      });
    } else if (prior.fromEntity !== relation.fromEntity ||
               prior.toEntity !== relation.toEntity ||
               prior.cardinality !== relation.cardinality) {
      suggested.push({
        kind: "REVIEW_RELATION", path,
        reason: "Existing relation endpoints or cardinality differ.",
        evidence: relation.evidence,
      });
    } else {
      reused.push(path);
    }
  }
  return {
    reused, suggested,
    status: suggested.length ? "REVIEW_REQUIRED" : "NO_CHANGES",
  };
}
