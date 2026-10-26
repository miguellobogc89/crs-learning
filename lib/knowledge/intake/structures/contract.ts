import { validateSchemaDiscovery, type SchemaDiscoveryProposal } from "@/lib/engine/schema-discovery/validation";
export type IntakeUnit = { id: string; tipo: string; destino: "engine" | "knowledge" | "hibrido"; contenidosDetectados: string[]; origen: { archivoId: string; archivo: string; lineaInicio: number; lineaFin: number }; contenido: { texto: string } };
export type IntakeResult = { version: number; loteId: string; unidades: IntakeUnit[] };
export type Catalog = {
  tables: { id: string; key: string; name: string; description: string | null; version: number; fields: { key: string; name: string; type: string; required: boolean; description: string | null }[] }[];
  relations: { key: string; version: number; fromEntity: string; toEntity: string; cardinality: string; description: string | null }[];
};
export type Source = { id: string; unitId: string; text: string; origen: IntakeUnit["origen"] };
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
export function structuredUnits(input: IntakeResult) {
  if (input.version !== 2 || !Array.isArray(input.unidades)) throw new Error("Se requiere una clasificación versión 2");
  return input.unidades.filter(u => u.destino === "engine" || u.destino === "hibrido");
}
/** Only exact source spans may cross the hybrid boundary; omission is explicit. */
export function hybridSources(units: IntakeUnit[], raw: unknown): { sources: Source[]; excluded: string[] } {
  if (!obj(raw) || !Array.isArray(raw.unidades) || raw.unidades.length !== units.length) throw new Error("Filtro híbrido incompleto");
  const sources: Source[] = [], excluded: string[] = [], seen = new Set<string>();
  for (const item of raw.unidades) {
    if (!obj(item) || typeof item.id !== "string" || seen.has(item.id) || !Array.isArray(item.rangos)) throw new Error("Filtro híbrido inválido");
    seen.add(item.id);
    const unit = units.find(u => u.id === item.id);
    if (!unit || typeof item.motivo !== "string") throw new Error("Unidad híbrida desconocida");
    const lines = unit.contenido.texto.split(/\r?\n/);
    let end = 0;
    for (const [i, range] of item.rangos.entries()) {
      if (!obj(range) || !Number.isInteger(range.inicio) || !Number.isInteger(range.fin)) throw new Error("Rango híbrido inválido");
      const start = range.inicio as number, finish = range.fin as number;
      if (start <= end || finish < start || finish > lines.length) throw new Error("Rango híbrido fuera de la fuente o solapado");
      end = finish;
      sources.push({ id: `${unit.id}:span:${i+1}`, unitId: unit.id, text: lines.slice(start-1,finish).join("\n"), origen: { ...unit.origen, lineaInicio: unit.origen.lineaInicio+start-1, lineaFin: unit.origen.lineaInicio+finish-1 } });
    }
    if (!item.rangos.length) {
      if (!item.motivo.trim()) throw new Error("La exclusión híbrida requiere motivo");
      excluded.push(`${unit.id}: ${item.motivo}`);
    }
  }
  return { sources, excluded };
}
export function validateStructureOutput(raw: unknown, sources: Source[], catalog: Catalog, workspaceId: string, loteId: string) {
  if (!obj(raw) || Object.keys(raw).some(k => !["entities", "relations", "warnings", "coverage", "pending"].includes(k))) throw new Error("La salida solo admite estructuras y cobertura, sin registros");
  const checked = validateSchemaDiscovery({ workspaceId, documents: sources.map(s => ({ id: s.id, workspaceId, extractedText: s.text })), proposal: raw });
  if (!checked.valid || !checked.proposal) throw new Error(`Propuesta estructural inválida: ${JSON.stringify(checked.issues)}`);
  const proposal = checked.proposal;
  // Reject hidden record payloads even if the legacy schema validator ignores extra keys.
  function keys(x: object, allowed: string[]) { if (Object.keys(x).some(k => !allowed.includes(k))) throw new Error("No se admiten datos de registros en descubrimiento"); }
  const tables = proposal.entities.map(entity => {
    keys(entity,["key","name","description","fields","evidence"]);
    const existing = catalog.tables.find(t => t.key === entity.key);
    const fields = entity.fields.map(field => {
      keys(field,["key","name","type","required","evidence"]);
      const known = existing?.fields.find(f => f.key === field.key);
      if (known && known.type !== field.type) throw new Error(`Tipo incompatible con el catálogo: ${entity.key}.${field.key}`);
      return { ...field, action: known ? "reuse" : "propose_add" };
    });
    return { key: entity.key, name: existing?.name ?? entity.name, description: entity.description, scope: "global" as const,
      action: !existing ? "propose_create" : fields.some(f => f.action === "propose_add") ? "propose_extend" : "reuse",
      catalogId: existing?.id ?? null, catalogVersion: existing?.version ?? null, fields, evidence: entity.evidence };
  });
  const relations = proposal.relations.map(relation => {
    keys(relation,["key","fromEntity","toEntity","cardinality","description","evidence"]);
    const known = catalog.relations.find(r => r.key === relation.key);
    if (known && (known.fromEntity !== relation.fromEntity || known.toEntity !== relation.toEntity || known.cardinality !== relation.cardinality)) throw new Error(`Relación incompatible con el catálogo: ${relation.key}`);
    return { ...relation, scope: "global", action: known ? "reuse" : "propose_create", catalogVersion: known?.version ?? null };
  });
  if (!Array.isArray(raw.coverage) || raw.coverage.length !== sources.length) throw new Error("Falta cobertura completa de las fuentes estructuradas");
  const seen = new Set<string>();
  const coverage = raw.coverage.map(item => {
    if (!obj(item) || typeof item.sourceId !== "string" || seen.has(item.sourceId) || !sources.some(s => s.id === item.sourceId) || !Array.isArray(item.tables) || typeof item.pendingReason !== "string") throw new Error("Cobertura inválida");
    seen.add(item.sourceId);
    for (const key of item.tables) {
      const entity = proposal.entities.find(t => t.key === key);
      if (!entity || !entity.evidence.some(e => e.documentId === item.sourceId)) throw new Error("Tabla de cobertura sin evidencia en la fuente");
    }
    if (!item.tables.length && !item.pendingReason.trim()) throw new Error("Contenido sin representar ni marcar pendiente");
    return { sourceId: item.sourceId, tables: item.tables as string[], pendingReason: item.pendingReason };
  });
  if (!Array.isArray(raw.pending)) throw new Error("Falta la lista explícita de decisiones pendientes");
  const pending = raw.pending.map(item => {
    if (!obj(item) || typeof item.concept !== "string" || !item.concept.trim() ||
        typeof item.reason !== "string" || !item.reason.trim() || !Array.isArray(item.candidateTables) ||
        !item.candidateTables.every(key => typeof key === "string" && /^[a-z][a-z0-9_]*$/.test(key)) ||
        !Array.isArray(item.evidence) || !item.evidence.length) throw new Error("Decisión pendiente inválida");
    const evidence = item.evidence.map(e => {
      if (!obj(e) || typeof e.documentId !== "string" || typeof e.quote !== "string" || !e.quote.trim() ||
          !sources.some(s => s.id === e.documentId && s.text.includes(e.quote as string))) throw new Error("Pendiente sin evidencia verificable");
      return { documentId: e.documentId, quote: e.quote };
    });
    return { concept: item.concept, reason: item.reason, candidateTables: item.candidateTables as string[], evidence };
  });
  return { version: 2, module: "business_structure_discovery", loteId, definitionScope: "global", recordScope: "workspace", tables, relations, coverage, pending, warnings: proposal.warnings,
    sources: sources.map(({ id, unitId, origen }) => ({ id, unitId, origen })), writesPerformed: { definitions: false, records: false } };
}
export type StructureOutput = ReturnType<typeof validateStructureOutput>;
export type { SchemaDiscoveryProposal };
