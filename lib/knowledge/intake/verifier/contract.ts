/**
 * Reading verifier: deterministic check of the visual extractor's JSON against an independent
 * reading of the original document. No AI decisions; the extraction is never modified.
 *
 * Coordinates are normalised to the page (0..1 in both axes, origin top-left) so that a PDF text
 * layer and an OCR response are directly comparable.
 */
export const VERIFIER_REVISION = 4;

/** Origin of the independent reading of a page. */
export type ReferenceSource = "capa_texto" | "ocr" | "sin_referencia";
/** `r`: the word is printed rotated (margin notes, watermarks); it never belongs to a table row. */
export type RefWord = { t: string; x0: number; y0: number; x1: number; y1: number; r?: true };
export type PageReference = { numero: number; fuente: ReferenceSource; palabras: RefWord[]; aviso?: string };
export type FileReference = { archivoId: string; paginas: PageReference[] };

/** With a text layer a mismatch is a probable model error; OCR can also misread, so it needs review. */
export type Severity = "probable_error" | "revisar";
export type LiteralFinding = {
  donde: string; modelo: string; severidad: Severity;
  estado: "distinto" | "no_encontrado"; documento?: string; diferencias?: { modelo: string; documento: string }[];
};
export type ColumnFinding = { donde: string; valor: string; metodo: "cabecera" | "alineacion"; columnaLectura: string; columnaDocumento: string; severidad: Severity };
export type OmissionFinding = { textoDocumento: string; severidad: Severity };
export type PageReport = {
  numero: number; referencia: ReferenceSource;
  /** Present when the reading placed this page out of the document's order: the PDF page it actually transcribes. */
  paginaDocumento?: number;
  literales: LiteralFinding[]; columnas: ColumnFinding[]; omisiones: OmissionFinding[]; avisos: string[];
};
export type FileReport = { archivoId: string; archivo: string; metodo: string; paginas: PageReport[] };
export type VerificationSummary = { literales: number; columnas: number; omisiones: number; paginasSinReferencia: number; paginasDesordenadas: number; probablesErrores: number; aRevisar: number };
export type VerificationReport = {
  module: "reading_verifier"; version: typeof VERIFIER_REVISION; loteId: string;
  /** The extraction JSON is evidence under review; it is never rewritten by this module. */
  lecturaModificada: false;
  resumen: VerificationSummary; archivos: FileReport[];
};

export type VerificationState = {
  status: "running" | "completed" | "error"; revision: number; lease: string; error?: string;
  /** Persisted independent readings: comparison can be recomputed without another OCR call. */
  referencias?: FileReference[];
  resultado?: VerificationReport;
};

export function summarize(archivos: FileReport[]): VerificationSummary {
  const pages = archivos.flatMap(f => f.paginas);
  const findings = pages.flatMap(p => [...p.literales, ...p.columnas, ...p.omisiones]);
  return {
    literales: pages.reduce((n, p) => n + p.literales.length, 0),
    columnas: pages.reduce((n, p) => n + p.columnas.length, 0),
    omisiones: pages.reduce((n, p) => n + p.omisiones.length, 0),
    paginasSinReferencia: pages.filter(p => p.referencia === "sin_referencia").length,
    paginasDesordenadas: pages.filter(p => p.paginaDocumento !== undefined).length,
    probablesErrores: findings.filter(f => f.severidad === "probable_error").length,
    aRevisar: findings.filter(f => f.severidad === "revisar").length,
  };
}

export function verificationReport(loteId: string, archivos: FileReport[]): VerificationReport {
  return { module: "reading_verifier", version: VERIFIER_REVISION, loteId, lecturaModificada: false, resumen: summarize(archivos), archivos };
}
