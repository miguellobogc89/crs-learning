
// app/api/knowledge/import/upload/route.ts

import path from "node:path";
import { resolveDuplicateSelection } from "@/lib/knowledge/import/pipeline/duplicate-selection";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { knowledgeLibraryWriteWhere } from "@/lib/knowledge/access-control";
import {
  buildKnowledgeImportInventory,
  type KnowledgeImportSelectionMode,
} from "@/lib/knowledge/import/pipeline/build-inventory";
import {
  runKnowledgeImportPreflight,
} from "@/lib/knowledge/import/pipeline/preflight";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import {
  deleteKnowledgeFile,
  uploadKnowledgeFile,
} from "@/lib/storage/knowledge-storage";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_IMPORT_SIZE = 150 * 1024 * 1024;
const MAX_SELECTED_FILES = 5_000;

const ALLOWED_MODES = new Set<KnowledgeImportSelectionMode>([
  "files",
  "folder",
  "zip",
]);

function isImportMode(
  value: string,
): value is KnowledgeImportSelectionMode {
  return ALLOWED_MODES.has(
    value as KnowledgeImportSelectionMode,
  );
}

function sanitizeFileName(fileName: string) {
  const baseName = path.basename(
    fileName.replaceAll("\\", "/"),
  );

  return baseName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeRelativePath(
  relativePath: string,
  fallbackName: string,
) {
  const normalized = relativePath
    .replaceAll("\\", "/")
    .split("/")
    .filter(
      (segment) =>
        segment &&
        segment !== "." &&
        segment !== "..",
    )
    .map((segment) => sanitizeFileName(segment))
    .filter(Boolean)
    .join("/");

  return normalized || fallbackName;
}

function parseRelativePaths(
  value: FormDataEntryValue | null,
): string[] {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((item) =>
      typeof item === "string" ? item : "",
    );
  } catch {
    return [];
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Error desconocido durante la importación.";
}

export async function POST(request: Request) {
  let importId: string | null = null;

  const uploadedStoragePaths: string[] = [];

  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 },
      );
    }

    const { activeWorkspace } =
      await getActiveWorkspaceContext(userId);

    /*
     * El Content-Length es una comprobación preliminar.
     * No sustituye un límite de tamaño aplicado por
     * el servidor o la infraestructura HTTP.
     */
    const contentLength = Number(
      request.headers.get("content-length"),
    );

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_IMPORT_SIZE
    ) {
      return NextResponse.json(
        {
          error:
            "La petición supera el límite máximo de 150 MB.",
        },
        { status: 413 },
      );
    }

    const formData = await request.formData();

    const libraryIdEntry = formData.get("libraryId");
    const modeEntry = formData.get("mode");

    const libraryId =
      typeof libraryIdEntry === "string"
        ? libraryIdEntry.trim()
        : "";

    const mode =
      typeof modeEntry === "string"
        ? modeEntry.trim()
        : "";

    if (!libraryId) {
      return NextResponse.json(
        { error: "Falta la carpeta de destino." },
        { status: 400 },
      );
    }

    if (!isImportMode(mode)) {
      return NextResponse.json(
        {
          error:
            "El tipo de importación no es válido.",
        },
        { status: 400 },
      );
    }

    const files = formData
      .getAll("files")
      .filter(
        (entry): entry is File =>
          entry instanceof File,
      );

    if (files.length === 0) {
      return NextResponse.json(
        {
          error:
            "No se ha recibido ningún archivo.",
        },
        { status: 400 },
      );
    }

    if (files.length > MAX_SELECTED_FILES) {
      return NextResponse.json(
        {
          error:
            `La selección supera el límite de ${MAX_SELECTED_FILES} archivos.`,
        },
        { status: 413 },
      );
    }

    if (
      mode === "zip" &&
      files.length !== 1
    ) {
      return NextResponse.json(
        {
          error:
            "Selecciona un único ZIP para esta modalidad.",
        },
        { status: 400 },
      );
    }

    const totalSize = files.reduce(
      (total, file) => total + file.size,
      0,
    );

    if (totalSize > MAX_IMPORT_SIZE) {
      return NextResponse.json(
        {
          error:
            "La importación supera el límite máximo de 150 MB.",
        },
        { status: 413 },
      );
    }

    const user = await prisma.users.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        company_id: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          error:
            "No se ha encontrado el usuario.",
        },
        { status: 404 },
      );
    }

    const library =
      await prisma.knowledge_libraries.findFirst({
        where: {
          id: libraryId,
          ...knowledgeLibraryWriteWhere(
            user.id,
            activeWorkspace.id,
          ),
        },
        select: {
          id: true,
        },
      });

    if (!library) {
      return NextResponse.json(
        {
          error:
            "La carpeta no existe o no tienes acceso a ella.",
        },
        { status: 403 },
      );
    }

    const relativePaths = parseRelativePaths(
      formData.get("relativePaths"),
    );

    /*
     * Primero leemos y validamos toda la selección.
     * Hasta completar el preflight no se crea ninguna
     * importación ni se guarda ningún archivo.
     */
    const selectedFiles = await Promise.all(
      files.map(async (file, index) => ({
        id: `selected:${index + 1}`,
        fileName: file.name,
        relativePath:
          relativePaths[index] || file.name,
        mimeType: file.type || null,
        content: new Uint8Array(
          await file.arrayBuffer(),
        ),
      })),
    );

    let inventory;

    try {
      inventory = buildKnowledgeImportInventory({
        mode,
        files: selectedFiles,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: getErrorMessage(error),
        },
        { status: 400 },
      );
    }

    const preflight =
      await runKnowledgeImportPreflight({
        ownerUserId: user.id,
        workspaceId: activeWorkspace.id,
        files: inventory.files,
      });

    const reviewFiles = preflight.files
      .filter(
        (result) =>
          result.status !== "accepted",
      )
      .map((result) => ({
        id: result.file.id,
        fileName: result.file.fileName,
        relativePath:
          result.file.relativePath,
        fileSize:
          result.file.content.byteLength,
        status: result.status,
        duplicate:
          result.duplicate?.status ?? null,
        existingKnowledgeFileId:
          result.duplicate?.status ===
            "duplicate-in-knowledge" ||
          result.duplicate?.status ===
            "possible-duplicate"
            ? result.duplicate.existingKnowledgeFileId
            : null,
      }));

    const decision = resolveDuplicateSelection(preflight);
    if (decision.requiresReview) {
      return NextResponse.json(
        {
          status: "requires_review",
          error:
            "La selección contiene archivos que requieren revisión antes de importarse.",
          inventory: {
            totalFiles: inventory.totalFiles,
            totalBytes: inventory.totalBytes,
            archiveCount: inventory.archiveCount,
            skippedArchiveEntries:
              inventory.skippedArchiveEntries,
          },
          acceptedFiles:
            preflight.acceptedFiles.map(
              (result) => ({
                id: result.file.id,
                fileName:
                  result.file.fileName,
                relativePath:
                  result.file.relativePath,
                fileSize:
                  result.file.content.byteLength,
              }),
            ),
          reviewFiles,
          unreadableExistingDocumentIds:
            preflight.unreadableExistingDocumentIds,
        },
        { status: decision.allFilesDuplicate ? 200 : 409 },
      );
    }

    if (
      preflight.acceptedFiles.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No hay documentos admitidos para importar.",
        },
        { status: 400 },
      );
    }

    // Ordinary imports keep their originals. Filtered ZIPs store only accepted entries.
    const storageFiles = preflight.duplicateFiles.length > 0
      ? preflight.acceptedFiles.map((result) => result.file)
      : selectedFiles;
    const storageMode = preflight.duplicateFiles.length > 0 && mode === "zip"
      ? "folder"
      : mode;
    const storedTotalSize = storageFiles.reduce(
      (total, file) => total + file.content.byteLength, 0,
    );
    const originalName =
      mode === "zip"
        ? files[0]?.name ?? null
        : files.length === 1
          ? files[0].name
          : `${files.length} archivos`;

    const knowledgeImport =
      await prisma.knowledge_imports.create({
        data: {
          library_id: library.id,
          owner_user_id: user.id,
          company_id: user.company_id,
          status: "uploading",
          upload_type: storageMode,
          original_name: originalName,
          total_files: storageFiles.length,
          total_size: storedTotalSize,
        },
        select: {
          id: true,
        },
      });

    importId = knowledgeImport.id;

    const uploadedFiles: Array<{
      import_id: string;
      file_name: string;
      relative_path: string;
      mime_type: string | null;
      file_size: number;
      storage_path: string;
      status: string;
    }> = [];

    for (
      const [index, file] of storageFiles.entries()
    ) {
      const safeFileName =
        sanitizeFileName(file.fileName) ||
        `archivo-${index + 1}`;

      const relativePath =
        sanitizeRelativePath(
          file.relativePath || file.fileName,
          safeFileName,
        );

      const storedFileName =
        `${String(index + 1).padStart(4, "0")}-` +
        safeFileName;

      const pathname =
        `knowledge/imports/${importId}/originals/` +
        storedFileName;

      const buffer = Buffer.from(
        file.content,
      );

      const storagePath =
        await uploadKnowledgeFile(
          pathname,
          buffer,
          file.mimeType ||
            "application/octet-stream",
        );

      uploadedStoragePaths.push(storagePath);

      uploadedFiles.push({
        import_id: importId,
        file_name: safeFileName,
        relative_path: relativePath,
        mime_type: file.mimeType || null,
        file_size: file.content.byteLength,
        storage_path: storagePath,
        status: "uploaded",
      });
    }

    await prisma.$transaction([
      prisma.knowledge_import_files.createMany({
        data: uploadedFiles,
      }),
      prisma.knowledge_imports.update({
        where: {
          id: importId,
        },
        data: {
          status: "uploaded",
          updated_at: new Date(),
        },
      }),
    ]);

    return NextResponse.json(
      {
        importId,
        status: "uploaded",
        mode: storageMode,
        fileCount: storageFiles.length,
        totalSize: storedTotalSize,
        skippedDuplicateFiles: reviewFiles.filter((file) => file.status === "duplicate"),
        storedFiles: preflight.duplicateFiles.length > 0 ? storageFiles.map((file) => ({
          id: file.id,
          name: file.fileName,
          relativePath: file.relativePath,
          size: file.content.byteLength,
        })) : undefined,
        inventoryFileCount:
          preflight.acceptedFiles.length,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(
      "Knowledge import upload error:",
      error,
    );

    await Promise.allSettled(
      uploadedStoragePaths.map(
        (storagePath) =>
          deleteKnowledgeFile(storagePath),
      ),
    );

    if (importId) {
      await prisma.knowledge_imports
        .update({
          where: {
            id: importId,
          },
          data: {
            status: "failed",
            error_message:
              getErrorMessage(error),
            updated_at: new Date(),
          },
        })
        .catch(() => undefined);
    }

    return NextResponse.json(
      {
        error:
          "No se ha podido completar la importación.",
      },
      { status: 500 },
    );
  }
}
