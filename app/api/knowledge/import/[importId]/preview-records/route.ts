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
  const results = [];
  for (const file of files) {
    const started = Date.now();
    // Deliberately bounded pilot: one contiguous source block. Report coverage explicitly.
    const chunk = splitEngineDocument(file.extracted_text, 2600)[0] ?? "";
    const rows: PreviewRow[] = [];
    const issues: string[] = [];
    try {
      if (!allowed.length) {
        results.push({ id: file.id, status: "completed", rows, issues: [
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
          "Return JSON {rows:[{entityKey,values,evidence}],issues:[]}. Maximum 15 rows.",
          "This is a dry run: do not create anything.",
        ].join("\n"),
        input: JSON.stringify({ format: "json", document: chunk,
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
        rows.push({ localId: "preview_" + (index + 1), entityKey: key, values, evidence,
          disposition: "candidate", reason: "Sin comprobar identidad, duplicados ni referencias" });
      }
      results.push({ id: file.id, status: "completed", rows, issues,
        sourceChars: file.extracted_text.length, analyzedChars: chunk.length,
        partial: chunk.length < file.extracted_text.length,
        durationMs: Date.now() - started, error: null });
    } catch (error) {
      results.push({ id: file.id, status: "error", rows: [], issues,
        sourceChars: file.extracted_text.length, analyzedChars: chunk.length,
        partial: true, durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error) });
    }
  }
  return Response.json({ stage: "record_preview", writesPerformed: false,
    insertExecuted: false, identityValidated: false, files: results });
}
