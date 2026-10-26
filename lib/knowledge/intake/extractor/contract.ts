export const EXTRACTOR_UPLOAD_TYPE = "intake-extractor-v1";
export type TextBlock = { tipo: "texto"; texto: string };
export type TableBlock = { tipo: "tabla"; columnas: string[]; filas: (string | null)[][] };
export type Page = { numero: number; bloques: (TextBlock | TableBlock)[]; incidencias: string[] };
export type ExtractedDocument = { metodo: "pdf_visual" | "texto_nativo" | "hoja_nativa"; paginas: Page[] };
export type ExtractedFile = ExtractedDocument & { archivoId: string; archivo: string };
export type ExtractionResult = { module: "document_extractor"; version: 1; loteId: string; archivos: ExtractedFile[] };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function keys(item: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(item).some(key => !allowed.includes(key))) throw new Error("La extracción contiene propiedades ajenas al documento");
}
/** Strings retain the printed representation. Empty string is a visibly blank cell; null is unreadable. */
export function validateExtraction(raw: unknown, pageCount: number): Page[] {
  if (!Number.isInteger(pageCount) || pageCount < 1 || !object(raw)) throw new Error("Extracción JSON inválida o documento sin páginas");
  keys(raw,["paginas"]);
  if (!Array.isArray(raw.paginas) || raw.paginas.length !== pageCount) throw new Error("La extracción no contiene todas las páginas");
  return raw.paginas.map((value,index): Page => {
    if (!object(value)) throw new Error("Página inválida");
    keys(value,["numero","bloques","incidencias"]);
    if (value.numero !== index+1 || !Array.isArray(value.bloques) || !Array.isArray(value.incidencias) || !value.incidencias.every(i => typeof i === "string")) throw new Error("Páginas desordenadas o incompletas");
    const incidencias = value.incidencias as string[];
    const bloques = value.bloques.map((block): TextBlock | TableBlock => {
      if (!object(block)) throw new Error("Bloque inválido");
      if (block.tipo === "texto") {
        keys(block,["tipo","texto"]);
        if (typeof block.texto !== "string" || !block.texto.trim()) throw new Error("Bloque de texto vacío");
        return { tipo: "texto", texto: block.texto };
      }
      if (block.tipo !== "tabla") throw new Error("Solo se admiten bloques de texto o tablas documentales");
      keys(block,["tipo","columnas","filas"]);
      if (!Array.isArray(block.columnas) || !block.columnas.length || !block.columnas.every(c => typeof c === "string") ||
          !Array.isArray(block.filas) || !block.filas.every(row => Array.isArray(row) && row.length === (block.columnas as unknown[]).length && row.every(cell => cell === null || typeof cell === "string"))) {
        throw new Error("Tabla inválida: conserva todas las columnas y celdas, incluidas las vacías");
      }
      if (block.filas.some(row => (row as unknown[]).some(cell => cell === null)) && !incidencias.length) throw new Error("Las celdas ilegibles requieren una incidencia explícita");
      return { tipo: "tabla", columnas: block.columnas as string[], filas: block.filas as (string | null)[][] };
    });
    if (!bloques.length && !incidencias.length) throw new Error("Una página sin contenido requiere indicar si está vacía o es ilegible");
    return { numero: index+1, bloques, incidencias };
  });
}
export function extractionResult(loteId: string, archivos: ExtractedFile[]): ExtractionResult {
  return { module: "document_extractor", version: 1, loteId, archivos };
}
export function extractionText(doc: ExtractedDocument) {
  return doc.paginas.map(page => [`--- Página ${page.numero} ---`,...page.bloques.map(block => block.tipo === "texto" ? block.texto : JSON.stringify({ columnas: block.columnas, filas: block.filas })),...page.incidencias].join("\n")).join("\n\n");
}

/** Provider-level shape guarantees complement the local page-count and rectangular-cell checks. */
export const EXTRACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["paginas"], properties: {
    paginas: { type: "array", items: { type: "object", additionalProperties: false, required: ["numero","bloques","incidencias"], properties: {
      numero: { type: "integer" }, incidencias: { type: "array", items: { type: "string" } },
      bloques: { type: "array", items: { anyOf: [
        { type: "object", additionalProperties: false, required: ["tipo","texto"], properties: { tipo: { type: "string", enum: ["texto"] }, texto: { type: "string" } } },
        { type: "object", additionalProperties: false, required: ["tipo","columnas","filas"], properties: { tipo: { type: "string", enum: ["tabla"] }, columnas: { type: "array", items: { type: "string" } }, filas: { type: "array", items: { type: "array", items: { type: ["string","null"] } } } } },
      ] } },
    } } },
  },
};
