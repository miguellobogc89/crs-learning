
// lib/knowledge/import/pipeline/detect-duplicates.ts

import { createHash } from "node:crypto";

export type KnowledgeDuplicateCandidate = {
  candidateId: string;
  fileName: string;
  fileSize: number;

  /**
   * SHA-256 del contenido.
   *
   * Es obligatorio para confirmar que dos archivos
   * tienen exactamente el mismo contenido.
   */
  contentHash: string;
};

export type ExistingKnowledgeDocument = {
  id: string;
  fileName: string;
  fileSize: number | null;

  /**
   * Puede ser null para documentos antiguos
   * cuyo hash todavía no se haya calculado.
   */
  contentHash: string | null;
};

export type KnowledgeDuplicateResult =
  | {
      status: "unique";
      candidate: KnowledgeDuplicateCandidate;
    }
  | {
      status: "duplicate-in-selection";
      candidate: KnowledgeDuplicateCandidate;
      duplicateOfCandidateId: string;
    }
  | {
      status: "duplicate-in-knowledge";
      candidate: KnowledgeDuplicateCandidate;
      existingKnowledgeFileId: string;
    }
  | {
      status: "possible-duplicate";
      candidate: KnowledgeDuplicateCandidate;
      existingKnowledgeFileId: string;
      reason: "same-name-and-size-without-hash";
    };

function normalizeFileName(fileName: string): string {
  return fileName
    .replaceAll("\\", "/")
    .split("/")
    .pop()!
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es");
}

function getMetadataKey(
  fileName: string,
  fileSize: number,
): string {
  return `${normalizeFileName(fileName)}::${fileSize}`;
}

function getContentKey(
  contentHash: string,
  fileSize: number,
): string {
  return `${contentHash.toLowerCase()}::${fileSize}`;
}

/**
 * Calcula el hash SHA-256 de un archivo.
 *
 * No realiza ninguna operación de almacenamiento
 * ni de análisis mediante IA.
 */
export function calculateKnowledgeFileHash(
  content: Uint8Array,
): string {
  return createHash("sha256")
    .update(content)
    .digest("hex");
}

/**
 * Detecta duplicados dentro de una selección y frente
 * a documentos existentes.
 *
 * Una coincidencia de hash y tamaño se considera
 * duplicado confirmado.
 *
 * Una coincidencia de nombre y tamaño sin hash
 * se informa como posible duplicado, pero no
 * se rechaza automáticamente.
 */
export function detectKnowledgeDuplicates(
  candidates: KnowledgeDuplicateCandidate[],
  existingDocuments: ExistingKnowledgeDocument[],
): KnowledgeDuplicateResult[] {
  const existingByContent = new Map<
    string,
    ExistingKnowledgeDocument
  >();

  const existingWithoutHashByMetadata = new Map<
    string,
    ExistingKnowledgeDocument
  >();

  for (const document of existingDocuments) {
    if (document.fileSize === null) {
      continue;
    }

    if (document.contentHash) {
      const contentKey = getContentKey(
        document.contentHash,
        document.fileSize,
      );

      if (!existingByContent.has(contentKey)) {
        existingByContent.set(contentKey, document);
      }
    } else {
      const metadataKey = getMetadataKey(
        document.fileName,
        document.fileSize,
      );

      if (!existingWithoutHashByMetadata.has(metadataKey)) {
        existingWithoutHashByMetadata.set(
          metadataKey,
          document,
        );
      }
    }
  }

  const acceptedCandidatesByContent = new Map<
    string,
    string
  >();

  const results: KnowledgeDuplicateResult[] = [];

  for (const candidate of candidates) {
    const contentKey = getContentKey(
      candidate.contentHash,
      candidate.fileSize,
    );

    const previousCandidateId =
      acceptedCandidatesByContent.get(contentKey);

    if (previousCandidateId) {
      results.push({
        status: "duplicate-in-selection",
        candidate,
        duplicateOfCandidateId: previousCandidateId,
      });

      continue;
    }

    const existingDocument =
      existingByContent.get(contentKey);

    if (existingDocument) {
      results.push({
        status: "duplicate-in-knowledge",
        candidate,
        existingKnowledgeFileId: existingDocument.id,
      });

      continue;
    }

    const possibleDuplicate =
      existingWithoutHashByMetadata.get(
        getMetadataKey(
          candidate.fileName,
          candidate.fileSize,
        ),
      );

    if (possibleDuplicate) {
      results.push({
        status: "possible-duplicate",
        candidate,
        existingKnowledgeFileId:
          possibleDuplicate.id,
        reason: "same-name-and-size-without-hash",
      });
    } else {
      results.push({
        status: "unique",
        candidate,
      });
    }

    // También evita repetir el contenido de un archivo
    // que haya quedado marcado como posible duplicado.
    acceptedCandidatesByContent.set(
      contentKey,
      candidate.candidateId,
    );
  }

  return results;
}