// lib/knowledge/expand-knowledge-files.ts

import JSZip from "jszip";

import {
  isAcceptedKnowledgeFileType,
} from "@/lib/knowledge/file-types";

const ZIP_MIME_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
]);

export type ExpandedKnowledgeFile = {
  file: File;
  sourceArchiveName?: string;
  relativePath?: string;
};

export async function expandKnowledgeFiles(
  files: File[],
): Promise<ExpandedKnowledgeFile[]> {
  const expandedFiles: ExpandedKnowledgeFile[] = [];

  for (const file of files) {
    if (isZipFile(file)) {
      const zipFiles =
        await expandZipFile(file);

      expandedFiles.push(...zipFiles);
      continue;
    }

    expandedFiles.push({
      file,
      relativePath: file.name,
    });
  }

  return expandedFiles;
}

async function expandZipFile(
  archive: File,
): Promise<ExpandedKnowledgeFile[]> {
  const buffer = Buffer.from(
    await archive.arrayBuffer(),
  );

  const zip = await JSZip.loadAsync(buffer);

  const expandedFiles: ExpandedKnowledgeFile[] = [];

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
    const relativePath =
      normalizePath(entry.name);

    const mimeType =
      getMimeTypeFromFileName(relativePath);

    const content = await entry.async(
      "uint8array",
    );

    const arrayBuffer =
      content.buffer.slice(
        content.byteOffset,
        content.byteOffset +
          content.byteLength,
      ) as ArrayBuffer;

    const extractedFile = new File(
      [arrayBuffer],
      getBaseName(relativePath),
      {
        type: mimeType,
        lastModified: archive.lastModified,
      },
    );

    if (
      !isAcceptedKnowledgeFileType(
        extractedFile,
      )
    ) {
      continue;
    }

    expandedFiles.push({
      file: extractedFile,
      sourceArchiveName: archive.name,
      relativePath,
    });
  }

  return expandedFiles;
}

function isZipFile(file: File) {
  const mimeType = file.type
    .split(";")[0]
    .trim()
    .toLowerCase();

  return (
    ZIP_MIME_TYPES.has(mimeType) ||
    file.name
      .trim()
      .toLowerCase()
      .endsWith(".zip")
  );
}

function normalizePath(path: string) {
  return path
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .trim();
}

function getBaseName(path: string) {
  return (
    path.split("/").pop() ||
    path
  );
}

function isIgnoredZipEntry(
  fileName: string,
) {
  const normalized =
    normalizePath(fileName);

  const baseName =
    getBaseName(normalized);

  return (
    normalized.startsWith("__MACOSX/") ||
    baseName === ".DS_Store" ||
    baseName.startsWith("._") ||
    baseName.startsWith("~$")
  );
}

function getMimeTypeFromFileName(
  fileName: string,
) {
  const extension =
    fileName
      .toLowerCase()
      .split(".")
      .pop() ?? "";

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