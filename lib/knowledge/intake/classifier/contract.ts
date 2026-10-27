import type { ExtractedFile, Page } from "../extractor/contract";
import { checkTaxonomy, FAMILIES } from "./taxonomy";

/**
 * Document classifier: decides WHAT each part of a document is (family, type, subtype) and where it belongs
 * (Engine, Knowledge or both), from the verified visual reading. It extracts no values.
 */
export const CLASSIFIER_REVISION = 1;

export type BlockRange = { pagina: number; desde: number; hasta: number };
export type Evidence = { pagina: number; bloque: number; texto: string };
export type Part = {
  id: string; bloques: BlockRange[];
  familia: string; tipo: string; subtipo: string | null; descripcion: string;
  destino: "engine" | "knowledge" | "hibrido"; contieneTablas: boolean;
  confianza: "alta" | "media" | "baja"; evidencia: Evidence[]; motivo: string;
};
export type ClassifiedFile = { archivoId: string; archivo: string; partes: Part[]; incidencias: string[] };
export type ClassificationResult = { module: "document_classifier"; version: typeof CLASSIFIER_REVISION; loteId: string; archivos: ClassifiedFile[] };
export type ClassificationState = {
  status: "running" | "completed" | "error"; revision: number; lease: string; error?: string;
  /** Files already classified: a retry continues from the next file, without new model calls for these. */
  archivos?: ClassifiedFile[];
  resultado?: ClassificationResult;
};

const MAX_BLOCK_CHARS = 600;
const space = (value: string) => value.normalize("NFKC").replace(/\s+/gu, " ").trim();

/** Plain text of one reading block, as shown to the model and as used to verify quoted evidence. */
export function blockText(block: Page["bloques"][number]) {
  if (block.tipo === "texto") return block.texto;
  return [block.columnas, ...block.filas].filter(row => row.some(cell => cell?.trim())).map(row => row.map(cell => cell ?? "").join(" | ")).join("\n");
}

