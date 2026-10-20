/**
 * CRS schema discovery: validate AI-proposed architecture before any persistence.
 * No database access, writes or model calls. Proposals remain review-only.
 */
export type DiscoveryEvidence = { documentId: string; quote: string };
export type DiscoveredField = {
  key: string; name: string;
  type: "text" | "long_text" | "integer" | "decimal" | "boolean" | "date" | "datetime" | "enum";
  required: boolean;
  evidence: DiscoveryEvidence[];
};
export type DiscoveredEntity = {
  key: string; name: string; description: string;
  fields: DiscoveredField[];
  evidence: DiscoveryEvidence[];
};
export type DiscoveredRelation = {
  key: string;
  fromEntity: string; toEntity: string;
  cardinality: "one_to_one" | "one_to_many" | "many_to_many";
  description: string;
  evidence: DiscoveryEvidence[];
};
export type SchemaDiscoveryProposal = {
  entities: DiscoveredEntity[];
  relations: DiscoveredRelation[];
  warnings: string[];
};
export type SchemaDiscoveryIssue = {
  path: string;
  code: "INVALID_SHAPE" | "INVALID_KEY" | "DUPLICATE_KEY" |
    "INVALID_FIELD_TYPE" | "INVALID_CARDINALITY" | "UNKNOWN_ENTITY" |
    "MISSING_EVIDENCE" | "UNKNOWN_DOCUMENT" | "WORKSPACE_MISMATCH" |
    "EVIDENCE_NOT_IN_DOCUMENT" | "LIMIT_EXCEEDED";
};
export type DiscoveryDocument = {
  id: string; workspaceId: string; extractedText: string;
};
const KEY = /^[a-z][a-z0-9_]*$/;
const TYPES = new Set(["text", "long_text", "integer", "decimal", "boolean", "date", "datetime", "enum"]);
const CARDINALITIES = new Set(["one_to_one", "one_to_many", "many_to_many"]);
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Validates model output defensively; callers must authorize document reads. */
export function validateSchemaDiscovery(input: {
  workspaceId: string;
  documents: readonly DiscoveryDocument[];
  proposal: unknown;
}): { valid: boolean; proposal: SchemaDiscoveryProposal | null; issues: SchemaDiscoveryIssue[] } {
  const issues: SchemaDiscoveryIssue[] = [];
  const issue = (path: string, code: SchemaDiscoveryIssue["code"]) => issues.push({ path, code });
  const docs = new Map(input.documents.map((d) => [d.id, d]));
  const evidence = (value: unknown, path: string) => {
    if (!Array.isArray(value) || value.length === 0) {
      issue(path, "MISSING_EVIDENCE");
      return;
    }
    if (value.length > 20) issue(path, "LIMIT_EXCEEDED");
    for (const [index, item] of value.entries()) {
      const p = `${path}[${index}]`;
      if (!object(item) || !string(item.documentId) || !string(item.quote)) {
        issue(p, "INVALID_SHAPE"); continue;
      }
      const doc = docs.get(item.documentId);
      if (!doc) issue(p, "UNKNOWN_DOCUMENT");
      else if (doc.workspaceId !== input.workspaceId) issue(p, "WORKSPACE_MISMATCH");
      else if (!doc.extractedText.includes(item.quote)) issue(p, "EVIDENCE_NOT_IN_DOCUMENT");
    }
  };
  if (!object(input.proposal) || !Array.isArray(input.proposal.entities) ||
      !Array.isArray(input.proposal.relations) || !Array.isArray(input.proposal.warnings) ||
      !input.proposal.warnings.every((w) => typeof w === "string")) {
    return { valid: false, proposal: null, issues: [{ path: "$", code: "INVALID_SHAPE" }] };
  }
  const { entities, relations, warnings } = input.proposal;
  if (entities.length > 50 || relations.length > 200 || warnings.length > 100) issue("$", "LIMIT_EXCEEDED");
  const keys = new Set<string>();
  for (const [i, entity] of entities.entries()) {
    const p = `entities[${i}]`;
    if (!object(entity) || !string(entity.key) || !string(entity.name) ||
        typeof entity.description !== "string" || !Array.isArray(entity.fields)) {
      issue(p, "INVALID_SHAPE"); continue;
    }
    if (!KEY.test(entity.key)) issue(p + ".key", "INVALID_KEY");
    if (keys.has(entity.key)) issue(p + ".key", "DUPLICATE_KEY");
    keys.add(entity.key);
    evidence(entity.evidence, p + ".evidence");
    if (entity.fields.length > 100) issue(p + ".fields", "LIMIT_EXCEEDED");
    const fieldKeys = new Set<string>();
    for (const [j, field] of entity.fields.entries()) {
      const f = `${p}.fields[${j}]`;
      if (!object(field) || !string(field.key) || !string(field.name) ||
          typeof field.required !== "boolean") {
        issue(f, "INVALID_SHAPE"); continue;
      }
      if (!KEY.test(field.key)) issue(f + ".key", "INVALID_KEY");
      if (fieldKeys.has(field.key)) issue(f + ".key", "DUPLICATE_KEY");
      fieldKeys.add(field.key);
      if (!TYPES.has(field.type as string)) issue(f + ".type", "INVALID_FIELD_TYPE");
      evidence(field.evidence, f + ".evidence");
    }
  }
  const relationKeys = new Set<string>();
  for (const [i, relation] of relations.entries()) {
    const p = `relations[${i}]`;
    if (!object(relation) || !string(relation.key) ||
        !string(relation.fromEntity) || !string(relation.toEntity) ||
        typeof relation.description !== "string") {
      issue(p, "INVALID_SHAPE"); continue;
    }
    if (!KEY.test(relation.key)) issue(p + ".key", "INVALID_KEY");
    if (relationKeys.has(relation.key)) issue(p + ".key", "DUPLICATE_KEY");
    relationKeys.add(relation.key);
    if (!keys.has(relation.fromEntity) || !keys.has(relation.toEntity)) issue(p, "UNKNOWN_ENTITY");
    if (!CARDINALITIES.has(relation.cardinality as string)) issue(p + ".cardinality", "INVALID_CARDINALITY");
    evidence(relation.evidence, p + ".evidence");
  }
  return {
    valid: issues.length === 0,
    proposal: issues.length === 0 ? input.proposal as SchemaDiscoveryProposal : null,
    issues,
  };
}
