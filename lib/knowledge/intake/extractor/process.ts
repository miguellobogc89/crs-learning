import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readKnowledgeFile } from "@/lib/storage/knowledge-storage";
import { extractDocument } from "./extract";
import { EXTRACTOR_UPLOAD_TYPE, extractionResult, extractionText, type ExtractedFile, type ExtractionResult } from "./contract";
import type { BaseReadingState } from "../base-reading/contract";
import type { ClassificationState } from "../classifier/contract";
import { targetedResult, type TargetedFile, type TargetedResult } from "../targeted/contract";
import { targetedExtractFile } from "../targeted/extract";
export { EXTRACTOR_UPLOAD_TYPE } from "./contract";
/**
 * `archivos` holds full visual readings (no classification available) or targeted extractions (classified
 * batches); `resultado` is the matching batch result once every file is done.
 */
export type ExtractorState = { version: 1; archivos: (ExtractedFile | TargetedFile)[]; resultado?: ExtractionResult | TargetedResult;
  lecturaBase?: BaseReadingState; clasificacion?: ClassificationState };
/** One source per lease; only original storage and staging are touched. */
export async function processExtractor(id: string, lease: Date) {
  const owned = { id, upload_type: EXTRACTOR_UPLOAD_TYPE, status: "intake_running", processing_started_at: lease };
  try {
    const batch = await prisma.knowledge_imports.findFirstOrThrow({ where: owned, include: { knowledge_import_files: { orderBy: { processing_order: "asc" } } } });
    const state = batch.proposal_json as unknown as ExtractorState;
    if (state?.version !== 1 || !Array.isArray(state.archivos)) throw new Error("Estado del extractor inválido");
    const file = batch.knowledge_import_files.find(f => !state.archivos.some(a => a.archivoId === f.id));
    if (!file?.storage_path) throw new Error("Falta un archivo original pendiente de extracción");
    const buffer = await readKnowledgeFile(file.storage_path);
    // Classified batches get the targeted extraction; without a classification (older batches, or a failed one)
    // the full visual reading is kept as before.
    // The mode is decided once for the whole batch, so a result never mixes both kinds of files.
    const targetedBatch = state.clasificacion?.status === "completed" && state.lecturaBase?.status === "completed";
    let entry: ExtractedFile | TargetedFile, text: string;
    if (targetedBatch) {
      const base = state.lecturaBase!.resultado!.archivos.find(b => b.archivoId === file.id);
      if (!base) throw new Error(`${file.file_name}: falta su lectura base`);
      const classified = state.clasificacion!.resultado!.archivos.find(c => c.archivoId === file.id)
        ?? { archivoId: file.id, archivo: file.file_name, partes: [], incidencias: ["Archivo sin clasificación"] };
      entry = await targetedExtractFile(buffer, classified, base);
      // Searchable text of the file: the complete base reading (all text, including what is not extracted).
      text = base.paginas.map(p => [`--- Página ${p.numero} ---`, ...p.bloques.map(b => b.tipo === "texto" ? b.texto : JSON.stringify(b))].join("\n")).join("\n\n");
    } else {
      const document = await extractDocument(buffer, file.file_name);
      entry = { archivoId: file.id, archivo: file.file_name, ...document };
      text = extractionText(document);
    }
    const archivos = [...state.archivos, entry];
    const completed = archivos.length === batch.knowledge_import_files.length;
    const targeted = targetedBatch;
    // Other modules' checkpoints (base reading, classification) are carried over untouched.
    const next: ExtractorState = { ...state, version: 1, archivos, ...(completed ? { resultado: targeted
      ? targetedResult(id, archivos as TargetedFile[]) : extractionResult(id, archivos.filter((a): a is ExtractedFile => "paginas" in a)) } : {}) };
    await prisma.$transaction(async tx => {
      const saved = await tx.knowledge_imports.updateMany({ where: owned, data: { status: completed ? "intake_completed" : "intake_pending", proposal_json: next as unknown as Prisma.InputJsonValue,
        error_message: null, completed_at: completed ? new Date() : null, updated_at: new Date() } });
      if (saved.count !== 1) throw new Error("La ejecución ha cambiado; no se sobrescribió su extracción");
      await tx.knowledge_import_files.update({ where: { id: file.id }, data: { extracted_text: text, status: "text_ready", error_message: null } });
    });
  } catch(error) {
    await prisma.knowledge_imports.updateMany({ where: owned, data: { status: "intake_error", error_message: error instanceof Error ? error.message : "Error del extractor" } });
  }
}
