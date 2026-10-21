import { auth } from "@/auth";
import { getKnowledgeImportModel, getOpenAIClient } from "@/lib/ai/openai";
import { splitEngineDocument } from "@/lib/engine/ingestion/progressive-analysis.service";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ importId: string }> };
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const str = (value: unknown, limit = 300) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
type PreviewRow = {
  localId: string; entityKey: string; values: Record<string, string | number | boolean | null>;
  evidence: string; disposition: "candidate" | "pending"; reason: string;
};
type PreviewLink = { fromLocalId: string; toLocalId: string; relationKey: string; evidence: string };

/** Read-only dry-run. Extract candidate records, never execute an INSERT or UPSERT. */
export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { importId } = await context.params;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const imported = await prisma.knowledge_imports.findFirst({
    where: { id: importId, owner_user_id: session.user.id,
      knowledge_libraries: { workspace_id: activeWorkspace.id } },
    select: { knowledge_import_files: {
      where: { status: "text_ready" },
      select: { id: true, extracted_text: true },
    } },
  });
  if (!imported) return Response.json({ error: "Importación no encontrada" }, { status: 404 });
  const body: unknown = await request.json().catch(() => ({}));
  const requested = isObject(body) && Array.isArray(body.fileIds)
    ? body.fileIds.filter((v): v is string => typeof v === "string") : [];
  const requestedKeys = isObject(body) && Array.isArray(body.existingKeys)
    ? body.existingKeys.filter((v): v is string => typeof v === "string") : [];
  const files = imported.knowledge_import_files.filter(file =>
    requested.includes(file.id) && file.extracted_text.trim());
  if (!files.length) return Response.json({ error: "No hay documentos extraídos para preparar registros" }, { status: 409 });
  const types = await prisma.engine_object_types.findMany({
    where: { workspace_id: activeWorkspace.id, status: "active" },
    select: { key: true, name: true, engine_field_definitions: {
      where: { status: "active" }, select: { key: true, name: true, field_type: true },
    } },
  });
  const allowed = types.filter(type => requestedKeys.includes(type.key));
  const fieldsByType = new Map(allowed.map(type => [type.key,
    new Map(type.engine_field_definitions.map(field => [field.key, field.field_type]))]));
  const typeIds = await prisma.engine_object_types.findMany({
    where: { workspace_id: activeWorkspace.id, status: "active" },
    select: { id: true, key: true },
  });
  const typeKeyById = new Map(typeIds.map(type => [type.id, type.key]));
  const relations = await prisma.engine_relation_definitions.findMany({
    where: { workspace_id: activeWorkspace.id, status: "active" },
    select: { key: true, from_object_type_id: true, to_object_type_id: true, cardinality: true },
  });
  const relationDefs = relations.map(relation => ({
    key: relation.key,
    from: typeKeyById.get(relation.from_object_type_id) ?? "",
    to: typeKeyById.get(relation.to_object_type_id) ?? "",
    cardinality: relation.cardinality,
  })).filter(relation => relation.from && relation.to);
  const results = [];
  for (const file of files) {
    const started = Date.now();
    // Deliberately bounded pilot: one contiguous source block. Report coverage explicitly.
    const chunk = splitEngineDocument(file.extracted_text, 2600)[0] ?? "";
    const rows: PreviewRow[] = [];
    const links: PreviewLink[] = [];
    const unresolvedLinks: string[] = [];
    const issues: string[] = [];
    try {
      if (!allowed.length) {
        results.push({ id: file.id, status: "completed", rows, links, unresolvedLinks, issues: [
          "No hay estructuras existentes validadas para esta extracción. No se han propuesto registros."
        ], sourceChars: file.extracted_text.length, analyzedChars: 0,
          partial: true, durationMs: Date.now() - started, error: null });
        continue;
      }
      const response = await getOpenAIClient().responses.create({
        model: getKnowledgeImportModel(),
        reasoning: { effort: "low" },
        instructions: [
          "Return a valid JSON object only.",
          "Extract individual business records from the supplied document block.",
          "Use ONLY the existing entity keys and field keys supplied in the JSON input.",
          "Do not invent values, units, relationships, identifiers or fields.",
          "Every record must have a short verbatim evidence substring in the document block.",
          "Never treat a document heading as a row unless it describes a real entity.",
          "If a record requires fields absent from the existing schema, list a short issue instead.",
          "Return JSON {rows:[{entityKey,values,evidence}],links:[{fromIndex,toIndex,relationKey,evidence}],unresolvedLinks:[],issues:[]}.",
          "Links use zero-based indices into the rows array, and only supplied existing relation keys.",
          "Only link records both explicitly present in the supplied block. Never infer absent endpoints.",
          "If a link cannot be resolved, put a short explanation in unresolvedLinks instead.",
          "Maximum 15 rows and 20 links.",
          "This is a dry run: do not create anything.",
        ].join("\n"),
        input: JSON.stringify({ format: "json", document: chunk,
          existingRelations: relationDefs,
          existing: allowed.map(type => ({ key: type.key, name: type.name,
            fields: type.engine_field_definitions.map(field => ({
              key: field.key, type: field.field_type,
            })) })) }),
        text: { format: { type: "json_object" } },
        max_output_tokens: 4000,
      }, { timeout: 60000, maxRetries: 0 });
      const output = response.output_text?.trim() ?? "";
      if (response.status !== "completed" || !output)
        throw new Error("Respuesta de extracción incompleta: " +
          (response.incomplete_details?.reason ?? response.status));
      let parsed: unknown;
      try { parsed = JSON.parse(output); }
      catch { throw new Error("La IA devolvió un JSON de registros inválido o truncado"); }
      if (!isObject(parsed)) throw new Error("La respuesta no es un objeto JSON");
      if (Array.isArray(parsed.issues))
        issues.push(...parsed.issues.slice(0, 12).map(v => str(v)).filter(Boolean));
      const candidates = Array.isArray(parsed.rows) ? parsed.rows.slice(0, 15) : [];
      const acceptedByIndex = new Map<number, PreviewRow>();
      for (const [index, candidate] of candidates.entries()) {
        if (!isObject(candidate)) { issues.push("Fila " + (index + 1) + ": formato inválido"); continue; }
        const key = str(candidate.entityKey, 100);
        const evidence = str(candidate.evidence, 350);
        const schemaFields = fieldsByType.get(key);
        if (!schemaFields || !evidence || !chunk.includes(evidence) || !isObject(candidate.values)) {
          issues.push("Fila " + (index + 1) + ": entidad o evidencia no validada");
          continue;
        }
        const values: PreviewRow["values"] = {};
        let invalid = false;
        for (const [field, value] of Object.entries(candidate.values)) {
          const type = schemaFields.get(field);
          if (!type || (value !== null && typeof value !== "string" &&
              typeof value !== "number" && typeof value !== "boolean")) { invalid = true; break; }
          if (value !== null) {
            if (type === "integer" && !(typeof value === "number" && Number.isSafeInteger(value))) invalid = true;
            if (type === "decimal" && !(typeof value === "number" && Number.isFinite(value))) invalid = true;
            if (type === "boolean" && typeof value !== "boolean") invalid = true;
            if (["text", "long_text", "enum", "date", "datetime"].includes(type) && typeof value !== "string") invalid = true;
            if (typeof value === "string" && !file.extracted_text.toLowerCase().includes(value.toLowerCase())) invalid = true;
            if (typeof value === "number" && !chunk.match(/-?\d+(?:[.,]\d+)*/g)?.some(token => Number(token.replace(",", ".")) === value)) invalid = true;
          }
          values[field] = value as string | number | boolean | null;
        }
        if (invalid || !Object.keys(values).length) {
          issues.push("Fila " + (index + 1) + ": valores o campos no verificables");
          continue;
        }
        const row: PreviewRow = { localId: "preview_" + (index + 1), entityKey: key, values, evidence,
          disposition: "candidate", reason: "Sin comprobar identidad ni duplicados" };
        rows.push(row);
        acceptedByIndex.set(index, row);
      }
      const relationByKey = new Map(relationDefs.map(relation => [relation.key, relation]));
      const proposedLinks = Array.isArray(parsed.links) ? parsed.links.slice(0, 20) : [];
      for (const [index, item] of proposedLinks.entries()) {
        if (!isObject(item)) { unresolvedLinks.push("Vínculo " + (index + 1) + ": formato inválido"); continue; }
        const from = typeof item.fromIndex === "number" && Number.isInteger(item.fromIndex)
          ? acceptedByIndex.get(item.fromIndex) : undefined;
        const to = typeof item.toIndex === "number" && Number.isInteger(item.toIndex)
          ? acceptedByIndex.get(item.toIndex) : undefined;
        const relationKey = str(item.relationKey, 100);
        const evidence = str(item.evidence, 350);
        const definition = relationByKey.get(relationKey);
        if (!from || !to || !definition || definition.from !== from.entityKey ||
            definition.to !== to.entityKey || !evidence || !chunk.includes(evidence)) {
          unresolvedLinks.push("Vínculo " + (index + 1) + ": referencias, relación o evidencia no verificables");
          continue;
        }
        if (!links.some(link => link.fromLocalId === from.localId &&
            link.toLocalId === to.localId && link.relationKey === relationKey)) {
          links.push({ fromLocalId: from.localId, toLocalId: to.localId, relationKey, evidence });
        }
      }
      if (Array.isArray(parsed.unresolvedLinks))
        unresolvedLinks.push(...parsed.unresolvedLinks.slice(0, 12).map(v => str(v)).filter(Boolean));
      // An association record without validated links is not ready for insertion.
      const connected = new Set(links.flatMap(link => [link.fromLocalId, link.toLocalId]));
      for (const row of rows) {
        if (relationDefs.some(relation => relation.from === row.entityKey ||
            relation.to === row.entityKey) && !connected.has(row.localId)) {
          row.disposition = "pending";
          row.reason = "Sin vínculos concretos verificados para este registro";
        }
      }
      results.push({ id: file.id, status: "completed", rows, links, unresolvedLinks, issues,
        sourceChars: file.extracted_text.length, analyzedChars: chunk.length,
        partial: chunk.length < file.extracted_text.length,
        durationMs: Date.now() - started, error: null });
    } catch (error) {
      results.push({ id: file.id, status: "error", rows: [], links: [], unresolvedLinks: [], issues,
        sourceChars: file.extracted_text.length, analyzedChars: chunk.length,
        partial: true, durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error) });
    }
  }
  return Response.json({ stage: "record_preview", writesPerformed: false,
    insertExecuted: false, identityValidated: false, referencesValidated: true, files: results });
}
