/**
 * Batch-level view of verified extractions: which occurrences are the same
 * real-world record (by the identity declared in the schema), what the schema
 * is actually supported by, and whether reusable labels leak private values.
 * Pure: no database, no model.
 */
import { identityToken, normalizeEvidenceText } from "./evidence";
import { recordIdentity, type ExtractedLink, type ExtractedRecord } from "./extraction";
import { identityParentRelation, type PreviewSchema } from "./schema";

export type ReconcileDocument = { segmentId: string; fileName: string; records: ExtractedRecord[]; links: ExtractedLink[] };
export type IdentityCluster = {
  entity: string;
  key: string;
  identity: Record<string, string>;
  label: string;
  occurrences: Array<{ segmentId: string; fileName: string; ref: string; roles: string[] }>;
  conflicts: Array<{ field: string; values: Array<{ value: string; segmentId: string; fileName: string }> }>;
  unresolved: boolean;
};
export type SchemaSupport = {
  entities: Record<string, number>;
  fields: Record<string, number>;
  relations: Record<string, number>;
  unsupported: { entities: string[]; fields: string[]; relations: string[] };
};
export type LabelIssue = { code: "PRIVATE_VALUE_IN_LABEL"; path: string; message: string };

const LABEL_FIELDS = ["legal_name", "name", "nombre", "razon_social", "company_name", "business_name", "title", "titulo"];

function clusterKey(schema: PreviewSchema, document: ReconcileDocument, record: ExtractedRecord, seen = new Set<string>()): string | null {
  const entity = schema.entities.find(candidate => candidate.key === record.entity)!;
  const own = recordIdentity(schema, record);
  if (!own) return null;
  const scope = identityParentRelation(entity);
  if (!scope) return own;
  if (seen.has(record.ref)) return null;
  seen.add(record.ref);
  const parentLink = document.links.find(link => link.relation === scope && link.to === record.ref);
  const parent = parentLink && document.records.find(candidate => candidate.ref === parentLink.from);
  const parentKey = parent ? clusterKey(schema, document, parent, seen) : null;
  // A line is only the same as a line of the SAME invoice; an invoice number only within its issuer.
  return parentKey ? parentKey + "/" + own : null;
}

export function reconcileBatch(schema: PreviewSchema, documents: ReconcileDocument[]): IdentityCluster[] {
  const clusters = new Map<string, IdentityCluster>();
  for (const document of documents) {
    for (const record of document.records) {
      const entity = schema.entities.find(candidate => candidate.key === record.entity);
      if (!entity) continue;
      const resolved = clusterKey(schema, document, record);
      const key = resolved ?? `unresolved:${document.segmentId}:${record.ref}`;
      const roles = document.links.filter(link => link.from === record.ref || link.to === record.ref)
        .filter(link => schema.relations.find(relation => relation.key === link.relation)?.roleEvidenceRequired && link.from === record.ref)
        .map(link => schema.relations.find(relation => relation.key === link.relation)!.name);
      let cluster = clusters.get(key);
      if (!cluster) {
        const labelField = LABEL_FIELDS.find(field => record.values[field]) ?? entity.identityFields[0];
        cluster = {
          entity: entity.key, key,
          identity: Object.fromEntries(entity.identityFields.filter(field => record.values[field]).map(field => [field, String(record.values[field].value)])),
          label: record.values[labelField] ? String(record.values[labelField].value) : record.ref,
          occurrences: [], conflicts: [], unresolved: !resolved,
        };
        clusters.set(key, cluster);
      }
      cluster.occurrences.push({ segmentId: document.segmentId, fileName: document.fileName, ref: record.ref, roles });
    }
  }
  // Same identity, different written values: shown to the user, never auto-resolved.
  for (const cluster of clusters.values()) {
    if (cluster.occurrences.length < 2) continue;
    const values = new Map<string, Array<{ value: string; segmentId: string; fileName: string }>>();
    for (const occurrence of cluster.occurrences) {
      const document = documents.find(candidate => candidate.segmentId === occurrence.segmentId)!;
      const record = document.records.find(candidate => candidate.ref === occurrence.ref)!;
      for (const [field, value] of Object.entries(record.values)) {
        const list = values.get(field) ?? [];
        list.push({ value: String(value.value), segmentId: occurrence.segmentId, fileName: occurrence.fileName });
        values.set(field, list);
      }
    }
    for (const [field, list] of values) {
      const distinct = new Set(list.map(item => normalizeEvidenceText(item.value).toLocaleUpperCase("es")));
      if (distinct.size > 1) cluster.conflicts.push({ field, values: list });
    }
  }
  return [...clusters.values()].sort((a, b) => a.entity.localeCompare(b.entity) || a.label.localeCompare(b.label));
}

