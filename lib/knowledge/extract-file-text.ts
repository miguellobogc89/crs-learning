// lib/knowledge/extract-file-text.ts

import mammoth from "mammoth";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { XMLParser } from "fast-xml-parser";

import { ingestDocument } from "@/lib/knowledge/document-ingestion.service";
import {
  isAcceptedKnowledgeFileType,
} from "@/lib/knowledge/file-types";

const ZIP_MIME_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
]);

export async function extractFileText(
  file: File,
): Promise<string> {
  const mimeType = normalizeMimeType(file.type);
  const buffer = Buffer.from(
    await file.arrayBuffer(),
  );

  if (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/")
  ) {
    const result = await ingestDocument({
      buffer,
      fileName: file.name,
      mimeType,
    });

    return result.text;
  }

  if (
    ZIP_MIME_TYPES.has(mimeType) ||
    file.name.toLowerCase().endsWith(".zip")
  ) {
    return extractZip(buffer);
  }

  switch (mimeType) {
    case "text/plain":
    case "text/markdown":
      return buffer.toString("utf8");

    case "text/csv":
      return extractCsv(buffer);

    case "application/msword":
      throw new Error(
        `El archivo ${file.name} usa el formato .doc antiguo, que todavía no puede procesarse.`,
      );

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocx(buffer);

    case "application/vnd.ms-excel":
      return extractExcel(buffer);

    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return extractExcel(buffer);

    case "application/vnd.ms-powerpoint":
      throw new Error(
        `El archivo ${file.name} usa el formato .ppt antiguo, que todavía no puede procesarse.`,
      );

    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return extractPowerPoint(buffer);

    default:
      return extractByExtension(
        file.name,
        buffer,
      );
  }
}

async function extractZip(
  buffer: Buffer,
): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);

  const output: string[] = [];

  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter(
      (entry) =>
        !isIgnoredZipEntry(entry.name),
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name),
    );

  for (const entry of entries) {
    const entryName = entry.name.trim();

    const mimeType =
      getMimeTypeFromFileName(entryName);

const content = await entry.async(
  "uint8array",
);

const arrayBuffer = content.buffer.slice(
  content.byteOffset,
  content.byteOffset + content.byteLength,
) as ArrayBuffer;

const nestedFile = new File(
  [arrayBuffer],
  entryName,
  {
    type: mimeType,
  },
);

    if (
      !isAcceptedKnowledgeFileType(
        nestedFile,
      )
    ) {
      continue;
    }

    try {
      const extractedText =
        await extractFileText(nestedFile);

      if (!extractedText.trim()) {
        continue;
      }

      output.push(
        `# Archivo: ${entryName}`,
      );
      output.push("");
      output.push(extractedText.trim());
      output.push("");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo procesar el archivo";

      output.push(
        `# Archivo: ${entryName}`,
      );
      output.push("");
      output.push(
        `[No se pudo extraer el contenido: ${message}]`,
      );
      output.push("");
    }
  }

  if (output.length === 0) {
    throw new Error(
      "El ZIP no contiene archivos compatibles con Knowledge.",
    );
  }

  return output.join("\n").trim();
}

async function extractByExtension(
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  const extension =
    getFileExtension(fileName);

  switch (extension) {
    case "txt":
    case "md":
      return buffer.toString("utf8");

    case "csv":
      return extractCsv(buffer);

    case "docx":
      return extractDocx(buffer);

    case "xls":
    case "xlsx":
      return extractExcel(buffer);

    case "pptx":
      return extractPowerPoint(buffer);

    case "pdf": {
      const result =
        await ingestDocument({
          buffer,
          fileName,
          mimeType: "application/pdf",
        });

      return result.text;
    }

    case "jpg":
    case "jpeg":
    case "png": {
      const mimeType =
        extension === "png"
          ? "image/png"
          : "image/jpeg";

      const result =
        await ingestDocument({
          buffer,
          fileName,
          mimeType,
        });

      return result.text;
    }

    case "doc":
      throw new Error(
        `El archivo ${fileName} usa el formato .doc antiguo, que todavía no puede procesarse.`,
      );

    case "ppt":
      throw new Error(
        `El archivo ${fileName} usa el formato .ppt antiguo, que todavía no puede procesarse.`,
      );

    default:
      throw new Error(
        `Formato no soportado: ${fileName}`,
      );
  }
}

