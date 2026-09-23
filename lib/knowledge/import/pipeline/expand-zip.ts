
// lib/knowledge/import/pipeline/expand-zip.ts

import { inflateRawSync } from "node:zlib";

import {
  detectKnowledgeImportFormat,
} from "./detect-format";

import type {
  KnowledgePreflightFile,
} from "./preflight";

export const MAX_KNOWLEDGE_ZIP_FILES = 5_000;

export const MAX_KNOWLEDGE_ZIP_EXTRACTED_BYTES =
  500 * 1024 * 1024;

const MAX_ZIP_INPUT_BYTES = 100 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;

const LOCAL_FILE_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

export type KnowledgeZipInput = {
  id: string;
  fileName: string;
  content: Uint8Array;
};

export type KnowledgeZipExpansionResult = {
  files: KnowledgePreflightFile[];
  skippedEntries: {
    relativePath: string;
    reason: "directory" | "invalid-path";
  }[];
  totalExtractedBytes: number;
};

type ZipEntry = {
  name: string;
  flags: number;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  isDirectory: boolean;
  isSymbolicLink: boolean;
};

function ensureRange(
  buffer: Buffer,
  offset: number,
  length: number,
): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > buffer.length - length
  ) {
    throw new Error(
      "El ZIP contiene una estructura incompleta o no válida.",
    );
  }
}

function normalizeZipEntryPath(
  entryName: string,
): string | null {
  const normalized = entryName.replaceAll("\\", "/");

  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.includes("\0")
  ) {
    return null;
  }

  const segments = normalized.split("/");

  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === "..",
    )
  ) {
    return null;
  }

  return segments.join("/");
}

function getFileName(
  relativePath: string,
): string {
  return relativePath.split("/").at(-1) ?? relativePath;
}

function findEndOfCentralDirectory(
  buffer: Buffer,
): number {
  // El comentario ZIP estándar admite hasta 65.535 bytes.
  const minimumOffset = Math.max(
    0,
    buffer.length - 22 - 65_535,
  );

  for (
    let offset = buffer.length - 22;
    offset >= minimumOffset;
    offset--
  ) {
    if (
      buffer.readUInt32LE(offset) !==
      END_OF_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      continue;
    }

    const commentLength = buffer.readUInt16LE(
      offset + 20,
    );

    if (
      offset + 22 + commentLength ===
      buffer.length
    ) {
      return offset;
    }
  }

  throw new Error(
    "No se ha encontrado el directorio central del ZIP.",
  );
}

