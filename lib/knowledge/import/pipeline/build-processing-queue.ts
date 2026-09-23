
// lib/knowledge/import/pipeline/build-processing-queue.ts

import type {
  KnowledgePreflightFileResult,
  KnowledgePreflightResult,
} from "./preflight";

export type KnowledgeProcessingQueueItem = {
  id: string;
  fileName: string;
  relativePath: string;
  mimeType: string;
  fileSize: number;
  content: Uint8Array;
  processingOrder: number;
};

export type KnowledgeProcessingQueue = {
  items: KnowledgeProcessingQueueItem[];
  totalFiles: number;
  totalBytes: number;
};

function assertAcceptedDocument(
  result: KnowledgePreflightFileResult,
): void {
  if (result.status !== "accepted") {
    throw new Error(
      `El documento ${result.file.relativePath} no ha sido aceptado.`,
    );
  }

  if (
    !result.format.supported ||
    result.format.kind !== "document"
  ) {
    throw new Error(
      `El documento ${result.file.relativePath} no tiene un formato válido para el procesamiento.`,
    );
  }

  if (result.duplicate !== null) {
    throw new Error(
      `El documento ${result.file.relativePath} tiene una comprobación de duplicidad pendiente.`,
    );
  }
}

/**
 * Construye la cola a partir de los resultados ya
 * aceptados por el preflight.
 *
 * No vuelve a comprobar formatos ni duplicados.
 * No escribe archivos, no modifica la base de datos
 * y no inicia el análisis con IA.
 */
export function buildKnowledgeProcessingQueue(
  preflight: KnowledgePreflightResult,
): KnowledgeProcessingQueue {
  if (
    preflight.unsupportedFiles.length > 0 ||
    preflight.duplicateFiles.length > 0 ||
    preflight.possibleDuplicateFiles.length > 0 ||
    preflight.unreadableExistingDocumentIds.length > 0
  ) {
    throw new Error(
      "La importación contiene archivos que requieren revisión antes del procesamiento.",
    );
  }

  if (
    preflight.acceptedFiles.length !==
    preflight.files.length
  ) {
    throw new Error(
      "La importación contiene archivos que no han sido aceptados.",
    );
  }

  const items: KnowledgeProcessingQueueItem[] = [];
  const seenIds = new Set<string>();

  let totalBytes = 0;

  for (
    const [index, result] of
    preflight.acceptedFiles.entries()
  ) {
    assertAcceptedDocument(result);

    if (seenIds.has(result.file.id)) {
      throw new Error(
        `El identificador ${result.file.id} aparece más de una vez en la importación.`,
      );
    }

    seenIds.add(result.file.id);

    if (
      !result.format.supported ||
      result.format.kind !== "document"
    ) {
      throw new Error(
        `El formato de ${result.file.relativePath} no es válido.`,
      );
    }

    const fileSize =
      result.file.content.byteLength;

    totalBytes += fileSize;

    items.push({
      id: result.file.id,
      fileName: result.file.fileName,
      relativePath: result.file.relativePath,
      mimeType: result.format.mimeType,
      fileSize,
      content: result.file.content,
      processingOrder: index + 1,
    });
  }

  return {
    items,
    totalFiles: items.length,
    totalBytes,
  };
}