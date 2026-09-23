
// lib/knowledge/import/pipeline/preflight.ts

import {
  detectKnowledgeImportFormat,
  type KnowledgeDetectedFormat,
} from "./detect-format";

import {
  calculateKnowledgeFileHash,
  detectKnowledgeDuplicates,
  type KnowledgeDuplicateCandidate,
  type KnowledgeDuplicateResult,
} from "./detect-duplicates";

import {
  loadExistingKnowledgeDocuments,
} from "./load-existing-documents";

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

  const candidates: KnowledgeDuplicateCandidate[] = [];

  for (let index = 0; index < input.files.length; index++) {
    const file = input.files[index];
    const format = formats[index];

    if (
      !format.supported ||
      format.kind !== "document"
    ) {
      continue;
    }

    candidates.push({
      candidateId: file.id,
      fileName: file.fileName,
      fileSize: file.content.byteLength,
      contentHash: calculateKnowledgeFileHash(
        file.content,
      ),
    });
  }

  const existing = await loadExistingKnowledgeDocuments({
    ownerUserId: input.ownerUserId,
    workspaceId: input.workspaceId,
    candidates,
  });

  const duplicateResults = detectKnowledgeDuplicates(
    candidates,
    existing.documents,
  );

  const duplicateByCandidateId = new Map(
    duplicateResults.map((result) => [
      result.candidate.candidateId,
      result,
    ]),
  );

  const files: KnowledgePreflightFileResult[] =
    input.files.map((file, index) => {
      const format = formats[index];

      if (
        !format.supported ||
        format.kind !== "document"
      ) {
        return {
          file,
          format,
          duplicate: null,
          status: "unsupported",
        };
      }

      const duplicate =
        duplicateByCandidateId.get(file.id) ?? null;

      if (
        duplicate?.status ===
          "duplicate-in-selection" ||
        duplicate?.status ===
          "duplicate-in-knowledge"
      ) {
        return {
          file,
          format,
          duplicate,
          status: "duplicate",
        };
      }

      if (
        duplicate?.status === "possible-duplicate"
      ) {
        return {
          file,
          format,
          duplicate,
          status: "possible-duplicate",
        };
      }

      return {
        file,
        format,
        duplicate,
        status: "accepted",
      };
    });

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
    unreadableExistingDocumentIds:
      existing.unreadableDocumentIds,
  };
}