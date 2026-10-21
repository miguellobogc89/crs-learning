import { auth } from "@/auth";
import { analyzeStructuredDocument } from "@/lib/engine/ingestion/analyze-structured-document.service";
import { buildSimulationManifest } from "@/lib/engine/ingestion/simulation-manifest";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ importId: string }> };
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
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
  const files = imported.knowledge_import_files.filter(file =>
    requested.includes(file.id) && file.extracted_text.trim());
  if (!files.length) return Response.json({ error: "No hay documentos extraídos para preparar registros" }, { status: 409 });
  const types = await prisma.engine_object_types.findMany({
    where: { workspace_id: activeWorkspace.id, status: "active" },
    select: { key: true, name: true, engine_field_definitions: {
      where: { status: "active" }, select: { key: true, name: true, field_type: true },
    } },
  });
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
    fromEntity: typeKeyById.get(relation.from_object_type_id) ?? "",
    toEntity: typeKeyById.get(relation.to_object_type_id) ?? "",
    cardinality: relation.cardinality,
  })).filter(relation => relation.fromEntity && relation.toEntity);
  const results = [];
  for (const file of files) {
    const started = Date.now();
    try {
      // Read-only analysis shares the existing schema/evidence validator, never the importer.
      // Fail explicitly above the bounded context instead of silently exporting a prefix.
      if (file.extracted_text.length > 60000)
        throw new Error("Documento superior al límite de simulación de 60000 caracteres; no se ha generado un manifiesto parcial.");
      const existing = {
        entities: types.map(type => ({ key: type.key,
          fields: type.engine_field_definitions.map(field => ({ key: field.key, type: field.field_type })) })),
        relations: relationDefs,
      };
      const analysis = await analyzeStructuredDocument({ workspaceId: activeWorkspace.id,
        documentId: file.id, text: file.extracted_text, sourceLimit: 60000, existingSchema: existing });
      if (!analysis.schema.valid || !analysis.schema.proposal || analysis.truncated)
        throw new Error("Esquema de simulación inválido: " + JSON.stringify(analysis.schema.issues));
      const manifest = buildSimulationManifest({ proposal: analysis.schema.proposal,
        rows: analysis.rows, links: analysis.links, text: file.extracted_text, existing });
      const issues = [...analysis.issues, ...manifest.issues, ...analysis.schema.proposal.warnings];
      const partial = analysis.issues.length > 0 || manifest.issues.length > 0 || manifest.unresolvedLinks.length > 0 ||
        analysis.rows.length >= 150 || analysis.links.length >= 300;
      if (analysis.rows.length >= 150 || analysis.links.length >= 300)
        issues.push("Se alcanzó el límite de extracción; revisar cobertura antes de importar.");
      results.push({ id: file.id, status: "completed", ...manifest, issues,
        sourceChars: file.extracted_text.length, analyzedChars: analysis.sourceChars,
        partial, durationMs: Date.now() - started, error: null });
    } catch (error) {
      results.push({ id: file.id, status: "error", rows: [], links: [], unresolvedLinks: [], issues: [],
        entities: [], relations: [], sourceChars: file.extracted_text.length, analyzedChars: 0,
        partial: true, durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error) });
    }
  }
  return Response.json({ stage: "record_preview", writesPerformed: false,
    insertExecuted: false, identityValidated: false, referencesValidated: false, files: results });
}
