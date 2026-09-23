
// lib/knowledge/import/pipeline/build-inventory.ts

import {
  detectKnowledgeImportFormat,
} from "./detect-format";

import {
  expandKnowledgeZip,
  MAX_KNOWLEDGE_ZIP_FILES,
} from "./expand-zip";

import type {
  KnowledgePreflightFile,
} from "./preflight";

export type KnowledgeImportSelectionMode =
  | "files"
  | "folder"
  | "zip";

export type KnowledgeImportSelectedFile = {
  id: string;
  fileName: string;
  relativePath?: string | null;
  mimeType?: string | null;
  content: Uint8Array;
};

export type BuildKnowledgeImportInventoryInput = {
  mode: KnowledgeImportSelectionMode;
  files: KnowledgeImportSelectedFile[];
};

export type KnowledgeImportInventory = {
  files: KnowledgePreflightFile[];
  totalFiles: number;
  totalBytes: number;
  archiveCount: number;
  skippedArchiveEntries: {
    archiveName: string;
    relativePath: string;
    reason: "directory" | "invalid-path";
  }[];
};

const MAX_INVENTORY_FILES = MAX_KNOWLEDGE_ZIP_FILES;

// Límite conservador mientras el inventario completo
// y el preflight permanezcan en memoria.
const MAX_INVENTORY_BYTES = 150 * 1024 * 1024;

function normalizeRelativePath(
  value: string,
): string {
  const normalized = value.replaceAll("\\", "/");

  const segments = normalized
    .split("/")
    .filter(
      (segment) =>
        segment !== "" &&
        segment !== ".",
    );

  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.includes("\0") ||
    segments.some(
      (segment) => segment === "..",
    )
  ) {
    throw new Error(
      `La ruta del archivo no es válida: ${value}`,
    );
  }

  const result = segments.join("/");

  if (!result) {
    throw new Error(
      "Se ha recibido un archivo sin ruta válida.",
    );
  }

  return result;
}

function getBaseName(
  relativePath: string,
): string {
  return (
    relativePath.split("/").at(-1) ??
    relativePath
  );
}

function assertInventoryLimits(
  fileCount: number,
  totalBytes: number,
): void {
  if (fileCount > MAX_INVENTORY_FILES) {
    throw new Error(
      `La selección supera el límite de ${MAX_INVENTORY_FILES} archivos.`,
    );
  }

  if (totalBytes > MAX_INVENTORY_BYTES) {
    throw new Error(
      "La selección supera el límite de 150 MB de documentos.",
    );
  }
}

/**
 * Construye un inventario común para archivos individuales,
 * carpetas y ZIP.
 *
 * Los ZIP se expanden antes del preflight para que sus
 * documentos participen en la misma comprobación de
 * duplicados que el resto de la selección.
 *
 * No escribe en disco, no sube archivos y no ejecuta IA.
 */
export function buildKnowledgeImportInventory(
  input: BuildKnowledgeImportInventoryInput,
): KnowledgeImportInventory {
  if (input.files.length === 0) {
    throw new Error(
      "No se ha recibido ningún archivo.",
    );
  }

  if (
    input.mode === "zip" &&
    input.files.length !== 1
  ) {
    throw new Error(
      "La importación ZIP debe contener un único archivo comprimido.",
    );
  }

  const files: KnowledgePreflightFile[] = [];

  const skippedArchiveEntries:
    KnowledgeImportInventory["skippedArchiveEntries"] =
      [];

  const seenIds = new Set<string>();

  let totalBytes = 0;
  let archiveCount = 0;

  for (const selectedFile of input.files) {
    if (
      !selectedFile.id ||
      seenIds.has(selectedFile.id)
    ) {
      throw new Error(
        "La selección contiene identificadores de archivo duplicados o vacíos.",
      );
    }

    seenIds.add(selectedFile.id);

    const selectedPath = normalizeRelativePath(
      selectedFile.relativePath ||
        selectedFile.fileName,
    );

    const fileName = getBaseName(selectedPath);

    const format = detectKnowledgeImportFormat({
      fileName,
      mimeType: selectedFile.mimeType,
      source:
        input.mode === "folder"
          ? "folder"
          : "file",
    });

    if (
      format.supported &&
      format.kind === "archive"
    ) {
      archiveCount += 1;

      const expanded = expandKnowledgeZip({
        id: selectedFile.id,
        fileName,
        content: selectedFile.content,
      });

      const archivePrefix = selectedPath;

      for (const expandedFile of expanded.files) {
        const relativePath =
          normalizeRelativePath(
            `${archivePrefix}/${expandedFile.relativePath}`,
          );

        files.push({
          ...expandedFile,
          relativePath,
        });

        totalBytes +=
          expandedFile.content.byteLength;

        assertInventoryLimits(
          files.length,
          totalBytes,
        );
      }

      for (
        const skippedEntry of
        expanded.skippedEntries
      ) {
        skippedArchiveEntries.push({
          archiveName: selectedPath,
          ...skippedEntry,
        });
      }

      continue;
    }

    if (input.mode === "zip") {
      throw new Error(
        "El archivo seleccionado no es un ZIP válido.",
      );
    }

    files.push({
      id: selectedFile.id,
      fileName,
      relativePath: selectedPath,
      mimeType: selectedFile.mimeType,
      source:
        input.mode === "folder"
          ? "folder"
          : "file",
      content: selectedFile.content,
    });

    totalBytes +=
      selectedFile.content.byteLength;

    assertInventoryLimits(
      files.length,
      totalBytes,
    );
  }

  return {
    files,
    totalFiles: files.length,
    totalBytes,
    archiveCount,
    skippedArchiveEntries,
  };
}