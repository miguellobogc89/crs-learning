import type { Page } from "../extractor/contract";
import type { PageReference, RefWord } from "../verifier/contract";

/**
 * Base reading: the first module after upload. It reads every file WITHOUT the vision model:
 * a PDF's own text layer, Google Vision OCR for image or scanned pages, native cells for spreadsheets,
 * native text for other formats. It is cheap, complete (all text, for Knowledge and search) and positioned
 * (words with page coordinates, which the verifier reuses so OCR is paid once per page).
 */
export const BASE_READING_REVISION = 1;

export type BaseReadingFile = {
  archivoId: string; archivo: string;
  metodo: "pdf" | "hoja_nativa" | "texto_nativo";
  /** Positioned words per PDF page (text layer or OCR); empty for non-PDF formats. */
  referencias: PageReference[];
  /** Text grouped into numbered blocks per page, in the reading contract shape used by the classifier. */
  paginas: Page[];
};
export type BaseReadingResult = { module: "base_reading"; version: typeof BASE_READING_REVISION; loteId: string; archivos: BaseReadingFile[] };
export type BaseReadingState = {
  status: "running" | "completed" | "error"; revision: number; lease: string; error?: string;
  /** Files already read: a retry continues after them (no second OCR call). */
  archivos?: BaseReadingFile[];
  resultado?: BaseReadingResult;
};

export function baseReadingResult(loteId: string, archivos: BaseReadingFile[]): BaseReadingResult {
  return { module: "base_reading", version: BASE_READING_REVISION, loteId, archivos };
}

type Line = { text: string; y0: number; y1: number };
/** Rotated text: flagged by the PDF text layer, or (OCR) a tall narrow word box. */
const rotatedWord = (w: RefWord) => !!w.r || (w.y1 - w.y0 > 0.02 && w.y1 - w.y0 > 2.5 * (w.x1 - w.x0));

/** Words of one page → visual lines (top to bottom, left to right). Rotated words are kept apart. */
function lines(words: RefWord[]): Line[] {
  const sorted = words.filter(w => !rotatedWord(w)).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const out: (Line & { words: RefWord[] })[] = [];
  for (const word of sorted) {
    const mid = (word.y0 + word.y1) / 2;
    const line = out.find(l => mid >= l.y0 && mid <= l.y1);
    if (line) { line.words.push(word); line.y1 = Math.max(line.y1, word.y1); }
    else out.push({ text: "", y0: word.y0, y1: word.y1, words: [word] });
  }
  return out.sort((a, b) => a.y0 - b.y0).map(l => ({ y0: l.y0, y1: l.y1, text: l.words.sort((a, b) => a.x0 - b.x0).map(w => w.t).join(" ") }));
}

/**
 * Positioned words → numbered blocks, one per visual line. Lines are the finest layout unit, so the
 * classifier can cut a part exactly where a document starts (two tickets on one page); its ranges keep
 * the output short. Rotated text (margin notes) becomes its own final block. Layout only, no interpretation.
 */
export function blocksFromWords(reference: PageReference): Page {
  if (reference.fuente === "sin_referencia") return { numero: reference.numero, bloques: [], incidencias: [reference.aviso ?? "Página sin lectura base"] };
  const bloques: Page["bloques"] = lines(reference.palabras).map(line => ({ tipo: "texto" as const, texto: line.text }));
  const rotated = reference.palabras.filter(rotatedWord).map(w => w.t).join(" ").trim();
  if (rotated) bloques.push({ tipo: "texto", texto: rotated });
  const incidencias = reference.fuente === "ocr" ? ["Lectura base por reconocimiento de imagen"] : [];
  return { numero: reference.numero, bloques, incidencias: bloques.length ? incidencias : [...incidencias, "Página sin texto legible"] };
}
