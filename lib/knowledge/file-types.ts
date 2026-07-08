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

export const KNOWLEDGE_FILE_ACCEPT = KNOWLEDGE_ACCEPTED_FILE_EXTENSIONS.join(",");

export function isAcceptedKnowledgeFileType(file: File) {
  if (KNOWLEDGE_ACCEPTED_MIME_TYPES.includes(file.type as never)) {
    return true;
  }

  const lowerName = file.name.toLowerCase();

  return KNOWLEDGE_ACCEPTED_FILE_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension)
  );
}