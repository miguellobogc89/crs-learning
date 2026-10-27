import path from "node:path";
import { readImageReference, readReference } from "../verifier/reference";
import { isIntakeImage } from "../formats";
import { blocksFromWords, type BaseReadingFile } from "./contract";

type NativeReader = (buffer: Buffer, fileName: string) => Promise<{ metodo: string; paginas: BaseReadingFile["paginas"] }>;
type Deps = { readReference: typeof readReference; readNative: NativeReader; readImage?: typeof readImageReference };

/** Native (no AI) reading for non-PDF formats: spreadsheet cells and document text, from the existing extractor. */
async function readNative(buffer: Buffer, fileName: string) {
  const { extractDocument } = await import("../extractor/extract");
  return extractDocument(buffer, fileName);
}

/**
 * Reads one file without the vision model. PDF: positioned words (own text layer, or Google Vision for image
 * and scanned pages) grouped into line blocks. Other formats: native cells or text.
 */
export async function readBaseFile(buffer: Buffer, archivoId: string, archivo: string, deps: Deps = { readReference, readNative }): Promise<BaseReadingFile> {
  if (path.extname(archivo).toLowerCase() === ".pdf") {
    const referencias = await deps.readReference(buffer);
    return { archivoId, archivo, metodo: "pdf", referencias, paginas: referencias.map(blocksFromWords) };
  }
  if (isIntakeImage(archivo)) {
    // Photos and image files: one page read with Google Vision (OCR), like the image pages of a PDF.
    const referencias = await (deps.readImage ?? readImageReference)(buffer);
    return { archivoId, archivo, metodo: "imagen", referencias, paginas: referencias.map(blocksFromWords) };
  }
  const native = await deps.readNative(buffer, archivo);
  if (native.metodo === "pdf_visual") throw new Error(`${archivo}: la lectura base no usa la IA de visión`);
  return { archivoId, archivo, metodo: native.metodo === "hoja_nativa" ? "hoja_nativa" : "texto_nativo", referencias: [], paginas: native.paginas };
}
