// lib/knowledge/extract-file-text.ts
import mammoth from "mammoth";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { XMLParser } from "fast-xml-parser";

export async function extractFileText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());

  switch (file.type) {
    case "text/plain":
    case "text/markdown":
      return buffer.toString("utf8");

    case "text/csv":
      return extractCsv(buffer);

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocx(buffer);

    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return extractExcel(buffer);

    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return extractPowerPoint(buffer);

    default:
      throw new Error(`Formato no soportado: ${file.type}`);
  }
}

async function extractDocx(buffer: Buffer) {
  const result = await mammoth.extractRawText({
    buffer,
  });

  return result.value.trim();
}

function extractCsv(buffer: Buffer) {
  return buffer.toString("utf8");
}

function extractExcel(buffer: Buffer) {
  const workbook = XLSX.read(buffer);

  const output: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    output.push(`# Hoja: ${sheetName}`);

    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
    });

    for (const row of rows as unknown[][]) {
      output.push(row.join(" | "));
    }

    output.push("");
  }

  return output.join("\n");
}

async function extractPowerPoint(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);

  const parser = new XMLParser();

  const slides = Object.keys(zip.files)
    .filter((f) => f.startsWith("ppt/slides/slide"))
    .sort();

  const output: string[] = [];

  for (const slide of slides) {
    output.push(`# ${slide.split("/").pop()}`);

    const xml = await zip.files[slide].async("string");

    const parsed = parser.parse(xml);

    const texts: string[] = [];

    walk(parsed, (value) => {
      if (typeof value === "string") {
        texts.push(value);
      }
    });

    output.push(texts.join(" "));
    output.push("");
  }

  return output.join("\n");
}

function walk(value: unknown, callback: (v: string) => void) {
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

  if (value && typeof value === "object") {
    for (const child of Object.values(value)) {
      walk(child, callback);
    }
  }
}