import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readKnowledgeFile } from "@/lib/storage/knowledge-storage";
import { EXTRACTOR_UPLOAD_TYPE, type ExtractionResult, type ExtractedFile } from "../extractor/contract";
import { verifyPage } from "./compare";
import { VERIFIER_REVISION, verificationReport, type FileReference, type FileReport, type VerificationState } from "./contract";
import { readReference } from "./reference";

/** Batch payload as stored by the extractor, plus this module's own checkpoint. The extraction is read-only here. */
export type VerifiableIntake = { version: 1; archivos: ExtractedFile[]; resultado?: ExtractionResult; verificacion?: VerificationState; [key: string]: unknown };

type Deps = { readReference: typeof readReference; readFile: (storagePath: string) => Promise<Buffer> };
const defaults: Deps = { readReference, readFile: readKnowledgeFile };

export function verifyFile(file: ExtractedFile, reference: FileReference | undefined): FileReport {
  if (file.metodo !== "pdf_visual" || !reference) {
    return { archivoId: file.archivoId, archivo: file.archivo, metodo: file.metodo, paginas: file.paginas.map(p => ({
      numero: p.numero, referencia: "sin_referencia" as const, literales: [], columnas: [], omisiones: [],
      avisos: [file.metodo === "hoja_nativa" ? "Hoja leída celda a celda sin IA; no requiere verificación visual" : "Formato sin maquetación visual verificable"] })) };
  }
  if (reference.paginas.length !== file.paginas.length) throw new Error(`${file.archivo}: la lectura y el documento no tienen el mismo número de páginas`);
  return { archivoId: file.archivoId, archivo: file.archivo, metodo: file.metodo,
    paginas: file.paginas.map((page, i) => verifyPage(page, reference.paginas[i])) };
}

/**
 * Runs after an atomic claim (`claimed` is the exact payload written by the claim).
 * Independent readings are persisted as soon as they exist, so a retry or a new comparison
 * revision never pays for OCR again.
 */
export async function runVerification(batchId: string, claimed: VerifiableIntake, lease: string, deps: Deps = defaults) {
  let current = claimed;
  const save = async (state: VerificationState) => {
    const next = JSON.parse(JSON.stringify({ ...current, verificacion: state })) as VerifiableIntake;
    const saved = await prisma.knowledge_imports.updateMany({
      where: { id: batchId, upload_type: EXTRACTOR_UPLOAD_TYPE, status: "intake_completed", proposal_json: { equals: current as unknown as Prisma.InputJsonValue } },
      data: { proposal_json: next as unknown as Prisma.InputJsonValue, updated_at: new Date() } });
    if (saved.count !== 1) throw new Error("La revisión ha cambiado; no se sobrescribe");
    current = next;
  };
  const referencias = [...(claimed.verificacion?.referencias ?? [])];
  try {
    const extraction = claimed.resultado;
    if (extraction?.module !== "document_extractor") throw new Error("Falta la lectura completa del lote");
    const pending = extraction.archivos.filter(f => f.metodo === "pdf_visual" && !referencias.some(r => r.archivoId === f.archivoId));
    if (pending.length) {
      const files = await prisma.knowledge_import_files.findMany({ where: { import_id: batchId, id: { in: pending.map(f => f.archivoId) } }, select: { id: true, storage_path: true } });
      for (const file of pending) {
        const path = files.find((f: { id: string; storage_path: string | null }) => f.id === file.archivoId)?.storage_path;
        if (!path) throw new Error(`${file.archivo}: falta el original para verificar la lectura`);
        referencias.push({ archivoId: file.archivoId, paginas: await deps.readReference(await deps.readFile(path)) });
        await save({ status: "running", revision: VERIFIER_REVISION, lease, referencias });
      }
    }
    const archivos = extraction.archivos.map(f => verifyFile(f, referencias.find(r => r.archivoId === f.archivoId)));
    await save({ status: "completed", revision: VERIFIER_REVISION, lease, referencias, resultado: verificationReport(batchId, archivos) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al verificar la lectura";
    await save({ status: "error", revision: VERIFIER_REVISION, lease, referencias, error: message }).catch(() => undefined);
  }
}
