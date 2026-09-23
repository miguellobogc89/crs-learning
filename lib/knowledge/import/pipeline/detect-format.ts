
 // lib/knowledge/import/pipeline/detect-format.ts

import {
  KNOWLEDGE_IMPORT_DOCUMENT_FORMATS,
  KNOWLEDGE_IMPORT_ARCHIVE_FORMATS,
  KNOWLEDGE_IMPORT_ZIP_MIME_TYPES,
} from "@/lib/knowledge/import/supported-formats";

import type {
  KnowledgeImportSource,
} from "./types";

type SupportedDocumentFormat =
  (typeof KNOWLEDGE_IMPORT_DOCUMENT_FORMATS)[number];

type SupportedArchiveFormat =
  (typeof KNOWLEDGE_IMPORT_ARCHIVE_FORMATS)[number];

export type KnowledgeDetectedFormat =
  | {
      supported: true;
      kind: "document";
      source: "file" | "folder";
      extension: string;
      mimeType: string;
      plainText: boolean;
    }
  | {
      supported: true;
      kind: "archive";
      source: "archive";
      extension: string;
      mimeType: string;
      plainText: false;
    }
  | {
      supported: false;
      kind: "unsupported";
      source: KnowledgeImportSource;
      extension: string | null;
      mimeType: string | null;
      reason: "unsupported-format" | "invalid-file";
    };

export type KnowledgeFormatDetectionInput = {
  fileName: string;
  mimeType?: string | null;

  /**
   * Origen de la selección, si se conoce.
   *
   * "file": archivo individual.
   * "folder": documento seleccionado dentro de una carpeta.
   * "archive": archivo comprimido.
   *
   * Si no se indica, se deduce del formato.
   */
  source?: KnowledgeImportSource;
};

function getExtension(fileName: string): string | null {
  const normalizedName = fileName
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.trim()
    .toLowerCase();

  if (!normalizedName) {
    return null;
  }

  const lastDotIndex = normalizedName.lastIndexOf(".");

  if (
    lastDotIndex <= 0 ||
    lastDotIndex === normalizedName.length - 1
  ) {
    return null;
  }

  return normalizedName.slice(lastDotIndex);
}

function normalizeMimeType(
  mimeType?: string | null,
): string | null {
  const normalized = mimeType
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();

  return normalized || null;
}

function findDocumentFormat(
  extension: string | null,
): SupportedDocumentFormat | undefined {
  return KNOWLEDGE_IMPORT_DOCUMENT_FORMATS.find(
    (format) => format.extension === extension,
  );
}

function findArchiveFormat(
  extension: string | null,
  mimeType: string | null,
): SupportedArchiveFormat | undefined {
  const byExtension =
    KNOWLEDGE_IMPORT_ARCHIVE_FORMATS.find(
      (format) => format.extension === extension,
    );

  if (byExtension) {
    return byExtension;
  }

  if (
    mimeType &&
    KNOWLEDGE_IMPORT_ZIP_MIME_TYPES.some(
      (supportedMimeType) =>
        supportedMimeType === mimeType,
    )
  ) {
    return KNOWLEDGE_IMPORT_ARCHIVE_FORMATS.find(
      (format) => format.extension === ".zip",
    );
  }

  return undefined;
}

/**
 * Identifica el formato declarado de un archivo utilizando
 * el catálogo de formatos existente en CRS.
 *
 * No lee el contenido, no descomprime y no analiza documentos.
 *
 * IMPORTANTE:
 * La extensión y el MIME no demuestran que los bytes
 * correspondan realmente al formato declarado.
 * La validación del contenido se realizará antes de
 * autorizar su extracción o análisis.
 */
export function detectKnowledgeImportFormat(
  input: KnowledgeFormatDetectionInput,
): KnowledgeDetectedFormat {
  const fileName = input.fileName.trim();
  const extension = getExtension(fileName);
  const mimeType = normalizeMimeType(input.mimeType);

  const fallbackSource: KnowledgeImportSource =
    input.source ?? "file";

  if (!fileName || !extension) {
    return {
      supported: false,
      kind: "unsupported",
      source: fallbackSource,
      extension,
      mimeType,
      reason: "invalid-file",
    };
  }

  const documentFormat = findDocumentFormat(extension);

  if (documentFormat) {
    return {
      supported: true,
      kind: "document",
      source:
        input.source === "folder" ? "folder" : "file",
      extension: documentFormat.extension,
      mimeType: documentFormat.mimeType,
      plainText: documentFormat.plainText,
    };
  }

  const archiveFormat = findArchiveFormat(
    extension,
    mimeType,
  );

  if (archiveFormat) {
    return {
      supported: true,
      kind: "archive",
      source: "archive",
      extension: archiveFormat.extension,
      mimeType: archiveFormat.mimeType,
      plainText: false,
    };
  }

  return {
    supported: false,
    kind: "unsupported",
    source: fallbackSource,
    extension,
    mimeType,
    reason: "unsupported-format",
  };
}