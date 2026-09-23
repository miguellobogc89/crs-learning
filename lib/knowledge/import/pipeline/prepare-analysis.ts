
// lib/knowledge/import/pipeline/prepare-analysis.ts

import {
  buildKnowledgeImportInventory,
  type KnowledgeImportSelectionMode,
  type KnowledgeImportSelectedFile,
} from "./build-inventory";

import {
  runKnowledgeImportPreflight,
  type KnowledgePreflightResult,
} from "./preflight";

import {
  readKnowledgeFile,
} from "@/lib/storage/knowledge-storage";

export type KnowledgeStoredImportFile = {
  id: string;
  fileName: string;
  relativePath: string | null;
  mimeType: string | null;
  storagePath: string | null;
};

export type PrepareKnowledgeImportAnalysisInput = {
  ownerUserId: string;
  workspaceId: string;
  mode: KnowledgeImportSelectionMode;
  files: KnowledgeStoredImportFile[];
};

export type PreparedKnowledgeImportAnalysis = {
  preflight: KnowledgePreflightResult;
  totalFiles: number;
  totalBytes: number;
  archiveCount: number;
  skippedArchiveEntries: {
    archiveName: string;
    relativePath: string;
    reason: "directory" | "invalid-path";
  }[];
};

const MAX_STORED_IMPORT_BYTES =
  150 * 1024 * 1024;

/**
 * Prepara los documentos de una importación almacenada
 * utilizando exactamente el mismo inventario y preflight
 * que la ruta de subida.
 *
 * No escribe archivos, no crea registros de procesamiento
 * y no ejecuta análisis con IA.
 */
export async function prepareKnowledgeImportAnalysis(
  input: PrepareKnowledgeImportAnalysisInput,
): Promise<PreparedKnowledgeImportAnalysis> {
  if (
    !input.ownerUserId ||
    !input.workspaceId
  ) {
    throw new Error(
      "Falta el usuario o el espacio de trabajo de la importación.",
    );
  }

  if (input.files.length === 0) {
    throw new Error(
      "La importación no contiene archivos originales.",
    );
  }

  const selectedFiles:
    KnowledgeImportSelectedFile[] = [];

  let totalStoredBytes = 0;

  for (const file of input.files) {
    if (!file.storagePath) {
      throw new Error(
        `El archivo ${file.fileName} no tiene una ruta de almacenamiento.`,
      );
    }

    const content = await readKnowledgeFile(
      file.storagePath,
    );

    totalStoredBytes += content.byteLength;

    if (
      totalStoredBytes >
      MAX_STORED_IMPORT_BYTES
    ) {
      throw new Error(
        "Los originales de la importación superan el límite de 150 MB.",
      );
    }

    selectedFiles.push({
      id: file.id,
      fileName: file.fileName,
      relativePath:
        file.relativePath || file.fileName,
      mimeType: file.mimeType,
      content,
    });
  }

  const inventory =
    buildKnowledgeImportInventory({
      mode: input.mode,
      files: selectedFiles,
    });

  const preflight =
    await runKnowledgeImportPreflight({
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      files: inventory.files,
    });

  return {
    preflight,
    totalFiles: inventory.totalFiles,
    totalBytes: inventory.totalBytes,
    archiveCount: inventory.archiveCount,
    skippedArchiveEntries:
      inventory.skippedArchiveEntries,
  };
}