async function extractDocx(
  buffer: Buffer,
) {
  const result =
    await mammoth.extractRawText({
      buffer,
    });

  return result.value.trim();
}

function extractCsv(
  buffer: Buffer,
) {
  return buffer.toString("utf8");
}

function extractExcel(
  buffer: Buffer,
) {
  const workbook = XLSX.read(buffer);

  const output: string[] = [];

  for (
    const sheetName of workbook.SheetNames
  ) {
    output.push(`# Hoja: ${sheetName}`);

    const sheet =
      workbook.Sheets[sheetName];

    const rows =
      XLSX.utils.sheet_to_json(sheet, {
        header: 1,
      });

    for (
      const row of rows as unknown[][]
    ) {
      output.push(
        row
          .map((cell) =>
            cell == null
              ? ""
              : String(cell),
          )
          .join(" | "),
      );
    }

    output.push("");
  }

  return output.join("\n").trim();
}

async function extractPowerPoint(
  buffer: Buffer,
) {
  const zip =
    await JSZip.loadAsync(buffer);

  const parser = new XMLParser();

  const slides = Object.keys(
    zip.files,
  )
    .filter((fileName) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(
        fileName,
      ),
    )
    .sort(compareSlideNames);

  const output: string[] = [];

  for (const slide of slides) {
    output.push(
      `# ${slide.split("/").pop()}`,
    );

    const xml =
      await zip.files[slide].async(
        "string",
      );

    const parsed = parser.parse(xml);

    const texts: string[] = [];

    walk(parsed, (value) => {
      if (value.trim()) {
        texts.push(value.trim());
      }
    });

    output.push(texts.join(" "));
    output.push("");
  }

  return output.join("\n").trim();
}

function normalizeMimeType(
  mimeType: string,
) {
  return mimeType
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function getFileExtension(
  fileName: string,
) {
  return (
    fileName
      .trim()
      .toLowerCase()
      .split(".")
      .pop() ?? ""
  );
}

function getMimeTypeFromFileName(
  fileName: string,
) {
  const extension =
    getFileExtension(fileName);

  switch (extension) {
    case "pdf":
      return "application/pdf";

    case "txt":
      return "text/plain";

    case "md":
      return "text/markdown";

    case "csv":
      return "text/csv";

    case "doc":
      return "application/msword";

    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    case "xls":
      return "application/vnd.ms-excel";

    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    case "ppt":
      return "application/vnd.ms-powerpoint";

    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";

    case "jpg":
    case "jpeg":
      return "image/jpeg";

    case "png":
      return "image/png";

    case "zip":
      return "application/zip";

    default:
      return "application/octet-stream";
  }
}

function isIgnoredZipEntry(
  fileName: string,
) {
  const normalized =
    fileName.replaceAll("\\", "/");

  const baseName =
    normalized.split("/").pop() ?? "";

  return (
    normalized.startsWith("__MACOSX/") ||
    baseName === ".DS_Store" ||
    baseName.startsWith("._") ||
    baseName.startsWith("~$")
  );
}

function compareSlideNames(
  first: string,
  second: string,
) {
  const firstNumber =
    Number(
      first.match(/slide(\d+)\.xml$/)?.[1],
    ) || 0;

  const secondNumber =
    Number(
      second.match(/slide(\d+)\.xml$/)?.[1],
    ) || 0;

  return firstNumber - secondNumber;
}

function walk(
  value: unknown,
  callback: (value: string) => void,
) {
  if (typeof value === "string") {
    callback(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, callback);
    }

    return;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    for (
      const child of Object.values(value)
    ) {
      walk(child, callback);
    }
  }
}