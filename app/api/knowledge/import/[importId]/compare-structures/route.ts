import { auth } from "@/auth";
import { getKnowledgeImportModel, getOpenAIClient } from "@/lib/ai/openai";
import { buildSchemaOverview } from "@/lib/engine/ingestion/progressive-analysis.service";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
type Context = { params: Promise<{ importId: string }> };
type Match = { concept: string; existingKey: string; reason: string; evidence: string };
type Missing = { concept: string; suggestedName: string; fields: string[]; reason: string; evidence: string };
const string = (value: unknown, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Isolated, read-only semantic comparison. No schema creation or Knowledge confirmation. */
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
      select: { id: true, file_name: true, extracted_text: true },
    } },
  });
  if (!imported) return Response.json({ error: "Importación no encontrada" }, { status: 404 });
  const payload: unknown = await request.json().catch(() => ({}));
  const requestedIds = object(payload) && Array.isArray(payload.fileIds)
    ? payload.fileIds.filter((id): id is string => typeof id === "string") : [];
  const files = imported.knowledge_import_files.filter(file =>
    requestedIds.includes(file.id) && file.extracted_text.trim());
  if (!files.length) return Response.json({ error: "No hay archivos extraídos para comparar" }, { status: 409 });

  const types = await prisma.engine_object_types.findMany({
    where: { workspace_id: activeWorkspace.id, status: "active" },
    select: { key: true, name: true, description: true, engine_field_definitions: {
      where: { status: "active" }, select: { key: true, name: true, field_type: true },
    } },
  });
  const existing = types.map(type => ({
    key: type.key, name: type.name, description: type.description?.slice(0, 120),
    fields: type.engine_field_definitions.slice(0, 24).map(field => ({
      key: field.key, name: field.name, type: field.field_type,
    })),
  }));
  const results = [];
  for (const file of files) {
    // Micro-stage 3A: match existing schemas ONLY. No missing-schema design.
    // Use a small distributed document sample and compact schema signatures.
    const sample = buildSchemaOverview(file.extracted_text, 1100);
    const compactExisting = existing.map(type => ({
      key: type.key, name: type.name,
      fields: type.fields.slice(0, 6).map(field => field.key),
    }));
    const started = Date.now();
    try {
      const response = await getOpenAIClient().responses.create({
        model: getKnowledgeImportModel(),
        instructions: [
          "Return a JSON object only.",
          "Micro-task: match business entity types in the document to existing database types.",
          "Do not design new tables, fields, relations or records.",
          "A flavor or product name is a record, NOT an entity type.",
          "Use an existingKey from the supplied list, and an exact short evidence quote from the document.",
          "If unsure, omit the match.",
          "Return JSON {matches:[{concept,existingKey,reason,evidence}],missing:[],uncertain:[]}.",
          "Maximum 4 matches. Reasons under 12 words. No additional explanation.",
        ].join("\n"),
        input: JSON.stringify({
          format: "json",
          task: "Return a compact JSON object matching only existing schemas.",
          document: sample,
          existing: compactExisting,
        }),
        text: { format: { type: "json_object" } },
        max_output_tokens: 1800,
      }, { timeout: 18000, maxRetries: 0 });
      // Responses can finish with no visible output (e.g. reasoning budget)
      // or with a truncated JSON object. Distinguish those cases explicitly.
      const output = response.output_text?.trim() ?? "";
      if (response.status === "incomplete") {
        const reason = response.incomplete_details?.reason ?? "unknown";
        throw new Error(`Respuesta de IA incompleta (${reason}; ${output.length} caracteres). No se ha analizado el JSON.`);
      }
      if (response.status !== "completed") {
        throw new Error(`La IA no completó la respuesta (estado: ${response.status}).`);
      }
      if (!output) {
        throw new Error("La IA completó la petición sin texto JSON. Revisa el modelo configurado y el consumo de tokens.");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(output);
      } catch {
        throw new Error(`La IA devolvió JSON inválido o truncado (${output.length} caracteres). No se ha aplicado ninguna propuesta.`);
      }
      if (!object(parsed)) throw new Error("Respuesta semántica no válida");
      const keys = new Set(types.map(type => type.key));
      const matches: Match[] = (Array.isArray(parsed.matches) ? parsed.matches : [])
        .filter(object).slice(0, 8).map(item => ({
          concept: string(item.concept), existingKey: string(item.existingKey),
          reason: string(item.reason), evidence: string(item.evidence),
        })).filter(item => item.concept && keys.has(item.existingKey) &&
          item.evidence && sample.includes(item.evidence));
      const missing: Missing[] = (Array.isArray(parsed.missing) ? parsed.missing : [])
        .filter(object).slice(0, 6).map(item => ({
          concept: string(item.concept), suggestedName: string(item.suggestedName),
          fields: (Array.isArray(item.fields) ? item.fields : []).map(value => string(value, 70)).filter(Boolean).slice(0, 12),
          reason: string(item.reason), evidence: string(item.evidence),
        })).filter(item => item.concept && item.evidence && sample.includes(item.evidence) &&
          !matches.some(match => match.concept.toLowerCase() === item.concept.toLowerCase()));
      results.push({ id: file.id, status: "completed", durationMs: Date.now() - started, matches, missing,
        uncertain: (Array.isArray(parsed.uncertain) ? parsed.uncertain : []).map(value => string(value)).filter(Boolean).slice(0, 8),
        error: null });
    } catch (error) {
      results.push({ id: file.id, status: "error", durationMs: Date.now() - started, matches: [] as Match[], missing: [] as Missing[],
        uncertain: [] as string[], error: error instanceof Error ? error.message : String(error) });
    }
  }
  return Response.json({ files: results, writesPerformed: false, stage: "match_existing_only", missingStructureAnalysisExecuted: false });
}
