import { createHash } from "node:crypto";
import type { KnowledgeImportDocumentRoute } from "./types";
import type { ImportInventory, InventoryDocument } from "./build-import-map";

export type BatchReview = {
  status: "reviewed";
  sourceFingerprint: string;
  groups: Array<{ title: string; documentIds: string[]; reason: string }>;
};
export type BatchSource = { id: string; status: string; extracted_text: string };

export function importBatchFingerprint(inventory: ImportInventory, files: BatchSource[]) {
  return createHash("sha256").update(JSON.stringify({
    files: files.map(file => ({ id: file.id, status: file.status,
      hash: createHash("sha256").update(file.extracted_text).digest("hex") }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    documents: [...inventory.documents].sort((a, b) => a.id.localeCompare(b.id)),
  }, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
    : value)).digest("hex");
}

export function assertCompleteImportInventory(inventory: ImportInventory, files: BatchSource[]) {
  const ready = files.filter(file => file.status === "text_ready");
  if (!ready.length || files.some(file => ["uploaded", "extracted", "text_processing"].includes(file.status))) {
    throw new Error("Termina la extracción de todos los archivos antes de revisar el lote.");
  }
  const readyIds = new Set(ready.map(file => file.id));
  const documentIds = new Set<string>();
  for (const document of inventory.documents) {
    if (!readyIds.has(document.fileId) || documentIds.has(document.id)) {
      throw new Error("El inventario contiene documentos duplicados o ajenos al lote.");
    }
    const file = ready.find(item => item.id === document.fileId)!;
    if (!Number.isInteger(document.startLine) || !Number.isInteger(document.endLine) ||
      document.startLine < 1 || document.endLine < document.startLine ||
      document.endLine > file.extracted_text.trim().split(/\r?\n/).length) {
      throw new Error("El inventario contiene referencias de origen no verificables.");
    }
    documentIds.add(document.id);
  }
  for (const file of ready) {
    const entries = inventory.files.filter(item => item.fileId === file.id && item.status === "completed");
    if (entries.length !== 1 || !inventory.documents.some(document => document.fileId === file.id)) {
      throw new Error("Falta reconocer un archivo del lote. Repite el análisis antes de continuar.");
    }
  }
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function text(value: unknown, max = 450): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error("La revisión del lote contiene una descripción no válida.");
  }
  return value.trim();
}
function strings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value) || value.length > limit ||
    value.some(item => typeof item !== "string" || !item.trim() || item.length > 120) ||
    new Set(value).size !== value.length) throw new Error("Lista no válida en la revisión del lote.");
  return value as string[];
}

