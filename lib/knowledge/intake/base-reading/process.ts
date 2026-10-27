import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readKnowledgeFile } from "@/lib/storage/knowledge-storage";
import { EXTRACTOR_UPLOAD_TYPE } from "../extractor/contract";
import { BASE_READING_REVISION, baseReadingResult, type BaseReadingFile, type BaseReadingState } from "./contract";
import { readBaseFile } from "./read";

/** Batch payload: other modules' checkpoints are carried over untouched; this module owns `lecturaBase`. */
export type BaseReadableIntake = { lecturaBase?: BaseReadingState; [key: string]: unknown };

type Deps = { readBaseFile: typeof readBaseFile; readFile: (storagePath: string) => Promise<Buffer> };

/**
 * Runs after an atomic claim (`claimed` is the exact payload the claim wrote). Each file is saved as soon as it
 * is read, so a retry never reads (or pays OCR for) a finished file again.
 */
export async function runBaseReading(batchId: string, claimed: BaseReadableIntake, lease: string, deps: Deps = { readBaseFile, readFile: readKnowledgeFile }) {
  let current = claimed;
  const save = async (state: BaseReadingState) => {
    const next = JSON.parse(JSON.stringify({ ...current, lecturaBase: state })) as BaseReadableIntake;
    const saved = await prisma.knowledge_imports.updateMany({
      where: { id: batchId, upload_type: EXTRACTOR_UPLOAD_TYPE, proposal_json: { equals: current as unknown as Prisma.InputJsonValue } },
      data: { proposal_json: next as unknown as Prisma.InputJsonValue, updated_at: new Date() } });
    if (saved.count !== 1) throw new Error("La lectura base ha cambiado; no se sobrescribe");
    current = next;
  };
  const done: BaseReadingFile[] = [...(claimed.lecturaBase?.archivos ?? [])];
  try {
    const files: { id: string; file_name: string; storage_path: string | null }[] = await prisma.knowledge_import_files.findMany({ where: { import_id: batchId }, orderBy: { processing_order: "asc" }, select: { id: true, file_name: true, storage_path: true } });
    if (!files.length) throw new Error("El lote no contiene archivos");
    for (const file of files) {
      if (done.some(d => d.archivoId === file.id)) continue;
      if (!file.storage_path) throw new Error(`${file.file_name}: falta el original`);
      done.push(await deps.readBaseFile(await deps.readFile(file.storage_path), file.id, file.file_name));
      await save({ status: "running", revision: BASE_READING_REVISION, lease, archivos: done });
    }
    const archivos = files.map(file => done.find(d => d.archivoId === file.id)!);
    await save({ status: "completed", revision: BASE_READING_REVISION, lease, archivos, resultado: baseReadingResult(batchId, archivos) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error en la lectura base";
    await save({ status: "error", revision: BASE_READING_REVISION, lease, archivos: done, error: message }).catch(() => undefined);
  }
}
