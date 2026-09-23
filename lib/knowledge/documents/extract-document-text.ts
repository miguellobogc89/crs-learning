// lib/knowledge/file-analysis/extract-document-text.ts

import path from "node:path";
import { parseOffice } from "officeparser";

import {
  isPlainTextKnowledgeDocument,
  isSupportedKnowledgeDocument,
} from "@/lib/knowledge/import/supported-formats";

import { ingestDocument } from "@/lib/knowledge/documents/document-ingestion.service";

const OFFICE_FILE_TYPES = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".xlsx": "xlsx",
  ".pptx": "pptx",
} as const;

type OfficeExtension = keyof typeof OFFICE_FILE_TYPES;

function isOfficeExtension(
  extension: string,
): extension is OfficeExtension {
  return Object.prototype.hasOwnProperty.call(
    OFFICE_FILE_TYPES,
    extension,
  );
}

export async function extractDocumentText(
  content: Buffer,
  fileName: string,
): Promise<string> {
  const extension = path.extname(fileName).toLowerCase();

  if (!isSupportedKnowledgeDocument(fileName)) {
    throw new Error(
      `Formato no compatible: ${extension || "sin extensión"}`,
    );
  }

  if (content.length === 0) {
    throw new Error("El documento está vacío");
  }

  if (extension === ".pdf") {
  const result = await ingestDocument({
    buffer: content,
    fileName,
    mimeType: "application/pdf",
  });

  return result.text;
}

  if (isPlainTextKnowledgeDocument(fileName)) {
    return content.toString("utf8");
  }

  if (!isOfficeExtension(extension)) {
    throw new Error(
      `No existe un extractor configurado para ${extension}`,
    );
  }

  const ast = await parseOffice(content, {
    fileType: OFFICE_FILE_TYPES[extension],
  });

  return ast.toText();
}