export function schemaSupport(schema: PreviewSchema, documents: ReconcileDocument[]): SchemaSupport {
  const entities: Record<string, number> = {}, fields: Record<string, number> = {}, relations: Record<string, number> = {};
  for (const entity of schema.entities) {
    entities[entity.key] = 0;
    for (const field of entity.fields) fields[entity.key + "." + field.key] = 0;
  }
  for (const relation of schema.relations) relations[relation.key] = 0;
  for (const document of documents) {
    for (const record of document.records) {
      entities[record.entity] = (entities[record.entity] ?? 0) + 1;
      for (const field of Object.keys(record.values)) fields[record.entity + "." + field] = (fields[record.entity + "." + field] ?? 0) + 1;
    }
    for (const link of document.links) relations[link.relation] = (relations[link.relation] ?? 0) + 1;
  }
  const newOnly = (origin: string) => origin === "new";
  return {
    entities, fields, relations,
    unsupported: {
      entities: schema.entities.filter(entity => newOnly(entity.origin) && !entities[entity.key]).map(entity => entity.key),
      fields: schema.entities.flatMap(entity => entity.fields
        .filter(field => newOnly(field.origin) && !fields[entity.key + "." + field.key]).map(field => entity.key + "." + field.key)),
      relations: schema.relations.filter(relation => newOnly(relation.origin) && !relations[relation.key]).map(relation => relation.key),
    },
  };
}

const words = (value: string) => normalizeEvidenceText(value).normalize("NFKD").replace(/\p{M}/gu, "")
  .toLocaleLowerCase("es").split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Reusable labels must not carry private values. Only whole-word phrases are
 * compared (never substrings across words), and only identifying values of
 * top-level records: identity fields and name fields.
 */
export function privateLabelIssues(schema: PreviewSchema, documents: ReconcileDocument[]): LabelIssue[] {
  const labels: Array<{ path: string; words: string[] }> = [
    ...schema.entities.flatMap(entity => [
      { path: `entities.${entity.key}`, words: words([entity.key.replace(/_/g, " "), entity.name, entity.description].join(" ")) },
      ...entity.fields.map(field => ({ path: `entities.${entity.key}.fields.${field.key}`, words: words([field.name, field.description].join(" ")) })),
    ]),
    ...schema.relations.map(relation => ({ path: `relations.${relation.key}`, words: words([relation.name, relation.description].join(" ")) })),
  ];
  const issues: LabelIssue[] = [];
  const seen = new Set<string>();
  for (const document of documents) for (const record of document.records) {
    const entity = schema.entities.find(candidate => candidate.key === record.entity);
    if (!entity || entity.ownedBy) continue;
    for (const field of [...entity.identityFields, ...LABEL_FIELDS]) {
      const value = record.values[field];
      if (!value || typeof value.value !== "string") continue;
      const phrase = words(value.value);
      const identifying = phrase.length >= 2 || (phrase.length === 1 && phrase[0].length >= 5 && /\d/.test(phrase[0]));
      if (!identifying) continue;
      for (const label of labels) {
        const found = label.words.some((_, start) => phrase.every((word, offset) => label.words[start + offset] === word));
        const key = label.path + "|" + identityToken(value.value);
        if (found && !seen.has(key)) {
          seen.add(key);
          issues.push({ code: "PRIVATE_VALUE_IN_LABEL", path: label.path, message: `La definición reutilizable ${label.path} contiene un valor privado («${value.value}»).` });
        }
      }
    }
  }
  return issues;
}
