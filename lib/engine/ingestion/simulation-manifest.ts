import type { SchemaDiscoveryProposal } from "../schema-discovery/validation";
import type { ExtractedRow, ExtractedLink } from "./analyze-structured-document.service";

export type SimulationSchema = {
  entities: Array<{ key: string; fields: Array<{ key: string; type: string }> }>;
  relations: Array<{ key: string; fromEntity: string; toEntity: string; cardinality: string }>;
};

/** Pure projection: missing schema is a dependency, never a reason to drop facts. */
export function buildSimulationManifest(input: {
  proposal: SchemaDiscoveryProposal; rows: ExtractedRow[]; links: ExtractedLink[];
  text: string; existing: SimulationSchema;
}) {
  const issues: string[] = [];
  const unresolvedLinks: string[] = [];
  const entities = input.proposal.entities.map(entity => {
    const existing = input.existing.entities.find(item => item.key === entity.key);
    return { ...entity, disposition: existing ? "existing" : "proposed",
      fields: entity.fields.map(field => {
        const previous = existing?.fields.find(item => item.key === field.key);
        return { ...field, disposition: !previous ? "proposed" :
          previous.type === field.type ? "existing" : "conflict" };
      }) };
  });
  const relations = input.proposal.relations.map(relation => {
    const previous = input.existing.relations.find(item => item.key === relation.key);
    return { ...relation, disposition: !previous ? "proposed" :
      previous.fromEntity === relation.fromEntity && previous.toEntity === relation.toEntity &&
      previous.cardinality === relation.cardinality ? "existing" : "conflict" };
  });
  const rows = input.rows.flatMap(row => {
    const entity = entities.find(item => item.key === row.entity);
    const values = Object.entries(row.values);
    const valid = entity && row.evidence.trim() && input.text.includes(row.evidence) && values.length &&
      values.every(([key, value]) => {
        const field = entity.fields.find(item => item.key === key);
        if (!field) return false;
        if (value === null) return true;
        // Preserve existing typed-preview handling of booleans. Their source
        // representation may be language-specific (e.g. "sí" rather than "true").
        if (field.type === "boolean") return typeof value === "boolean";
        if (field.type === "integer" || field.type === "decimal") return typeof value === "number" &&
          Number.isFinite(value) && (field.type !== "integer" || Number.isSafeInteger(value)) &&
          (input.text.match(/-?\d+(?:[.,]\d+)*/g) ?? []).some(token => Number(token.replace(",", ".")) === value);
        return typeof value === "string" && value.trim().length > 0 &&
          input.text.normalize("NFKC").toLowerCase().includes(value.normalize("NFKC").toLowerCase());
      });
    if (!valid) { issues.push("Registro row_" + row.sourceIndex + ": valores, campos o evidencia no verificables"); return []; }
    const conflict = entity.fields.some(field => field.disposition === "conflict");
    const proposed = entity.disposition === "proposed" || entity.fields.some(field => field.disposition === "proposed");
    return [{ localId: "row_" + row.sourceIndex, entityKey: row.entity,
      values: row.values as Record<string, string | number | boolean | null>, evidence: row.evidence,
      disposition: conflict ? "pending" as const : "candidate" as const,
      reason: conflict ? "Campo existente incompatible; requiere revisión" : proposed ?
        "Depende de estructura o campos propuestos; identidad y duplicados sin validar" :
        "Sin comprobar identidad ni duplicados" }];
  });
  const byId = new Map(rows.map(row => [row.localId, row]));
  const links: Array<{ fromLocalId: string; toLocalId: string; relationKey: string; evidence: string }> = [];
  for (const link of input.links) {
    const fromLocalId = "row_" + link.fromRow, toLocalId = "row_" + link.toRow;
    const from = byId.get(fromLocalId), to = byId.get(toLocalId);
    const relation = relations.find(item => item.key === link.relationKey);
    if (!from || !to || !relation || relation.fromEntity !== from.entityKey ||
        relation.toEntity !== to.entityKey || !link.evidence.trim() || !input.text.includes(link.evidence)) {
      unresolvedLinks.push(link.relationKey + ": extremos o evidencia no verificables"); continue;
    }
    if (relation.disposition === "conflict") unresolvedLinks.push(link.relationKey + ": definición existente incompatible");
    if (!links.some(item => item.fromLocalId === fromLocalId && item.toLocalId === toLocalId && item.relationKey === link.relationKey))
      links.push({ fromLocalId, toLocalId, relationKey: link.relationKey, evidence: link.evidence });
  }
  for (const relation of relations) {
    if (!links.some(link => link.relationKey === relation.key))
      unresolvedLinks.push(relation.key + ": relación de esquema sin vínculos concretos verificados");
  }
  return { version: 1, simulation: true, writesPerformed: false, entities, relations, rows, links, unresolvedLinks, issues };
}
