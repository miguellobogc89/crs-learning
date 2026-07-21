// lib/knowledge/intake/load-import-documents.ts

import { prisma } from "@/lib/prisma";
import type {
  KnowledgeIntakeDocument,
  KnowledgeIntakeSourceKind,
} from "./types";

export async function loadKnowledgeImportDocuments(
  importId: string,
): Promise<KnowledgeIntakeDocument[]> {
  const knowledgeImport = await prisma.knowledge_imports.findUnique({
    where: {
      id: importId,
    },
    select: {
      id: true,
      upload_type: true,
      knowledge_import_files: {
        orderBy: {
          created_at: "asc",
        },
        select: {
          id: true,
          file_name: true,
          mime_type: true,
          file_size: true,
          relative_path: true,
          extracted_text: true,
        },
      },
    },
  });

  if (!knowledgeImport) {
    throw new Error("No se ha encontrado la importación.");
  }

  const sourceKind = normalizeSourceKind(
    knowledgeImport.upload_type,
  );

  return knowledgeImport.knowledge_import_files.map((document) => ({
    id: document.id,
    fileName: document.file_name,
    documentName: document.file_name,
    mimeType: document.mime_type,
    sizeBytes: document.file_size,
    relativePath: document.relative_path,
    extractedText: document.extracted_text,
    sourceKind,
  }));
}

function normalizeSourceKind(
  uploadType: string,
): KnowledgeIntakeSourceKind {
  const normalizedType = uploadType.trim().toLowerCase();

  if (
    normalizedType === "zip" ||
    normalizedType === "archive"
  ) {
    return "zip";
  }

  if (
    normalizedType === "folder" ||
    normalizedType === "directory"
  ) {
    return "folder";
  }

  return "file";
}