export type KnowledgeImportFormat = {
  extension: string;
  mimeType: string;
  plainText: boolean;
};

export const KNOWLEDGE_IMPORT_DOCUMENT_FORMATS = [
  {
    extension: ".pdf",
    mimeType: "application/pdf",
    plainText: false,
  },
  {
    extension: ".txt",
    mimeType: "text/plain",
    plainText: true,
  },
  {
    extension: ".md",
    mimeType: "text/markdown",
    plainText: true,
  },
  {
    extension: ".csv",
    mimeType: "text/csv",
    plainText: true,
  },
  {
    extension: ".docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    plainText: false,
  },
  {
    extension: ".xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    plainText: false,
  },
  {
    extension: ".pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    plainText: false,
  },
] as const satisfies readonly KnowledgeImportFormat[];

export const KNOWLEDGE_IMPORT_ARCHIVE_FORMATS = [
  {
    extension: ".zip",
    mimeType: "application/zip",
    plainText: false,
  },
] as const satisfies readonly KnowledgeImportFormat[];

export const KNOWLEDGE_IMPORT_ZIP_MIME_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
] as const;

const DOCUMENT_FORMAT_BY_EXTENSION =
  new Map<string, KnowledgeImportFormat>(
  KNOWLEDGE_IMPORT_DOCUMENT_FORMATS.map(
    (format) => [
      format.extension,
      format,
    ],
  ),
);

const ARCHIVE_FORMAT_BY_EXTENSION =
  new Map<string, KnowledgeImportFormat>(
  KNOWLEDGE_IMPORT_ARCHIVE_FORMATS.map(
    (format) => [
      format.extension,
      format,
    ],
  ),
);

function getExtension(fileName: string) {
  const normalizedName =
    fileName.toLowerCase();

  const lastDotIndex =
    normalizedName.lastIndexOf(".");

  if (lastDotIndex < 0) {
    return "";
  }

  return normalizedName.slice(
    lastDotIndex,
  );
}

export function isSupportedKnowledgeDocument(
  fileName: string,
) {
  return DOCUMENT_FORMAT_BY_EXTENSION.has(
    getExtension(fileName),
  );
}

export function isSupportedKnowledgeArchive(
  fileName: string,
  mimeType?: string | null,
) {
  return (
    ARCHIVE_FORMAT_BY_EXTENSION.has(
      getExtension(fileName),
    ) ||
    Boolean(
      mimeType &&
        KNOWLEDGE_IMPORT_ZIP_MIME_TYPES.includes(
          mimeType as (typeof KNOWLEDGE_IMPORT_ZIP_MIME_TYPES)[number],
        ),
    )
  );
}

export function isPlainTextKnowledgeDocument(
  fileName: string,
) {
  return (
    DOCUMENT_FORMAT_BY_EXTENSION.get(
      getExtension(fileName),
    )?.plainText ?? false
  );
}

export function getKnowledgeImportMimeType(
  fileName: string,
) {
  const extension =
    getExtension(fileName);

  return (
    DOCUMENT_FORMAT_BY_EXTENSION.get(
      extension,
    )?.mimeType ??
    ARCHIVE_FORMAT_BY_EXTENSION.get(
      extension,
    )?.mimeType ??
    "application/octet-stream"
  );
}

export const KNOWLEDGE_IMPORT_DOCUMENT_ACCEPT =
  KNOWLEDGE_IMPORT_DOCUMENT_FORMATS.map(
    (format) => format.extension,
  ).join(",");

export const KNOWLEDGE_IMPORT_ARCHIVE_ACCEPT = [
  ...KNOWLEDGE_IMPORT_ARCHIVE_FORMATS.map(
    (format) => format.extension,
  ),
  ...KNOWLEDGE_IMPORT_ZIP_MIME_TYPES,
].join(",");

export const KNOWLEDGE_IMPORT_UPLOAD_ACCEPT = [
  KNOWLEDGE_IMPORT_DOCUMENT_ACCEPT,
  KNOWLEDGE_IMPORT_ARCHIVE_ACCEPT,
].join(",");
