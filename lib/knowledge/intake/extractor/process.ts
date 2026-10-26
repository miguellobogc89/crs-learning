import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readKnowledgeFile } from "@/lib/storage/knowledge-storage";
import { extractDocument } from "./extract";
import { EXTRACTOR_UPLOAD_TYPE, extractionResult, extractionText, type ExtractedFile, type ExtractionResult } from "./contract";
export { EXTRACTOR_UPLOAD_TYPE } from "./contract";
export type ExtractorState = { version: 1; archivos: ExtractedFile[]; resultado?: ExtractionResult };
/** One source per lease; only original storage and staging are touched. */
export async function processExtractor(id: string, lease: Date) {
  const owned = { id, upload_type: EXTRACTOR_UPLOAD_TYPE, status: "intake_running", processing_started_at: lease };
  try {
    const batch = await prisma.knowledge_imports.findFirstOrThrow({ where: owned, include: { knowledge_import_files: { orderBy: { processing_order: "asc" } } } });
    const state = batch.proposal_json as unknown as ExtractorState;
    if (state?.version !== 1 || !Array.isArray(state.archivos)) throw new Error("Estado del extractor inválido");
    const file = batch.knowledge_import_files.find(f => !state.archivos.some(a => a.archivoId === f.id));
    if (!file?.storage_path) throw new Error("Falta un archivo original pendiente de extracción");
    const document = await extractDocument(await readKnowledgeFile(file.storage_path),file.file_name);
    const archivos = [...state.archivos,{ archivoId: file.id, archivo: file.file_name, ...document }];
    const completed = archivos.length === batch.knowledge_import_files.length;
    const next: ExtractorState = { version: 1, archivos, ...(completed ? { resultado: extractionResult(id,archivos) } : {}) };
    await prisma.$transaction(async tx => {
      const saved = await tx.knowledge_imports.updateMany({ where: owned, data: { status: completed ? "intake_completed" : "intake_pending", proposal_json: next as unknown as Prisma.InputJsonValue,
        error_message: null, completed_at: completed ? new Date() : null, updated_at: new Date() } });
      if (saved.count !== 1) throw new Error("La ejecución ha cambiado; no se sobrescribió su extracción");
      await tx.knowledge_import_files.update({ where: { id: file.id }, data: { extracted_text: extractionText(document), status: "text_ready", error_message: null } });
    });
  } catch(error) {
    await prisma.knowledge_imports.updateMany({ where: owned, data: { status: "intake_error", error_message: error instanceof Error ? error.message : "Error del extractor" } });
  }
}
