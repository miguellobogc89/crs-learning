// lib/knowledge/file-types.ts

export const KNOWLEDGE_ACCEPTED_FILE_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".csv",
  ".docx",
  ".xlsx",
  ".pptx",
] as const;

export const KNOWLEDGE_ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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

  const hasAcceptedExtension =
    KNOWLEDGE_ACCEPTED_FILE_EXTENSIONS.some(
      (extension) =>
        fileName.endsWith(extension),
    );

  return hasAcceptedExtension;
}