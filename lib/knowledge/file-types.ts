// lib/knowledge/file-types.ts

export const KNOWLEDGE_ACCEPTED_FILE_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".csv",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
  ".zip",
] as const;

export const KNOWLEDGE_ACCEPTED_MIME_TYPES = [
  "application/pdf",

  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  "text/csv",
  "text/plain",
  "text/markdown",

  "image/jpeg",
  "image/png",

  "application/zip",
  "application/x-zip-compressed",
] as const;

export const KNOWLEDGE_FILE_ACCEPT =
  KNOWLEDGE_ACCEPTED_FILE_EXTENSIONS.join(",");

export function isAcceptedKnowledgeFileType(
  file: File,
) {
  const mimeType = file.type
    .split(";")[0]
    .trim()
    .toLowerCase();

  const fileName = file.name
    .trim()
    .toLowerCase();

  const hasAcceptedMimeType =
    KNOWLEDGE_ACCEPTED_MIME_TYPES.some(
      (acceptedMimeType) =>
        acceptedMimeType === mimeType,
    );

  if (hasAcceptedMimeType) {
    return true;
  }

  return KNOWLEDGE_ACCEPTED_FILE_EXTENSIONS.some(
    (extension) =>
      fileName.endsWith(extension),
  );
}