/** Accept decisions for every logical document exactly once; never accept new evidence or records. */
export function applyImportBatchReview(input: {
  inventory: ImportInventory;
  files: BatchSource[];
  response: unknown;
  articleIds: Set<string>;
  structureKeys: Set<string>;
}): ImportInventory {
  assertCompleteImportInventory(input.inventory, input.files);
  const raw = input.response;
  if (!object(raw) || !Array.isArray(raw.documents) || !Array.isArray(raw.groups)) {
    throw new Error("La IA no devolvió una revisión conjunta válida.");
  }
  const originals = new Map(input.inventory.documents.map(document => [document.id, document]));
  const reviewed = new Map<string, InventoryDocument>();
  for (const decision of raw.documents) {
    if (!object(decision) || typeof decision.documentId !== "string" ||
      !originals.has(decision.documentId) || reviewed.has(decision.documentId) ||
      !object(decision.routing)) throw new Error("La revisión omitió, duplicó o inventó documentos.");
    const route = decision.routing;
    if (route.knowledge !== true || typeof route.articleCandidate !== "boolean" ||
      typeof route.structuredCandidate !== "boolean") throw new Error("Destino documental no válido.");
    const existingArticleId = route.existingArticleId;
    if (existingArticleId !== null && (typeof existingArticleId !== "string" ||
      !route.articleCandidate || !input.articleIds.has(existingArticleId))) {
      throw new Error("La revisión apunta a un artículo desconocido.");
    }
    const keys = strings(route.existingStructureKeys, 8);
    const fields = strings(route.structuredFields, 18);
    if (keys.some(key => !input.structureKeys.has(key)) ||
      (!route.structuredCandidate && (keys.length || fields.length))) {
      throw new Error("La revisión propone estructuras no disponibles.");
    }
    reviewed.set(decision.documentId, {
      ...originals.get(decision.documentId)!,
      type: text(decision.type, 120),
      category: text(decision.category, 120),
      routing: { knowledge: true, articleCandidate: route.articleCandidate,
        structuredCandidate: route.structuredCandidate, reason: text(route.reason),
        structuredFields: fields, existingArticleId, existingStructureKeys: keys },
    });
  }
  if (reviewed.size !== originals.size) throw new Error("La revisión debe incluir todos los documentos del lote.");
  const grouped = new Set<string>();
  const groups = raw.groups.map(group => {
    if (!object(group)) throw new Error("Grupo documental no válido.");
    const ids = strings(group.documentIds, originals.size);
    if (!ids.length || ids.some(id => !originals.has(id) || grouped.has(id))) {
      throw new Error("Los grupos deben cubrir el lote sin duplicar documentos.");
    }
    ids.forEach(id => grouped.add(id));
    return { title: text(group.title, 120), documentIds: ids, reason: text(group.reason) };
  });
  if (grouped.size !== originals.size) throw new Error("Los grupos no cubren todos los documentos.");
  const documents = input.inventory.documents.map(document => reviewed.get(document.id)!);
  const categories = new Map<string, number>();
  documents.forEach(document => categories.set(document.category, (categories.get(document.category) ?? 0) + 1));
  const inventory: ImportInventory = {
    ...input.inventory, documents,
    status: input.files.some(file => file.status === "text_error") ? "completed_with_issues" : "completed",
    summary: { ...input.inventory.summary, filesProcessed: input.inventory.files.length, byCategory: [...categories].map(([category, count]) => ({ category, count })) },
  };
  inventory.batchReview = { status: "reviewed", sourceFingerprint: importBatchFingerprint(inventory, input.files), groups };
  return inventory;
}

export function assertReviewedImportBatch(inventory: ImportInventory, files: BatchSource[]) {
  assertCompleteImportInventory(inventory, files);
  if (inventory.batchReview?.status !== "reviewed" ||
    inventory.batchReview.sourceFingerprint !== importBatchFingerprint(inventory, files)) {
    throw new Error("El lote debe revisarse en conjunto antes de proponer o confirmar destinos.");
  }
}

/** One source can feed both destinations; all consumers use the same projection. */
export function reviewedDocumentRoutes(inventory: ImportInventory, files: BatchSource[]): Record<string, KnowledgeImportDocumentRoute> {
  assertReviewedImportBatch(inventory, files);
  return Object.fromEntries(files.filter(file => file.status === "text_ready").map(file => {
    const documents = inventory.documents.filter(document => document.fileId === file.id);
    if (documents.some(document => !document.routing)) throw new Error("Destino sin revisar.");
    const routes = documents.map(document => document.routing!);
    return [file.id, {
      knowledge: true,
      articleCandidate: routes.some(route => route.articleCandidate),
      structuredCandidate: routes.some(route => route.structuredCandidate),
      reason: routes.map(route => route.reason).filter(Boolean).join(" · ").slice(0, 600),
      structuredFields: [...new Set(routes.flatMap(route => route.structuredFields))],
      existingArticleId: routes.find(route => route.articleCandidate && route.existingArticleId)?.existingArticleId ?? null,
      existingStructureKeys: [...new Set(routes.flatMap(route => route.existingStructureKeys))],
    } satisfies KnowledgeImportDocumentRoute];
  }));
}

export function assertReviewedDocumentRoutes(inventory: ImportInventory, files: BatchSource[], routes: Record<string, KnowledgeImportDocumentRoute> | undefined) {
  const expected = reviewedDocumentRoutes(inventory, files);
  if (!routes || Object.keys(expected).length !== Object.keys(routes).length ||
    Object.entries(expected).some(([id, route]) => {
      const actual = routes[id];
      return !actual || Object.entries(route).some(([key, value]) =>
        JSON.stringify(actual[key as keyof KnowledgeImportDocumentRoute]) !== JSON.stringify(value));
    })) throw new Error("Los destinos de la propuesta no coinciden con la revisión conjunta. Genera una nueva propuesta.");
}
