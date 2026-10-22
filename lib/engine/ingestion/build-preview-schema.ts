import type { SchemaDiscoveryProposal, DiscoveredField } from "../schema-discovery/validation";
import type { SimulationSchema } from "./simulation-manifest";

type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const key = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "");
const fieldType = (v: unknown): DiscoveredField["type"] => {
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "decimal";
  if (typeof v !== "string") return "text";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{2}\/\d{2}\/\d{4}$/.test(v)) return "date";
  if (/^-?\d+[.,]\d+$/.test(v.trim())) return "decimal";
  if (/^-?\d+$/.test(v.trim())) return "integer";
  return "text";
};

/** Builds review-only schema from stage 3/4 matches and extracted evidence.
 * No model discovery and no persistence. */
export function buildPreviewSchema(input: {
  documentId: string; text: string; existing: SimulationSchema;
  prior: { structures: Obj | null; relationships: Obj | null } | null;
  rows: unknown[];
}): SchemaDiscoveryProposal {
  const { documentId, text, existing, prior } = input;
  const quote = (value: unknown) => typeof value === "string" && value.trim() && text.includes(value)
    ? value : text.slice(0, Math.min(text.length, 160));
  const ev = (value: unknown) => [{ documentId, quote: quote(value) }];
  const matches = Array.isArray(prior?.structures?.matches) ? prior.structures.matches.filter(obj) : [];
  const aliases = new Map<string, string>();
  for (const match of matches) {
    if (typeof match.concept === "string" && typeof match.existingKey === "string" &&
      existing.entities.some(e => e.key === match.existingKey))
      aliases.set(key(match.concept), match.existingKey);
  }
  const entities: SchemaDiscoveryProposal["entities"] = [];
  const resolve = (value: string) => aliases.get(key(value)) ?? key(value);
  const addEntity = (name: string, evidence: unknown) => {
    const entityKey = resolve(name);
    if (!entityKey) return null;
    let entity = entities.find(e => e.key === entityKey);
    if (!entity) {
      const known = existing.entities.find(e => e.key === entityKey);
      entity = { key: entityKey, name, description: "Propuesta de simulación; revisar antes de importar",
        fields: [], evidence: ev(evidence) };
      if (known) entity.name = entityKey;
      entities.push(entity);
    }
    return entity;
  };
  const rows = input.rows.filter(obj);
  for (const row of rows) {
    if (typeof row.entity !== "string" || !obj(row.values)) continue;
    const entity = addEntity(row.entity, row.evidence);
    if (!entity) continue;
    for (const [rawField, value] of Object.entries(row.values)) {
      const fieldKey = key(rawField);
      if (!fieldKey || entity.fields.some(f => f.key === fieldKey)) continue;
      const known = existing.entities.find(e => e.key === entity.key)?.fields.find(f => f.key === fieldKey);
      const validTypes = ["text", "long_text", "integer", "decimal", "boolean", "date", "datetime", "enum"];
      const type = known && validTypes.includes(known.type) ? known.type as DiscoveredField["type"] : fieldType(value);
      entity.fields.push({ key: fieldKey, name: rawField, type, required: false, evidence: ev(row.evidence) });
    }
  }
  const relations: SchemaDiscoveryProposal["relations"] = [];
  const previous = Array.isArray(prior?.relationships?.relations) ? prior.relationships.relations.filter(obj) : [];
  for (const rel of previous) {
    if (typeof rel.fromConcept !== "string" || typeof rel.toConcept !== "string") continue;
    const fromEntity = resolve(rel.fromConcept), toEntity = resolve(rel.toConcept);
    if (!entities.some(e => e.key === fromEntity) || !entities.some(e => e.key === toEntity)) continue;
    const known = typeof rel.existingRelationKey === "string" ?
      existing.relations.find(r => r.key === rel.existingRelationKey &&
        r.fromEntity === fromEntity && r.toEntity === toEntity) : undefined;
    const relationKey = known?.key ?? key(fromEntity + "_to_" + toEntity);
    if (!relationKey || relations.some(r => r.key === relationKey ||
      (r.fromEntity === fromEntity && r.toEntity === toEntity))) continue;
    const cardinality = rel.cardinality === "one_to_one" || rel.cardinality === "many_to_many" ?
      rel.cardinality : "one_to_many";
    relations.push({ key: relationKey, fromEntity, toEntity, cardinality,
      description: typeof rel.reason === "string" ? rel.reason : "Relación propuesta",
      evidence: ev(rel.evidence) });
  }
  const inferredRelationKeys = new Set<string>();
  // Infer relationships from source-backed shared identifiers, independently of
  // domain vocabulary (orders, recipes, invoices, etc.). A unique identity on
  // one side and repeated references on the other suggest one-to-many.
  const grouped = new Map<string, Obj[]>();
  for (const row of rows) {
    if (typeof row.entity !== "string" || !obj(row.values)) continue;
    const entityKey = resolve(row.entity);
    grouped.set(entityKey, [...(grouped.get(entityKey) ?? []), row]);
  }
  const identityField = (name: string) =>
    /(^|_)(id|code|codigo|number|numero|ref|referencia|sku)(_|$)/.test(name);
  const scalar = (value: unknown) => typeof value === "string" || typeof value === "number"
    ? String(value).normalize("NFKC").trim().toLowerCase() : "";
  const uniqueValues = (items: Obj[], field: string) => {
    const values = items.map(row => obj(row.values) ? scalar(row.values[field]) : "").filter(Boolean);
    return values.length > 0 && new Set(values).size === values.length;
  };
  const entityKeys = [...grouped.keys()];
  for (let i = 0; i < entityKeys.length; i++) for (let j = i + 1; j < entityKeys.length; j++) {
    const a = entityKeys[i], b = entityKeys[j];
    const left = grouped.get(a) ?? [], right = grouped.get(b) ?? [];
    const leftFields = new Set(left.flatMap(row => obj(row.values) ? Object.keys(row.values) : []));
    const common = [...leftFields].filter(field => identityField(field) &&
      right.some(row => obj(row.values) && field in row.values));
    for (const field of common) {
      const lUnique = uniqueValues(left, field), rUnique = uniqueValues(right, field);
      if (lUnique === rUnique) continue;
      const parent = lUnique ? a : b, child = lUnique ? b : a;
      const parents = lUnique ? left : right, children = lUnique ? right : left;
      const ids = new Set(parents.map(row => obj(row.values) ? scalar(row.values[field]) : ""));
      const matched = children.filter(row => obj(row.values) && ids.has(scalar(row.values[field])));
      if (!matched.length) continue;
      const witness = matched.find(row => typeof row.evidence === "string" && text.includes(row.evidence));
      if (!witness) continue;
      const relationKey = key(parent + "_to_" + child);
      if (relations.some(rel => rel.key === relationKey)) continue;
      inferredRelationKeys.add(relationKey);
      relations.push({ key: relationKey, fromEntity: parent, toEntity: child,
        cardinality: "one_to_many",
        description: "Referencia documental compartida: " + field,
        evidence: ev(witness.evidence) });
      break;
    }
  }
  // A document-supported junction entity supersedes a direct shortcut between
  // its endpoints when both of its source-backed relationships are available.
  for (let i = relations.length - 1; i >= 0; i--) {
    const direct = relations[i];
    // A directly evidenced identifier edge must never be discarded in favor of
    // an AI-proposed shortcut: otherwise triangles erase the junction edges.
    if (inferredRelationKeys.has(direct.key)) continue;
    const junction = entities.some(entity => {
      const mid = entity.key;
      if (mid === direct.fromEntity || mid === direct.toEntity) return false;
      const edges = relations.filter(rel => rel !== direct);
      return edges.some(rel => (rel.fromEntity === direct.fromEntity && rel.toEntity === mid) ||
        (rel.toEntity === direct.fromEntity && rel.fromEntity === mid)) &&
        edges.some(rel => (rel.fromEntity === direct.toEntity && rel.toEntity === mid) ||
        (rel.toEntity === direct.toEntity && rel.fromEntity === mid));
    });
    if (junction) relations.splice(i, 1);
  }
  // A direct many-to-many relation is redundant when a documented
  // intermediary already connects the same endpoints (in either direction).
  // Keep the two concrete relations, rather than a duplicate shortcut.
  const hasEdge = (a: string, b: string) => relations.some(r =>
    (r.fromEntity === a && r.toEntity === b) || (r.fromEntity === b && r.toEntity === a));
  const intermediary = (a: string, b: string) => entities.some(e =>
    e.key !== a && e.key !== b && rows.some(row => resolve(String(row.entity)) === e.key) &&
    hasEdge(a, e.key) && hasEdge(e.key, b));
  for (let i = relations.length - 1; i >= 0; i--) {
    const relation = relations[i];
    if (relation.cardinality === "many_to_many" &&
        intermediary(relation.fromEntity, relation.toEntity))
      relations.splice(i, 1);
  }
  // Existing workspace relations are candidates, not document facts. Only
  // stage-4 evidence-backed relationships may enter the preview.
  return { entities, relations, warnings: ["Esquema construido a partir de las fases previas y los registros; revisar propuestas y evidencias."] };
}

export function normalizePreviewRows(rows: unknown[], proposal: SchemaDiscoveryProposal) {
  const byName = new Map<string, string>();
  for (const entity of proposal.entities) {
    byName.set(key(entity.key), entity.key);
    byName.set(key(entity.name), entity.key);
  }
  return rows.map(row => {
    if (!obj(row) || typeof row.entity !== "string" || !obj(row.values)) return row;
    const entity = byName.get(key(row.entity)) ?? key(row.entity);
    const definition = proposal.entities.find(item => item.key === entity);
    const values = Object.fromEntries(Object.entries(row.values).map(([k, v]) => {
      const fieldKey = key(k);
      const type = definition?.fields.find(field => field.key === fieldKey)?.type;
      if (typeof v === "string" && (type === "integer" || type === "decimal") &&
          /^-?\d+(?:[.,]\d+)?$/.test(v.trim())) {
        const numeric = Number(v.replace(",", "."));
        if (Number.isFinite(numeric) && (type !== "integer" || Number.isSafeInteger(numeric)))
          return [fieldKey, numeric];
      }
      return [fieldKey, v];
    }));
    return { ...row, entity, values };
  });
}
