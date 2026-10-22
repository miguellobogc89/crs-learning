import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildImportMap } from "@/lib/knowledge/import/build-import-map";
import { classifyImportContent } from "@/lib/knowledge/import/classify-content";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ importId: string }> };

// Controlled first stage only. Reads extracted text and recognizes document
// structure deterministically. No AI, schema creation or Engine writes.
export async function POST(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { importId } = await context.params;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const imported = await prisma.knowledge_imports.findFirst({
    where: {
      id: importId,
      owner_user_id: session.user.id,
      knowledge_libraries: { workspace_id: activeWorkspace.id },
    },
    select: {
      proposal_json: true,
      knowledge_import_files: {
        select: { id: true, file_name: true, extracted_text: true, status: true, processing_status: true, error_message: true },
      },
    },
  });
  if (!imported) return Response.json({ error: "Importación no encontrada" }, { status: 404 });
  // Stage 2: inspect existing workspace structures, read-only.
  // Do not claim semantic compatibility until a separate matching stage exists.
  const existingTypes = await prisma.engine_object_types.findMany({
    where: { workspace_id: activeWorkspace.id, status: "active" },
    select: {
      id: true, key: true, name: true, description: true,
      engine_field_definitions: {
        where: { status: "active" },
        select: { key: true, name: true, field_type: true },
        orderBy: { sort_order: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
  const existingStructures = existingTypes.map(type => ({
    id: type.id, key: type.key, name: type.name,
    description: type.description,
    fields: type.engine_field_definitions.map(field => ({
      key: field.key, name: field.name, type: field.field_type,
    })),
  }));
  const files = imported.knowledge_import_files.map(file => {
    const text = file.extracted_text ?? "";
    const classification = classifyImportContent(text);
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const delimitedLines = lines.filter(line => /\t|\s\|\s|;/.test(line)).length;
    const numericLines = lines.filter(line => /\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|ud|%)(?:\s|$)/i.test(line)).length;
    // A heading is a section boundary, not simply an uppercase ingredient name.
    // Favor short standalone labels with a following block of content.
    const quantityPattern = /\\d+(?:[.,]\\d+)?\\s*(?:kg|g|ml|l|ud|%)(?:\\s|$)/i;
    const headingCandidates = lines.flatMap((line, index) => {
      const next = lines[index + 1] ?? "";
      const isShort = line.length >= 4 && line.length <= 65;
      const hasQuantity = quantityPattern.test(line);
      const looksLikeHeading = /:$/.test(line) ||
        (/^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\\s()-]{3,}$/.test(line) &&
         !/\\d/.test(line) && line.split(/\\s+/).length <= 7);
      const followingContent = next.length > 0 && next !== line;
      return isShort && !hasQuantity && looksLikeHeading && followingContent
        ? [{ line: index + 1, text: line }] : [];
    });
    // Require surrounding evidence; these are candidates, not validated sections.
    const sectionExamples = headingCandidates.slice(0, 5);
    const quantityExamples = lines.filter(line => quantityPattern.test(line)).slice(0, 5);
    const delimitedExamples = lines.filter(line => /\\t|\\s\\|\\s|;/.test(line)).slice(0, 3);
    // Stage 2 is intentionally a deterministic, preliminary candidate pass.
    // It does not infer a relational schema or invoke the model.
    const conceptCandidates = headingCandidates.slice(0, 8).map(item => item.text);
    return {
      id: file.id,
      fileName: file.file_name,
      sourceChars: text.length,
      documentType: classification.kind === "tables" ? "tabla" : classification.kind === "mixed" ? "hibrido" : classification.kind === "information" ? "texto" : "indeterminado",
      confidence: classification.confidence,
      structuredLines: classification.structuredLines,
      narrativeLines: classification.narrativeLines,
      extractionStatus: file.status,
      extractionProcessingStatus: file.processing_status,
      lines: lines.length,
      delimitedLines,
      numericLines,
      headings: headingCandidates.length,
      sectionExamples,
      quantityExamples,
      delimitedExamples,
      conceptCandidates,
      existingStructures,
      hasStructuredEvidence: delimitedLines + numericLines >= 3,
      status: text.trim() ? "completed" as const : "error" as const,
      error: text.trim() ? null : `No hay texto extraído (estado: ${file.status}, procesamiento: ${file.processing_status}). ${file.error_message ?? "Comprueba la fase de extracción."}`,
    };
  });
  const map = buildImportMap(importId, imported.knowledge_import_files);
  const previous = imported.proposal_json;
  const proposalData = previous && typeof previous === "object" && !Array.isArray(previous)
    ? previous as Record<string, unknown> : {};
  await prisma.knowledge_imports.update({
    where: { id: importId },
    data: { proposal_json: { ...proposalData, globalImportMap: map } },
  });
  return Response.json({
    map,
    stage: "global_map",
    status: files.every(file => file.status === "completed") ? "completed" : "completed_with_issues",
    files,
    writesPerformed: false,
    nextStagesExecuted: false,
    existingStructuresFound: existingStructures.length,
    conceptStage: "preliminary_candidates_only",
  });
}
