import type { SchemaDiscoveryProposal, DiscoveredField } from "../schema-discovery/validation";
import type { SimulationSchema } from "./simulation-manifest";

type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const key = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "");
const fieldType = (v: unknown): DiscoveredField["type"] =>
  typeof v === "boolean" ? "boolean" : typeof v === "number" ?
  (Number.isInteger(v) ? "integer" : "decimal") : "text";

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
    if (!relationKey || relations.some(r => r.key === relationKey)) continue;
    const cardinality = rel.cardinality === "one_to_one" || rel.cardinality === "many_to_many" ?
      rel.cardinality : "one_to_many";
    relations.push({ key: relationKey, fromEntity, toEntity, cardinality,
      description: typeof rel.reason === "string" ? rel.reason : "Relación propuesta",
      evidence: ev(rel.evidence) });
  }
  for (const known of existing.relations) {
    if (relations.some(r => r.key === known.key) ||
      !entities.some(e => e.key === known.fromEntity) || !entities.some(e => e.key === known.toEntity)) continue;
    if (known.cardinality !== "one_to_one" && known.cardinality !== "one_to_many" &&
      known.cardinality !== "many_to_many") continue;
    relations.push({ ...known, cardinality: known.cardinality, description: "Relación existente (candidata)",
      evidence: ev(text.slice(0, 120)) });
  }
  return { entities, relations, warnings: ["Esquema construido a partir de las fases previas y los registros; revisar propuestas y evidencias."] };
}

export function normalizePreviewRows(rows: unknown[], proposal: SchemaDiscoveryProposal) {
  const byName = new Map(proposal.entities.flatMap(e => [[key(e.key), e.key], [key(e.name), e.key]]));
  return rows.map(row => {
    if (!obj(row) || typeof row.entity !== "string" || !obj(row.values)) return row;
    const entity = byName.get(key(row.entity)) ?? key(row.entity);
    const values = Object.fromEntries(Object.entries(row.values).map(([k, v]) => [key(k), v]));
    return { ...row, entity, values };
  });
}