function readZipEntries(
  buffer: Buffer,
): ZipEntry[] {
  const endOffset = findEndOfCentralDirectory(buffer);

  const diskNumber = buffer.readUInt16LE(
    endOffset + 4,
  );

  const centralDirectoryDisk =
    buffer.readUInt16LE(endOffset + 6);

  const entriesOnDisk = buffer.readUInt16LE(
    endOffset + 8,
  );

  const totalEntries = buffer.readUInt16LE(
    endOffset + 10,
  );

  const centralDirectorySize =
    buffer.readUInt32LE(endOffset + 12);

  const centralDirectoryOffset =
    buffer.readUInt32LE(endOffset + 16);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== totalEntries
  ) {
    throw new Error(
      "No se admiten archivos ZIP divididos en varios volúmenes.",
    );
  }

  if (
    totalEntries === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new Error(
      "Los archivos ZIP64 no están admitidos.",
    );
  }

  if (
    totalEntries > MAX_KNOWLEDGE_ZIP_FILES
  ) {
    throw new Error(
      `El ZIP supera el límite de ${MAX_KNOWLEDGE_ZIP_FILES} entradas.`,
    );
  }

  ensureRange(
    buffer,
    centralDirectoryOffset,
    centralDirectorySize,
  );

  if (
    centralDirectoryOffset +
      centralDirectorySize >
    endOffset
  ) {
    throw new Error(
      "El directorio central del ZIP no es válido.",
    );
  }

  const entries: ZipEntry[] = [];

  let offset = centralDirectoryOffset;

  for (
    let index = 0;
    index < totalEntries;
    index++
  ) {
    ensureRange(buffer, offset, 46);

    if (
      buffer.readUInt32LE(offset) !==
      CENTRAL_DIRECTORY_SIGNATURE
    ) {
      throw new Error(
        "El ZIP contiene una entrada de directorio no válida.",
      );
    }

    const flags = buffer.readUInt16LE(
      offset + 8,
    );

    const compressionMethod =
      buffer.readUInt16LE(offset + 10);

    const compressedSize =
      buffer.readUInt32LE(offset + 20);

    const uncompressedSize =
      buffer.readUInt32LE(offset + 24);

    const fileNameLength =
      buffer.readUInt16LE(offset + 28);

    const extraFieldLength =
      buffer.readUInt16LE(offset + 30);

    const commentLength =
      buffer.readUInt16LE(offset + 32);

    const externalAttributes =
      buffer.readUInt32LE(offset + 38);

    const localHeaderOffset =
      buffer.readUInt32LE(offset + 42);

    const entryLength =
      46 +
      fileNameLength +
      extraFieldLength +
      commentLength;

    ensureRange(
      buffer,
      offset,
      entryLength,
    );

    if (
      offset + entryLength >
      centralDirectoryOffset +
        centralDirectorySize
    ) {
      throw new Error(
        "El directorio central del ZIP está incompleto.",
      );
    }

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new Error(
        "Los archivos ZIP64 no están admitidos.",
      );
    }

    const fileNameBytes = buffer.subarray(
      offset + 46,
      offset + 46 + fileNameLength,
    );

    // Se exige UTF-8 para evitar rutas ambiguas.
    if ((flags & 0x0800) === 0) {
      throw new Error(
        "El ZIP contiene nombres de archivo sin codificación UTF-8.",
      );
    }

    const name = fileNameBytes.toString("utf8");

    if (
      !Buffer.from(name, "utf8").equals(
        fileNameBytes,
      )
    ) {
      throw new Error(
        "El ZIP contiene un nombre de archivo UTF-8 no válido.",
      );
    }

    const unixMode =
      (externalAttributes >>> 16) & 0xffff;

    entries.push({
      name,
      flags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      isDirectory: name.endsWith("/"),
      isSymbolicLink:
        (unixMode & 0xf000) === 0xa000,
    });

    offset += entryLength;
  }

  if (
    offset !==
    centralDirectoryOffset +
      centralDirectorySize
  ) {
    throw new Error(
      "El tamaño del directorio central del ZIP no coincide.",
    );
  }

  return entries;
}

function readEntryContent(
  buffer: Buffer,
  entry: ZipEntry,
  remainingBytes: number,
): Buffer {
  if ((entry.flags & 0x0001) !== 0) {
    throw new Error(
      `El ZIP contiene un archivo cifrado: ${entry.name}`,
    );
  }

  if (
    entry.compressionMethod !== 0 &&
    entry.compressionMethod !== 8
  ) {
    throw new Error(
      `Método de compresión no admitido: ${entry.name}`,
    );
  }

  const outputLimit = Math.min(
    MAX_SINGLE_FILE_BYTES,
    remainingBytes,
  );

  if (
    entry.uncompressedSize > outputLimit
  ) {
    throw new Error(
      `El archivo supera el límite de extracción: ${entry.name}`,
    );
  }

  if (
    entry.uncompressedSize > 0 &&
    (
      entry.compressedSize === 0 ||
      entry.uncompressedSize /
        entry.compressedSize >
        MAX_COMPRESSION_RATIO
    )
  ) {
    throw new Error(
      `El archivo presenta una relación de compresión excesiva: ${entry.name}`,
    );
  }

  ensureRange(
    buffer,
    entry.localHeaderOffset,
    30,
  );

  if (
    buffer.readUInt32LE(
      entry.localHeaderOffset,
    ) !== LOCAL_FILE_SIGNATURE
  ) {
    throw new Error(
      `La cabecera del archivo no es válida: ${entry.name}`,
    );
  }

  const localFlags = buffer.readUInt16LE(
    entry.localHeaderOffset + 6,
  );

  const localCompressionMethod =
    buffer.readUInt16LE(
      entry.localHeaderOffset + 8,
    );

  if (
    localFlags !== entry.flags ||
    localCompressionMethod !==
      entry.compressionMethod
  ) {
    throw new Error(
      `Las cabeceras del ZIP no coinciden: ${entry.name}`,
    );
  }

  const localNameLength =
    buffer.readUInt16LE(
      entry.localHeaderOffset + 26,
    );

  const localExtraLength =
    buffer.readUInt16LE(
      entry.localHeaderOffset + 28,
    );

  const nameOffset =
    entry.localHeaderOffset + 30;

  ensureRange(
    buffer,
    nameOffset,
    localNameLength + localExtraLength,
  );

  const localName = buffer
    .subarray(
      nameOffset,
      nameOffset + localNameLength,
    )
    .toString("utf8");

  if (localName !== entry.name) {
    throw new Error(
      `El nombre del archivo no coincide: ${entry.name}`,
    );
  }

  const dataOffset =
    nameOffset +
    localNameLength +
    localExtraLength;

  ensureRange(
    buffer,
    dataOffset,
    entry.compressedSize,
  );

  const compressedContent = buffer.subarray(
    dataOffset,
    dataOffset + entry.compressedSize,
  );

  let content: Buffer;

  if (entry.compressionMethod === 0) {
    if (
      entry.compressedSize !==
      entry.uncompressedSize
    ) {
      throw new Error(
        `El tamaño del archivo no coincide: ${entry.name}`,
      );
    }

    content = compressedContent;
  } else {
    try {
      content = inflateRawSync(
        compressedContent,
        {
          maxOutputLength: outputLimit,
        },
      );
    } catch {
      throw new Error(
        `No se ha podido descomprimir el archivo dentro del límite permitido: ${entry.name}`,
      );
    }
  }

  if (
    content.byteLength !==
    entry.uncompressedSize
  ) {
    throw new Error(
      `El tamaño extraído no coincide: ${entry.name}`,
    );
  }

  return content;
}

