import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EXTRACTOR_UPLOAD_TYPE } from "../extractor/contract";
import type { BaseReadingState } from "../base-reading/contract";
import { classifyFile } from "./classify";
import { CLASSIFIER_REVISION, classificationResult, type ClassificationState, type ClassifiedFile } from "./contract";

/** Batch payload: the base reading (read-only here), other modules' checkpoints, and this module's own. */
export type ClassifiableIntake = { lecturaBase?: BaseReadingState; clasificacion?: ClassificationState; [key: string]: unknown };

type Deps = { classifyFile: typeof classifyFile };

/**
 * Runs after an atomic claim (`claimed` is the exact payload the claim wrote). One model call per file;
 * each classified file is saved before the next, so a retry never repeats calls for finished files.
 */
export async function runClassification(batchId: string, claimed: ClassifiableIntake, lease: string, deps: Deps = { classifyFile }) {
  let current = claimed;
  const save = async (state: ClassificationState) => {
    const next = JSON.parse(JSON.stringify({ ...current, clasificacion: state })) as ClassifiableIntake;
    const saved = await prisma.knowledge_imports.updateMany({
      where: { id: batchId, upload_type: EXTRACTOR_UPLOAD_TYPE, status: { not: "intake_running" }, proposal_json: { equals: current as unknown as Prisma.InputJsonValue } },
      data: { proposal_json: next as unknown as Prisma.InputJsonValue, updated_at: new Date() } });
    if (saved.count !== 1) throw new Error("La clasificación ha cambiado; no se sobrescribe");
    current = next;
  };
  const done: ClassifiedFile[] = [...(claimed.clasificacion?.archivos ?? [])];
  try {
    const reading = claimed.lecturaBase?.resultado;
    if (reading?.module !== "base_reading") throw new Error("Falta la lectura base del lote");
    for (const file of reading.archivos) {
      if (done.some(d => d.archivoId === file.archivoId)) continue;
      done.push(await deps.classifyFile(file));
      await save({ status: "running", revision: CLASSIFIER_REVISION, lease: new Date().toISOString(), archivos: done });
    }
    const archivos = reading.archivos.map(file => done.find(d => d.archivoId === file.archivoId)!);
    await save({ status: "completed", revision: CLASSIFIER_REVISION, lease, archivos, resultado: classificationResult(batchId, archivos) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al clasificar el lote";
    await save({ status: "error", revision: CLASSIFIER_REVISION, lease, archivos: done, error: message }).catch(() => undefined);
  }
}
