import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readKnowledgeFile } from "@/lib/storage/knowledge-storage";
import { EXTRACTOR_UPLOAD_TYPE, type ExtractionResult, type ExtractedFile, type Page } from "../extractor/contract";
import { verifyPage } from "./compare";
import { VERIFIER_REVISION, verificationReport, type FileReference, type FileReport, type PageReference, type VerificationState } from "./contract";
import { readReference } from "./reference";
import type { BaseReadingState } from "../base-reading/contract";

/** Batch payload as stored by the extractor, plus this module's own checkpoint. The extraction is read-only here. */
export type VerifiableIntake = { version: 1; archivos: ExtractedFile[]; resultado?: ExtractionResult; verificacion?: VerificationState; lecturaBase?: BaseReadingState; [key: string]: unknown };

type Deps = { readReference: typeof readReference; readFile: (storagePath: string) => Promise<Buffer> };
const defaults: Deps = { readReference, readFile: readKnowledgeFile };

export function verifyFile(file: ExtractedFile, reference: FileReference | undefined): FileReport {
  if (file.metodo !== "pdf_visual" || !reference) {
    return { archivoId: file.archivoId, archivo: file.archivo, metodo: file.metodo, paginas: file.paginas.map(p => ({
      numero: p.numero, referencia: "sin_referencia" as const, literales: [], columnas: [], omisiones: [],
      avisos: [file.metodo === "hoja_nativa" ? "Hoja leída celda a celda sin IA; no requiere verificación visual" : "Formato sin maquetación visual verificable"] })) };
  }
  if (reference.paginas.length !== file.paginas.length) throw new Error(`${file.archivo}: la lectura y el documento no tienen el mismo número de páginas`);
  const order = matchPages(file.paginas, reference.paginas);
  return { archivoId: file.archivoId, archivo: file.archivo, metodo: file.metodo,
    paginas: file.paginas.map((page, i) => {
      const report = verifyPage(page, reference.paginas[order[i]]);
      if (order[i] === i) return report;
      // The reading must keep the document's physical page order; it is compared with the page it actually transcribes.
      report.avisos.unshift(`La página ${i + 1} de la lectura corresponde a la página ${order[i] + 1} del PDF: la lectura ha cambiado el orden de las páginas`);
      return { ...report, paginaDocumento: order[i] + 1 };
    }) };
}

const pageWords = (text: string) => new Set((text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []));
function readingText(page: Page) {
  return page.bloques.map(b => b.tipo === "texto" ? b.texto : [b.columnas, ...b.filas].flat().join(" ")).join(" ");
}
/**
 * For each page of the reading, the PDF page it actually transcribes. Pages keep their own number unless
 * another page shares clearly more words (a reading that reordered pages, e.g. by the printed "Página 1 de 4").
 */
export function matchPages(reading: Page[], reference: PageReference[]): number[] {
  const refs = reference.map(r => pageWords(r.palabras.map(w => w.t).join(" ")));
  return reading.map((page, i) => {
    const words = pageWords(readingText(page));
    if (!words.size || reference[i]?.fuente === "sin_referencia") return i;
    const score = (j: number) => [...words].filter(w => refs[j].has(w)).length / words.size;
    let best = i;
    refs.forEach((_, j) => { if (score(j) > score(best)) best = j; });
    return best !== i && score(best) >= 0.5 && score(best) >= score(i) + 0.25 ? best : i;
  });
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
      where: { id: batchId, upload_type: EXTRACTOR_UPLOAD_TYPE, status: { not: "intake_running" }, proposal_json: { equals: current as unknown as Prisma.InputJsonValue } },
      data: { proposal_json: next as unknown as Prisma.InputJsonValue, updated_at: new Date() } });
    if (saved.count !== 1) throw new Error("La revisión ha cambiado; no se sobrescribe");
    current = next;
  };
  const referencias = [...(claimed.verificacion?.referencias ?? [])];
  // The base reading already holds the positioned words of every PDF page: reused, never read or paid again.
  const fromBase = (archivoId: string): FileReference | undefined => {
    const file = claimed.lecturaBase?.resultado?.archivos.find(f => f.archivoId === archivoId && f.metodo === "pdf");
    return file ? { archivoId, paginas: file.referencias } : undefined;
  };
  const referenceOf = (archivoId: string) => referencias.find(r => r.archivoId === archivoId) ?? fromBase(archivoId);
  try {
    const extraction = claimed.resultado;
    if (extraction?.module !== "document_extractor") throw new Error("Falta la lectura completa del lote");
    // Only batches without a base reading (older uploads) read the originals here.
    const pending = extraction.archivos.filter(f => f.metodo === "pdf_visual" && !referenceOf(f.archivoId));
    if (pending.length) {
      const files = await prisma.knowledge_import_files.findMany({ where: { import_id: batchId, id: { in: pending.map(f => f.archivoId) } }, select: { id: true, storage_path: true } });
      for (const file of pending) {
        const path = files.find((f: { id: string; storage_path: string | null }) => f.id === file.archivoId)?.storage_path;
        if (!path) throw new Error(`${file.archivo}: falta el original para verificar la lectura`);
        referencias.push({ archivoId: file.archivoId, paginas: await deps.readReference(await deps.readFile(path)) });
        await save({ status: "running", revision: VERIFIER_REVISION, lease, referencias });
      }
    }
    const archivos = extraction.archivos.map(f => verifyFile(f, referenceOf(f.archivoId)));
    await save({ status: "completed", revision: VERIFIER_REVISION, lease, referencias, resultado: verificationReport(batchId, archivos) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al verificar la lectura";
    await save({ status: "error", revision: VERIFIER_REVISION, lease, referencias, error: message }).catch(() => undefined);
  }
}
