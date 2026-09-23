
// lib/knowledge/import/pipeline/load-existing-documents.ts

import { prisma } from "@/lib/prisma";
import { readKnowledgeFile } from "@/lib/storage/knowledge-storage";

import {
  calculateKnowledgeFileHash,
  type ExistingKnowledgeDocument,
  type KnowledgeDuplicateCandidate,
} from "./detect-duplicates";

export type LoadExistingKnowledgeDocumentsInput = {
  ownerUserId: string;
  workspaceId: string;
  candidates: KnowledgeDuplicateCandidate[];
};

export type LoadExistingKnowledgeDocumentsResult = {
  documents: ExistingKnowledgeDocument[];

  /**
   * Documentos cuyo contenido no se ha podido leer.
   * No deben considerarse duplicados confirmados.
   */
  unreadableDocumentIds: string[];
};

/**
 * Recupera los documentos existentes que podrían
 * coincidir con alguno de los archivos seleccionados.
 *
 * El tamaño sirve únicamente para reducir las lecturas.
 * La identidad del contenido se comprueba mediante SHA-256.
 *
 * IMPORTANTE: esta consulta conserva el ámbito de propietario
 * y workspace que utiliza actualmente la ruta de análisis.
 * No amplía por sí sola la búsqueda a documentos compartidos
 * por otros propietarios.
 */
export async function loadExistingKnowledgeDocuments(
  input: LoadExistingKnowledgeDocumentsInput,
): Promise<LoadExistingKnowledgeDocumentsResult> {
  const { ownerUserId, workspaceId, candidates } = input;

  if (!ownerUserId || !workspaceId) {
    throw new Error(
      "Falta el propietario o el workspace para comprobar duplicados.",
    );
  }

  if (candidates.length === 0) {
    return {
      documents: [],
      unreadableDocumentIds: [],
    };
  }

  const candidateSizes = [
    ...new Set(candidates.map((candidate) => candidate.fileSize)),
  ];

  const existingFiles = await prisma.knowledge_files.findMany({
    where: {
      file_size: {
        in: candidateSizes,
      },
      knowledge_sources: {
        owner_user_id: ownerUserId,
        knowledge_libraries: {
          workspace_id: workspaceId,
        },
      },
    },
    select: {
      id: true,
      file_name: true,
      file_size: true,
      storage_path: true,
    },
  });

  const documents: ExistingKnowledgeDocument[] = [];
  const unreadableDocumentIds: string[] = [];

  for (const existingFile of existingFiles) {
    let contentHash: string | null = null;

    if (existingFile.storage_path) {
      try {
        const content = await readKnowledgeFile(
          existingFile.storage_path,
        );

        contentHash = calculateKnowledgeFileHash(content);
      } catch (error) {
        console.warn(
          "No se pudo comprobar el contenido del documento existente:",
          existingFile.id,
          error,
        );

        unreadableDocumentIds.push(existingFile.id);
      }
    } else {
      unreadableDocumentIds.push(existingFile.id);
    }

    documents.push({
      id: existingFile.id,
      fileName: existingFile.file_name,
      fileSize: existingFile.file_size,
      contentHash,
    });
  }

  return {
    documents,
    unreadableDocumentIds,
  };
}