/** The reading of one file with numbered blocks per page; long blocks are shortened (evidence must come from the shown text). */
export function classifierInput(file: ExtractedFile) {
  return {
    archivo: file.archivo,
    paginas: file.paginas.map(page => ({
      pagina: page.numero,
      bloques: page.bloques.map((block, i) => {
        const text = blockText(block);
        return { bloque: i + 1, tipo: block.tipo, texto: text.length > MAX_BLOCK_CHARS ? `${text.slice(0, MAX_BLOCK_CHARS)} […]` : text };
      }),
    })),
  };
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const int = (value: unknown): value is number => Number.isInteger(value);

/**
 * Validates the model output against the reading: every block belongs to exactly one part, every part fits
 * the taxonomy and quotes literal evidence from the blocks it covers. Shape is guaranteed by code; whether the
 * chosen type is semantically right still needs real documents.
 */
export function validateClassification(raw: unknown, file: ExtractedFile): ClassifiedFile {
  if (!object(raw) || !Array.isArray(raw.partes) || !Array.isArray(raw.incidencias) || !raw.incidencias.every(i => typeof i === "string")) {
    throw new Error(`${file.archivo}: clasificación con formato inválido`);
  }
  if (!raw.partes.length) throw new Error(`${file.archivo}: la clasificación no contiene ninguna parte`);
  const owner = new Map<string, string>();
  const partes = raw.partes.map((value, index): Part => {
    if (!object(value)) throw new Error(`${file.archivo}: parte ${index + 1} inválida`);
    const id = `p${index + 1}`;
    const { familia, tipo, subtipo, descripcion, destino, contieneTablas, confianza, evidencia, motivo, bloques } = value;
    if (typeof familia !== "string" || !FAMILIES.includes(familia as never)) throw new Error(`${file.archivo} ${id}: familia inválida`);
    if (typeof tipo !== "string" || !(subtipo === null || typeof subtipo === "string") || typeof descripcion !== "string") throw new Error(`${file.archivo} ${id}: tipo inválido`);
    const taxonomyError = checkTaxonomy(familia, tipo, subtipo as string | null, descripcion);
    if (taxonomyError) throw new Error(`${file.archivo} ${id}: ${taxonomyError}`);
    if (destino !== "engine" && destino !== "knowledge" && destino !== "hibrido") throw new Error(`${file.archivo} ${id}: destino inválido`);
    if (confianza !== "alta" && confianza !== "media" && confianza !== "baja") throw new Error(`${file.archivo} ${id}: confianza inválida`);
    if (typeof contieneTablas !== "boolean" || typeof motivo !== "string" || !motivo.trim()) throw new Error(`${file.archivo} ${id}: falta el motivo`);
    if (!Array.isArray(bloques) || !bloques.length) throw new Error(`${file.archivo} ${id}: no indica qué bloques abarca`);
    const ranges = bloques.map((range): BlockRange => {
      if (!object(range) || !int(range.pagina) || !int(range.desde) || !int(range.hasta)) throw new Error(`${file.archivo} ${id}: rango de bloques inválido`);
      const page = file.paginas.find(p => p.numero === range.pagina);
      if (!page || range.desde < 1 || range.hasta < range.desde || range.hasta > page.bloques.length) throw new Error(`${file.archivo} ${id}: el rango página ${range.pagina} bloques ${range.desde}-${range.hasta} no existe en la lectura`);
      for (let b = range.desde; b <= range.hasta; b++) {
        const key = `${range.pagina}:${b}`;
        if (owner.has(key)) throw new Error(`${file.archivo}: el bloque ${b} de la página ${range.pagina} está en dos partes (${owner.get(key)} y ${id})`);
        owner.set(key, id);
      }
      return { pagina: range.pagina, desde: range.desde, hasta: range.hasta };
    });
    if (!Array.isArray(evidencia) || !evidencia.length) throw new Error(`${file.archivo} ${id}: falta evidencia`);
    const evidence = evidencia.map((item): Evidence => {
      if (!object(item) || !int(item.pagina) || !int(item.bloque) || typeof item.texto !== "string" || space(item.texto).length < 3) throw new Error(`${file.archivo} ${id}: evidencia inválida`);
      const pagina = item.pagina, bloque = item.bloque, texto = item.texto;
      if (!ranges.some(r => r.pagina === pagina && bloque >= r.desde && bloque <= r.hasta)) throw new Error(`${file.archivo} ${id}: la evidencia cita un bloque que no pertenece a la parte`);
      const block = file.paginas.find(p => p.numero === pagina)!.bloques[bloque - 1];
      if (!space(blockText(block)).includes(space(texto))) throw new Error(`${file.archivo} ${id}: la evidencia «${texto.slice(0, 60)}» no aparece literalmente en la lectura`);
      return { pagina, bloque, texto };
    });
    return { id, bloques: ranges, familia, tipo, subtipo: subtipo as string | null, descripcion, destino, contieneTablas, confianza, evidencia: evidence, motivo };
  });
  const missing = file.paginas.flatMap(p => p.bloques.map((_, b) => `${p.numero}:${b + 1}`)).filter(key => !owner.has(key));
  if (missing.length) throw new Error(`${file.archivo}: bloques sin clasificar (${missing.slice(0, 8).map(k => `p${k.replace(":", " b")}`).join(", ")}${missing.length > 8 ? "…" : ""})`);
  return { archivoId: file.archivoId, archivo: file.archivo, partes, incidencias: raw.incidencias as string[] };
}

export function classificationResult(loteId: string, archivos: ClassifiedFile[]): ClassificationResult {
  return { module: "document_classifier", version: CLASSIFIER_REVISION, loteId, archivos };
}

/** Provider-level shape (strict JSON schema); taxonomy, coverage and evidence are checked by `validateClassification`. */
export const CLASSIFICATION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["partes", "incidencias"], properties: {
    incidencias: { type: "array", items: { type: "string" } },
    partes: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["bloques", "familia", "tipo", "subtipo", "descripcion", "destino", "contieneTablas", "confianza", "evidencia", "motivo"],
      properties: {
        bloques: { type: "array", items: { type: "object", additionalProperties: false, required: ["pagina", "desde", "hasta"],
          properties: { pagina: { type: "integer" }, desde: { type: "integer" }, hasta: { type: "integer" } } } },
        familia: { type: "string", enum: FAMILIES },
        tipo: { type: "string" }, subtipo: { type: ["string", "null"] }, descripcion: { type: "string" },
        destino: { type: "string", enum: ["engine", "knowledge", "hibrido"] },
        contieneTablas: { type: "boolean" },
        confianza: { type: "string", enum: ["alta", "media", "baja"] },
        evidencia: { type: "array", items: { type: "object", additionalProperties: false, required: ["pagina", "bloque", "texto"],
          properties: { pagina: { type: "integer" }, bloque: { type: "integer" }, texto: { type: "string" } } } },
        motivo: { type: "string" },
      } } },
  },
};
