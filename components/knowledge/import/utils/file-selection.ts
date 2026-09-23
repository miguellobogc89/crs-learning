// lib/knowledge/import-flow/file-selection.ts

import {
  isSupportedKnowledgeArchive,
} from "@/lib/knowledge/import/supported-formats";

export function getBrowserFileIdentity(
  file: File,
) {
  return [
    getBrowserFileRelativePath(file),
    file.name,
    file.size,
    file.lastModified,
  ].join("::");
}

export function getBrowserFileRelativePath(
  file: File,
) {
  const fileWithRelativePath = file as File & {
    webkitRelativePath?: string;
  };

  return (
    fileWithRelativePath.webkitRelativePath ||
    file.name
  );
}

export function getBrowserImportMode(
  files: File[],
) {
  if (
    files.length === 1 &&
    isSupportedKnowledgeArchive(
      files[0].name,
      files[0].type,
    )
  ) {
    return "zip" as const;
  }

  if (
    files.some((file) =>
      getBrowserFileRelativePath(
        file,
      ).includes("/"),
    )
  ) {
    return "folder" as const;
  }

  return "files" as const;
}

/**
 * La deduplicación por nombre, tamaño y fecha no es segura:
 * dos documentos diferentes pueden compartir esos metadatos.
 *
 * Conservamos todos los archivos seleccionados y delegamos
 * la identificación de duplicados por contenido al servidor.
 */
export function deduplicateBrowserFiles(
  files: File[],
) {
  return {
    uniqueFiles: [...files],
    duplicateFiles: [] as File[],
  };
}