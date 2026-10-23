
// lib/knowledge/import/pipeline/preflight.ts

import {
  detectKnowledgeImportFormat,
  type KnowledgeDetectedFormat,
} from "./detect-format";

import type { KnowledgeDuplicateResult } from "./detect-duplicates";

export type KnowledgePreflightFile = {
  id: string;
  fileName: string;
  relativePath: string;
  mimeType?: string | null;
  source: "file" | "folder" | "archive";
  content: Uint8Array;
};

export type KnowledgePreflightInput = {
  ownerUserId: string;
  workspaceId: string;
  files: KnowledgePreflightFile[];
};

export type KnowledgePreflightFileResult = {
  file: KnowledgePreflightFile;
  format: KnowledgeDetectedFormat;
  duplicate: KnowledgeDuplicateResult | null;
  status:
    | "accepted"
    | "unsupported"
    | "duplicate"
    | "possible-duplicate";
};

export type KnowledgePreflightResult = {
  files: KnowledgePreflightFileResult[];
  acceptedFiles: KnowledgePreflightFileResult[];
  unsupportedFiles: KnowledgePreflightFileResult[];
  duplicateFiles: KnowledgePreflightFileResult[];
  possibleDuplicateFiles: KnowledgePreflightFileResult[];
  unreadableExistingDocumentIds: string[];
};

export async function runKnowledgeImportPreflight(
  input: KnowledgePreflightInput,
): Promise<KnowledgePreflightResult> {
  const formats = input.files.map((file) =>
    detectKnowledgeImportFormat({
      fileName: file.fileName,
      mimeType: file.mimeType,
      source: file.source,
    }),
  );

  // Discovery must analyze uploaded documents even if an identical PDF already
  // exists in Knowledge. Deduplication belongs to the final commit stage, where
  // we can decide whether to create, enrich or reuse an existing record.
  // Unsupported formats remain blocked as an independent safety check.
  const files: KnowledgePreflightFileResult[] = input.files.map((file, index) => ({
    file,
    format: formats[index],
    duplicate: null,
    status: formats[index].supported && formats[index].kind === "document"
      ? "accepted" : "unsupported",
  }));

  return {
    files,
    acceptedFiles: files.filter(
      (file) => file.status === "accepted",
    ),
    unsupportedFiles: files.filter(
      (file) => file.status === "unsupported",
    ),
    duplicateFiles: files.filter(
      (file) => file.status === "duplicate",
    ),
    possibleDuplicateFiles: files.filter(
      (file) =>
        file.status === "possible-duplicate",
    ),
    unreadableExistingDocumentIds: [],
  };
}