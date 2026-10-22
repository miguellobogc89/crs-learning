import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { getKnowledgeImportModel, getOpenAIClient } from "@/lib/ai/openai";
import { buildSchemaOverview } from "@/lib/engine/ingestion/progressive-analysis.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ importId: string }> };
type LogicalDocument = { kind: string; subtype: string; summary: string; evidence: string; confidence: string; embeddedTables: number; possibleContinuation: boolean };
type FileInventory = { id: string; name: string; characters: number; status: string; documents: LogicalDocument[]; warning: string | null };

export async function POST(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { importId } = await context.params;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const imported = await prisma.knowledge_imports.findFirst({
    where: { id: importId, owner_user_id: session.user.id,
      knowledge_libraries: { workspace_id: activeWorkspace.id } },
    select: { knowledge_import_files: {
      select: { id: true, file_name: true, extracted_text: true, status: true, error_message: true },
    } },
  });
  if (!imported) return Response.json({ error: "Lote no encontrado" }, { status: 404 });
  const files: FileInventory[] = [];
  for (const file of imported.knowledge_import_files) {
    const content = file.extracted_text?.trim() ?? "";
    if (!content) {
      files.push({ id: file.id, name: file.file_name, characters: 0, status: "sin_texto",
        documents: [], warning: file.error_message || "No se ha podido extraer texto; las imágenes no están clasificadas." });
      continue;
    }
    try {
      const sample = buildSchemaOverview(content, 11000);
      const response = await getOpenAIClient().responses.create({
        model: getKnowledgeImportModel(),
        reasoning: { effort: "low" },
        instructions: [
          "Return ONLY JSON. This is document inventory, NOT entity extraction or database schema generation.",
          "Identify distinct logical documents contained in the sample. A table or photograph INSIDE a contract is a component, not a separate document.",
          "Be domain-agnostic. Identify meaningful types and subtypes (invoice/product, invoice/utilities, contract, procedure, etc.) only if evidenced.",
          "Never invent documents, counts, page numbers, or categories. If ambiguous classify as unknown.",
          "For each document quote an EXACT short substring from the supplied sample as evidence.",
          "Return JSON {documents:[{kind,subtype,summary,evidence,confidence,embeddedTables,possibleContinuation}],warning}.",
          "Confidence is high, medium or low. embeddedTables is an integer, count only clearly visible tables.",
          "Maximum 12 logical document candidates per file. If sample is truncated, explain uncertainty in warning.",
        ].join("\n"),
        input: JSON.stringify({ format: "json", fileName: file.file_name, sample, sampledCharacters: sample.length, extractedCharacters: content.length }),
        text: { format: { type: "json_object" } },
        max_output_tokens: 2400,
      }, { timeout: 60000, maxRetries: 1 });
      if (response.status !== "completed" || !response.output_text) throw new Error("Respuesta de IA incompleta");
      const parsed: unknown = JSON.parse(response.output_text);
      const obj = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
      const docs = (Array.isArray(obj.documents) ? obj.documents : []).filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && !Array.isArray(d))
        .slice(0, 12).map(d => ({
          kind: String(d.kind ?? "desconocido").slice(0, 70),
          subtype: String(d.subtype ?? "").slice(0, 90),
          summary: String(d.summary ?? "").slice(0, 220),
          evidence: String(d.evidence ?? "").slice(0, 250),
          confidence: ["high", "medium", "low"].includes(String(d.confidence)) ? String(d.confidence) : "low",
          embeddedTables: Number.isInteger(d.embeddedTables) ? Math.max(0, Math.min(100, Number(d.embeddedTables))) : 0,
          possibleContinuation: d.possibleContinuation === true,
        })).filter(d => d.evidence.length >= 5 && sample.includes(d.evidence));
      files.push({ id: file.id, name: file.file_name, characters: content.length, status: "analizado", documents: docs,
        warning: [typeof obj.warning === "string" ? obj.warning : null,
          sample.length < content.length ? "Análisis sobre una muestra: no garantiza cobertura completa del archivo." : null].filter(Boolean).join(" ") || null });
    } catch (error) {
      files.push({ id: file.id, name: file.file_name, characters: content.length, status: "error",
        documents: [], warning: error instanceof Error ? error.message : "Error de clasificación" });
    }
  }
  const familyCounts: Record<string, number> = {};
  for (const file of files) for (const doc of file.documents)
    familyCounts[doc.kind] = (familyCounts[doc.kind] ?? 0) + 1;
  return Response.json({
    stage: "document_inventory_test_c", writesPerformed: false, schemasCreated: 0,
    fileCount: files.length, documentCandidates: files.reduce((sum, file) => sum + file.documents.length, 0),
    families: Object.entries(familyCounts).map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
    files, warnings: [
      "Inventario provisional basado en texto extraído y muestras; no es una segmentación completa ni verifica páginas.",
      "Los documentos que continúan entre archivos todavía no se fusionan automáticamente.",
    ],
  });
}
