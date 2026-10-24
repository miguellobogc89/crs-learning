// Shared extraction for import staging and document reanalysis.

import path from "node:path";
import { parseOffice } from "officeparser";
import * as XLSX from "xlsx";

import {
  isPlainTextKnowledgeDocument,
  isSupportedKnowledgeDocument,
} from "@/lib/knowledge/import/supported-formats";

import { ingestDocument } from "@/lib/knowledge/documents/document-ingestion.service";

const OFFICE_FILE_TYPES = {
  ".docx": "docx",
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

  // Preserve worksheet boundaries and empty cells for downstream evidence.
  // Flattening an Excel workbook as prose loses which values share a row.
  if (extension === ".xlsx") {
    const workbook = XLSX.read(content);
    return workbook.SheetNames.map(sheetName => {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
      });
      return [
        `# Hoja: ${sheetName}`,
        ...rows.map(row => row.map(cell => cell == null ? "" : String(cell)).join(" | ")),
      ].join("\n");
    }).join("\n\n").trim();
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