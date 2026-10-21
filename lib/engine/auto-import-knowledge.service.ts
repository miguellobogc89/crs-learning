import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import { analyzeStructuredDocument } from "@/lib/engine/ingestion/analyze-structured-document.service";
import { executeEngineUpsertManifest } from "@/lib/engine/execute-upsert-manifest.service";
import type { ImportManifest } from "@/lib/engine/upsert-manifest";

type Row = { entity: string; values: Record<string, unknown>; evidence: string; sourceIndex: number };
const normalizedSource = (value: string) => value.normalize("NFKC").toLocaleLowerCase("es").replace(/\s+/g, " ");
const literalSupported = (value: unknown, text: string) => {
  if (value === null || typeof value === "boolean") return true;
  const normalized = normalizedSource(text);
  if (typeof value === "string") return normalized.includes(normalizedSource(value));
  return (text.match(/-?\d+(?:[.,]\d+)*/g) ?? [])
    .some(token => Number(token.replace(",", ".")) === value);
};
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Automatic, draft-only structured import from a persisted Knowledge file.
 * All AI output is checked against source evidence and active workspace schema.
 * The document remains intact if individual records cannot be imported.
 */
export async function importKnowledgeIntoEngine(input: {
  workspaceId: string; userId: string; knowledgeFileId: string;
}) {
  const { workspaceId, userId, knowledgeFileId } = input;
  const file = await prisma.knowledge_files.findFirst({
    where: { id: knowledgeFileId, status: { in: ["ready", "processed"] },
      knowledge_sources: knowledgeSourceReadWhere(userId, workspaceId) },
    select: { id: true, extracted_text: true },
  });
  if (!file?.extracted_text.trim()) throw new Error("Documento sin texto procesado accesible.");
  const workspace = await prisma.workspaces.findFirst({
    where: { id: workspaceId, status: "active" },
    select: { owner_user_id: true, workspace_members: {
      where: { user_id: userId, status: "active" }, select: { role: true },
    } },
  });
  if (!workspace || (workspace.owner_user_id !== userId &&
      !["owner", "admin"].includes(workspace.workspace_members[0]?.role ?? ""))) {
    throw new Error("Se requieren permisos de administrador para importar datos en Engine.");
  }

  const startedAt = Date.now();
  const analysis = await analyzeStructuredDocument({
    workspaceId, documentId: knowledgeFileId, text: file.extracted_text,
  });
  const discovery = analysis.schema;
  if (!discovery.valid || !discovery.proposal) {
    return { status: "review", typesCreated: 0, fieldsCreated: 0,
      recordsCreated: 0, recordsReused: 0, recordsPending: 0,
      issues: ["No se ha podido validar el esquema descubierto.",
        ...discovery.issues.map(issue => issue.path + ": " + issue.code)],
      writesPerformed: false, timings: { analysisMs: analysis.modelMs,
        totalMs: Date.now() - startedAt } };
  }
  const proposal = discovery.proposal;
  const sourceText = file.extracted_text.slice(0, 16000);
  const issues: string[] = [...analysis.issues];
  if (analysis.truncated) issues.push("El análisis está limitado a los primeros 16000 caracteres.");
  const extracted: Row[] = [];
  const parsed = { rows: analysis.rows };
  const entityByKey = new Map(proposal.entities.map(entity => [entity.key, entity]));
  for (const [index, raw] of parsed.rows.entries()) {
    if (!isObject(raw) || typeof raw.entity !== "string" ||
        !isObject(raw.values) || typeof raw.evidence !== "string" ||
        raw.evidence.length < 3 || !sourceText.includes(raw.evidence)) {
      issues.push("Registro " + (index + 1) + ": evidencia o formato inválidos.");
      continue;
    }
    const entity = entityByKey.get(raw.entity);
    if (!entity) { issues.push("Registro " + (index + 1) + ": entidad desconocida."); continue; }
    const allowed = new Map(entity.fields.map(field => [field.key, field.type]));
    const values: Record<string, unknown> = {};
    let valid = true;
    for (const [key, value] of Object.entries(raw.values)) {
      const type = allowed.get(key);
      if (!type) { valid = false; break; }
      if (value === null) continue;
      if (type === "integer" && !(typeof value === "number" && Number.isSafeInteger(value))) valid = false;
      else if (type === "decimal" && !(typeof value === "number" && Number.isFinite(value))) valid = false;
      else if (type === "boolean" && typeof value !== "boolean") valid = false;
      else if (["text", "long_text", "date", "datetime", "enum"].includes(type) && typeof value !== "string") valid = false;
      if (typeof value === "string" && value.length > 5000) valid = false;
      values[key] = value;
    }
    if (!valid || Object.keys(values).length === 0) {
      issues.push("Registro " + (index + 1) + ": campos o tipos inválidos."); continue;
    }
    // Verify every non-null value against the source document, not just a
    // short line quote. The latter excludes valid line items whose context is
    // in a heading. Do not accept values absent from the source entirely.
    if (Object.values(values).some(value => !literalSupported(value, sourceText))) {
      issues.push("Registro " + (index + 1) + ": valores sin evidencia documental."); continue;
    }
    extracted.push({ entity: entity.key, values, evidence: raw.evidence, sourceIndex: index });
  }

  const reconciliationStartedAt = Date.now();
  let typesCreated = 0, fieldsCreated = 0;
  const usable = new Map<string, { id: string; version: number }>();
  for (const entity of proposal.entities) {
    if (!extracted.some(row => row.entity === entity.key)) continue;
    try {
      const result = await prisma.$transaction(async tx => {
        const existing = await tx.engine_object_types.findUnique({
          where: { workspace_id_key: { workspace_id: workspaceId, key: entity.key } },
          include: { engine_field_definitions: true },
        });
        if (existing && existing.status !== "active") throw new Error("Tipo existente inactivo.");
        const existingFields = new Map(existing?.engine_field_definitions.map(f => [f.key, f]) ?? []);
        for (const field of entity.fields) {
          const previous = existingFields.get(field.key);
          if (previous && (previous.status !== "active" || previous.field_type !== field.type)) {
            throw new Error("Campo incompatible: " + field.key);
          }
        }
        const type = existing ?? await tx.engine_object_types.create({
          data: { workspace_id: workspaceId, key: entity.key, name: entity.name,
            description: entity.description || null },
          include: { engine_field_definitions: true },
        });
        let newFields = 0;
        for (const field of entity.fields) {
          if (existingFields.has(field.key)) continue;
          await tx.engine_field_definitions.create({
            data: { workspace_id: workspaceId, object_type_id: type.id,
              key: field.key, name: field.name, field_type: field.type,
              is_required: false, is_unique: false },
          });
          newFields++;
        }
        if (existing && newFields) await tx.engine_object_types.update({
          where: { id: type.id }, data: { schema_version: { increment: 1 } },
        });
        return { id: type.id, version: type.schema_version + (existing && newFields ? 1 : 0),
          created: !existing, fieldsCreated: newFields };
      });
      usable.set(entity.key, { id: result.id, version: result.version });
      if (result.created) typesCreated++;
      fieldsCreated += result.fieldsCreated;
    } catch (error) {
      issues.push(entity.key + ": " + (error instanceof Error ? error.message : "No se pudo crear el tipo"));
    }
  }

  // Translate extracted observations to the provider-neutral Engine contract.
  // Identity selection is conservative: only declared schema fields that are
  // plausible business identifiers. Junction rows without a verified compound
  // identity remain pending rather than creating orphan records.
  const identityKeys = (fields: { key: string }[]) => {
    const keys = new Set(fields.map(field => field.key));
    if (keys.has("external_id")) return ["external_id"];
    if (keys.has("code")) return ["code"];
    if (keys.has("sku")) return ["sku"];
    if (keys.has("name")) return ["name"];
    return [];
  };
  const manifest: ImportManifest = {
    version: 1, workspaceId,
    entities: proposal.entities.filter(entity => usable.has(entity.key)).map(entity => ({
      key: entity.key, name: entity.name,
      fields: entity.fields.map(field => ({
        key: field.key, name: field.name, type: field.type,
      })),
      identityFields: identityKeys(entity.fields),
    })),
    observations: extracted.filter(row => usable.has(row.entity)).map(row => ({
      localId: "row_" + row.sourceIndex, entityKey: row.entity, values: row.values,
      source: { kind: "knowledge" as const, sourceId: knowledgeFileId, evidence: row.evidence },
    })),
    links: analysis.links.filter(link =>
      extracted.some(row => row.sourceIndex === link.fromRow && usable.has(row.entity)) &&
      extracted.some(row => row.sourceIndex === link.toRow && usable.has(row.entity)))
      .map(link => ({ fromLocalId: "row_" + link.fromRow,
        toLocalId: "row_" + link.toRow, relationKey: link.relationKey,
        source: { kind: "knowledge" as const, sourceId: knowledgeFileId,
          evidence: link.evidence } })),
  };
  const schemaMs = Date.now() - reconciliationStartedAt;
  const executionStartedAt = Date.now();
  let recordsCreated = 0, recordsReused = 0, relationsProposed = 0;
  if (manifest.observations.length) {
    const executed = await executeEngineUpsertManifest({ workspaceId, userId, manifest });
    recordsCreated = executed.created.length;
    recordsReused = executed.reused.length;
    relationsProposed = executed.relationsProposed;
    issues.push(...executed.pending.map(item => item.localId + ": " + item.reason));
  }

  if (proposal.relations.length && !manifest.links.length)
    issues.push("Relaciones de esquema detectadas, sin vínculos concretos verificables.");
  return {
    status: issues.length ? "completed_with_issues" : "completed",
    typesCreated, fieldsCreated, recordsCreated, recordsReused,
    recordsPending: parsed.rows.length - recordsCreated - recordsReused,
    entitiesDiscovered: proposal.entities.length,
    relationsDiscovered: proposal.relations.length,
    relationsProposed,
    issues: [...issues, ...proposal.warnings].slice(0, 100),
    note: "Los registros ambiguos y las relaciones no aprobadas quedan pendientes de revisión.",
    timings: { analysisMs: analysis.modelMs, schemaMs,
      executionMs: Date.now() - executionStartedAt,
      totalMs: Date.now() - startedAt },
    writesPerformed: typesCreated + fieldsCreated + recordsCreated > 0,
  };
}
