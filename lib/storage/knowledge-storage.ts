// lib/storage/knowledge-storage.ts

import { del, get, put } from "@vercel/blob";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";

const BLOB_PREFIX = "knowledge/";

function isBlobStoragePath(storagePath: string): boolean {
  return storagePath.startsWith(BLOB_PREFIX);
}

function resolveLegacyStoragePath(storagePath: string): string {
  const normalizedPath = storagePath
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");

  const publicRoot = path.resolve(process.cwd(), "public");

  const absolutePath = path.resolve(
    publicRoot,
    normalizedPath,
  );

  if (
    absolutePath === publicRoot ||
    !absolutePath.startsWith(`${publicRoot}${path.sep}`)
  ) {
    throw new Error("Ruta de almacenamiento no válida");
  }

  return absolutePath;
}

export async function uploadKnowledgeFile(
  pathname: string,
  content: Buffer,
  contentType = "application/octet-stream",
): Promise<string> {
  if (!pathname.startsWith(BLOB_PREFIX)) {
    throw new Error("Ruta de Blob no válida");
  }

  const blob = await put(pathname, content, {
    access: "private",
    addRandomSuffix: true,
    contentType,
  });

  return blob.pathname;
}

export async function readKnowledgeFile(
  storagePath: string,
): Promise<Buffer> {
  if (!isBlobStoragePath(storagePath)) {
    return readFile(resolveLegacyStoragePath(storagePath));
  }

  const blob = await get(storagePath, {
    access: "private",
  });

  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    throw new Error("No se ha podido recuperar el documento");
  }

const arrayBuffer = await new Response(
  blob.stream,
).arrayBuffer();

return Buffer.from(arrayBuffer);
}

export async function deleteKnowledgeFile(
  storagePath: string,
): Promise<void> {
  if (isBlobStoragePath(storagePath)) {
    await del(storagePath);
    return;
  }

  try {
    await unlink(resolveLegacyStoragePath(storagePath));
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
}