/**
 * Expande un ZIP en memoria con límites por archivo
 * y sobre el tamaño total declarado.
 *
 * No escribe en disco, no sube originales a Blob
 * y no ejecuta extracción de texto ni IA.
 */
export function expandKnowledgeZip(
  input: KnowledgeZipInput,
): KnowledgeZipExpansionResult {
  if (
    !input.fileName.toLowerCase().endsWith(
      ".zip",
    )
  ) {
    throw new Error(
      "El archivo seleccionado no tiene extensión ZIP.",
    );
  }

  if (
    input.content.byteLength >
    MAX_ZIP_INPUT_BYTES
  ) {
    throw new Error(
      "El ZIP supera el límite de 100 MB.",
    );
  }

  const buffer = Buffer.from(input.content);

  const entries = readZipEntries(buffer);

  const files: KnowledgePreflightFile[] = [];

  const skippedEntries:
    KnowledgeZipExpansionResult["skippedEntries"] = [];

  let totalExtractedBytes = 0;

  for (
    let index = 0;
    index < entries.length;
    index++
  ) {
    const entry = entries[index];

    if (entry.isDirectory) {
      skippedEntries.push({
        relativePath: entry.name,
        reason: "directory",
      });

      continue;
    }

    if (entry.isSymbolicLink) {
      throw new Error(
        `El ZIP contiene un enlace simbólico no admitido: ${entry.name}`,
      );
    }

    const relativePath =
      normalizeZipEntryPath(entry.name);

    if (!relativePath) {
      skippedEntries.push({
        relativePath: entry.name,
        reason: "invalid-path",
      });

      continue;
    }

    const fileName =
      getFileName(relativePath);

    const format =
      detectKnowledgeImportFormat({
        fileName,
        source: "archive",
      });

    if (
      !format.supported ||
      format.kind !== "document"
    ) {
      files.push({
        id: `${input.id}:${index + 1}`,
        fileName,
        relativePath,
        source: "archive",
        content: new Uint8Array(),
      });

      continue;
    }

    const remainingBytes =
      MAX_KNOWLEDGE_ZIP_EXTRACTED_BYTES -
      totalExtractedBytes;

    const content = readEntryContent(
      buffer,
      entry,
      remainingBytes,
    );

    totalExtractedBytes +=
      content.byteLength;

    files.push({
      id: `${input.id}:${index + 1}`,
      fileName,
      relativePath,
      mimeType: format.mimeType,
      source: "archive",
      content,
    });
  }

  return {
    files,
    skippedEntries,
    totalExtractedBytes,
  };
}