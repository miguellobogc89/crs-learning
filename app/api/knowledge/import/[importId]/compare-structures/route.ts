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
    const sample = buildSchemaOverview(file.extracted_text, 2600);
    try {
      const response = await getOpenAIClient().responses.create({
        model: getKnowledgeImportModel(),
        instructions: [
          "You are comparing an untrusted business document with existing database schemas.",
          "Do NOT create schemas, rows, or relations. Return JSON only.",
          "Identify business entity CONCEPTS, not section headings or individual products.",
          "First determine which concepts match an existing schema semantically.",
          "Then identify genuinely missing concepts. Never propose duplicates of an existing schema.",
          "Use only existing keys from input. Provide an EXACT short evidence quote from document for each decision.",
          "If evidence is insufficient, put the concept in uncertain, not missing.",
          "Return {matches:[{concept,existingKey,reason,evidence}],missing:[{concept,suggestedName,fields,reason,evidence}],uncertain:[string]}.",
          "Maximum 8 matches, 6 missing, 8 uncertain; concise reasons and fields.",
        ].join("\n"),
        input: JSON.stringify({ format: "json", task: "Return a valid json object with matches, missing and uncertain arrays.", document: sample, existing }),
        text: { format: { type: "json_object" } },
      }, { timeout: 25000, maxRetries: 0 });
      const parsed: unknown = JSON.parse(response.output_text ?? "{}");
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
      results.push({ id: file.id, status: "completed", matches, missing,
        uncertain: (Array.isArray(parsed.uncertain) ? parsed.uncertain : []).map(value => string(value)).filter(Boolean).slice(0, 8),
        error: null });
    } catch (error) {
      results.push({ id: file.id, status: "error", matches: [] as Match[], missing: [] as Missing[],
        uncertain: [] as string[], error: error instanceof Error ? error.message : String(error) });
    }
  }
  return Response.json({ files: results, writesPerformed: false });
}
