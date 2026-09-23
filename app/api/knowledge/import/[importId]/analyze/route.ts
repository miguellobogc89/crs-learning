
// app/api/knowledge/import/[importId]/analyze/route.ts

import { NextResponse } from "next/server";
import { resolveDuplicateSelection } from "@/lib/knowledge/import/pipeline/duplicate-selection";

import { auth } from "@/auth";
import {
  buildKnowledgeProcessingQueue,
} from "@/lib/knowledge/import/pipeline/build-processing-queue";
import {
  prepareKnowledgeImportAnalysis,
} from "@/lib/knowledge/import/pipeline/prepare-analysis";
import type {
  KnowledgePreflightFileResult,
} from "@/lib/knowledge/import/pipeline/preflight";
import { prisma } from "@/lib/prisma";
import {
  getActiveWorkspaceContext,
} from "@/lib/services/workspace.service";
import {
  deleteKnowledgeFile,
  uploadKnowledgeFile,
} from "@/lib/storage/knowledge-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    importId: string;
  }>;
};

type ImportMode = "files" | "folder" | "zip";

function isImportMode(value: string): value is ImportMode {
  return (
    value === "files" ||
    value === "folder" ||
    value === "zip"
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se ha podido preparar la documentación.";
}

function getReviewFile(
  result: KnowledgePreflightFileResult,
) {
  const duplicate = result.duplicate;

  return {
    id: result.file.id,
    fileName: result.file.fileName,
    relativePath: result.file.relativePath,
    fileSize: result.file.content.byteLength,
    fileType: result.file.mimeType ?? null,
    status: result.status,
    duplicate: duplicate?.status ?? null,
    existingKnowledgeFileId:
      duplicate?.status === "duplicate-in-knowledge" ||
      duplicate?.status === "possible-duplicate"
        ? duplicate.existingKnowledgeFileId
        : null,
  };
}

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      { error: "No autorizado" },
      { status: 401 },
    );
  }

  const { importId } = await context.params;

  if (!importId) {
    return NextResponse.json(
      { error: "Importación no válida" },
      { status: 400 },
    );
  }

  const { activeWorkspace } =
    await getActiveWorkspaceContext(userId);

  const knowledgeImport =
    await prisma.knowledge_imports.findFirst({
      where: {
        id: importId,
        owner_user_id: userId,
        knowledge_libraries: {
          workspace_id: activeWorkspace.id,
        },
      },
      include: {
        knowledge_import_files: {
          orderBy: {
            created_at: "asc",
          },
        },
      },
    });

  if (!knowledgeImport) {
    return NextResponse.json(
      { error: "Importación no encontrada" },
      { status: 404 },
    );
  }

  if (
    knowledgeImport.status === "cancelled" ||
    knowledgeImport.processing_status === "cancelled"
  ) {
    return NextResponse.json(
      { error: "La importación ha sido cancelada" },
      { status: 409 },
    );
  }

  if (
    knowledgeImport.processing_status === "processing" ||
    knowledgeImport.processing_status === "analyzing"
  ) {
    return NextResponse.json(
      { error: "La importación ya se está procesando" },
      { status: 409 },
    );
  }

  const mode = knowledgeImport.upload_type;

  if (!isImportMode(mode)) {
    return NextResponse.json(
      { error: "Modalidad de importación no válida" },
      { status: 400 },
    );
  }

  const uploadedFiles =
    knowledgeImport.knowledge_import_files.filter(
      (file) => file.status === "uploaded",
    );

  if (uploadedFiles.length === 0) {
    return NextResponse.json(
      {
        error:
          "La importación no contiene archivos originales.",
      },
      { status: 400 },
    );
  }

  /*
   * Solo una petición puede pasar de uploaded/extracted
   * a analyzing. Evitamos que dos análisis simultáneos
   * creen dos colas para la misma importación.
   */
  const claimed = await prisma.knowledge_imports.updateMany({
    where: {
      id: importId,
      status: {
        in: ["uploaded", "extracted", "error"],
      },
      processing_status: {
        notIn: [
          "analyzing",
          "processing",
          "cancelled",
        ],
      },
    },
    data: {
      status: "processing",
      processing_status: "analyzing",
      completed_files: 0,
      failed_files: 0,
      current_file_id: null,
      processing_started_at: null,
      processing_completed_at: null,
      completed_at: null,
      error_message: null,
      updated_at: new Date(),
    },
  });

  if (claimed.count !== 1) {
    return NextResponse.json(
      {
        error:
          "La importación no está disponible para iniciar el análisis.",
      },
      { status: 409 },
    );
  }

  const createdStoragePaths: string[] = [];
  let queuePersisted = false;

  try {
    /*
     * El inventario, la expansión ZIP, los formatos y
     * los duplicados utilizan el mismo pipeline que
     * la ruta de subida.
     */
    const prepared =
      await prepareKnowledgeImportAnalysis({
        ownerUserId: userId,
        workspaceId: activeWorkspace.id,
        mode,
        files: uploadedFiles.map((file) => ({
          id: file.id,
          fileName: file.file_name,
          relativePath: file.relative_path,
          mimeType: file.mime_type,
          storagePath: file.storage_path,
        })),
      });

    const { preflight } = prepared;
    const decision = resolveDuplicateSelection(preflight);

    const reviewFiles = preflight.files
      .filter((result) => result.status !== "accepted")
      .map(getReviewFile);

    /*
     * No guardamos documentos derivados ni iniciamos
     * procesamiento si el preflight requiere revisión.
     */
    if (decision.requiresReview) {
      await prisma.knowledge_imports.updateMany({
        where: {
          id: importId,
          status: {
            not: "cancelled",
          },
        },
        data: {
          status: decision.allFilesDuplicate ? "cancelled" : "uploaded",
          processing_status: decision.allFilesDuplicate ? "cancelled" : "pending",
          error_message: null,
          updated_at: new Date(),
        },
      });

      return NextResponse.json(
        {
          importId,
          status: "requires_review",
          error:
            "Hay documentos que requieren revisión antes de continuar.",
          inventory: {
            totalFiles: prepared.totalFiles,
            totalBytes: prepared.totalBytes,
            archiveCount: prepared.archiveCount,
            skippedArchiveEntries:
              prepared.skippedArchiveEntries,
          },
          acceptedFiles:
            preflight.acceptedFiles.map((result) => ({
              id: result.file.id,
              fileName: result.file.fileName,
              relativePath: result.file.relativePath,
              fileSize: result.file.content.byteLength,
            })),
          reviewFiles,
          unreadableExistingDocumentIds:
            preflight.unreadableExistingDocumentIds,
        },
        { status: decision.allFilesDuplicate ? 200 : 409 },
      );
    }

    const queue =
      buildKnowledgeProcessingQueue(decision.queuePreflight);

    if (queue.items.length === 0) {
      throw new Error(
        "No se han encontrado documentos compatibles para analizar.",
      );
    }

    /*
     * No eliminamos la cola anterior hasta haber
     * completado el preflight. Conservamos los
     * originales con estado uploaded.
     */
    const existingDerivedFiles =
      knowledgeImport.knowledge_import_files.filter(
        (file) => file.status !== "uploaded",
      );

    const extractedFiles: Array<{
      import_id: string;
      file_name: string;
      relative_path: string;
      mime_type: string | null;
      file_size: number;
      storage_path: string;
      status: string;
      processing_order: number;
      processing_status: string;
      processing_step: string | null;
      started_at: Date | null;
      completed_at: Date | null;
      error_message: string | null;
    }> = [];

    /*
     * Los documentos aceptados se almacenan por
     * separado, incluidos los que proceden de ZIP.
     * El procesador posterior seguirá leyendo
     * storage_path de cada entrada de la cola.
     */
    for (const item of queue.items) {
      const currentImport =
        await prisma.knowledge_imports.findUnique({
          where: {
            id: importId,
          },
          select: {
            status: true,
            processing_status: true,
          },
        });

      if (
        currentImport?.status === "cancelled" ||
        currentImport?.processing_status === "cancelled"
      ) {
        return NextResponse.json(
          {
            error:
              "La importación ha sido cancelada.",
          },
          { status: 409 },
        );
      }

      const safeFileName = item.fileName
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .trim();

      const storagePath =
        await uploadKnowledgeFile(
          `knowledge/imports/${importId}/extracted/${item.processingOrder}-${safeFileName}`,
          Buffer.from(item.content),
          item.mimeType,
        );

      createdStoragePaths.push(storagePath);

      extractedFiles.push({
        import_id: importId,
        file_name: item.fileName,
        relative_path: item.relativePath,
        mime_type: item.mimeType,
        file_size: item.fileSize,
        storage_path: storagePath,
        status: "extracted",
        processing_order: item.processingOrder,
        processing_status: "pending",
        processing_step: "waiting",
        started_at: null,
        completed_at: null,
        error_message: null,
      });
    }

    const currentImport =
      await prisma.knowledge_imports.findUnique({
        where: {
          id: importId,
        },
        select: {
          status: true,
          processing_status: true,
        },
      });

    if (
      currentImport?.status === "cancelled" ||
      currentImport?.processing_status === "cancelled"
    ) {
      return NextResponse.json(
        {
          error:
            "La importación ha sido cancelada.",
        },
        { status: 409 },
      );
    }

    /*
     * Reemplazamos los registros derivados dentro
     * de una transacción. Los originales permanecen.
     */
    await prisma.$transaction(async (tx) => {
      await tx.knowledge_import_files.deleteMany({
        where: {
          import_id: importId,
          status: {
            not: "uploaded",
          },
        },
      });

      for (
        let index = 0;
        index < extractedFiles.length;
        index += 250
      ) {
        await tx.knowledge_import_files.createMany({
          data: extractedFiles.slice(
            index,
            index + 250,
          ),
        });
      }

      const updated =
        await tx.knowledge_imports.updateMany({
          where: {
            id: importId,
            status: {
              not: "cancelled",
            },
            processing_status: "analyzing",
          },
          data: {
            status: "extracted",
            processing_status: "pending",
            total_files: queue.totalFiles,
            total_size: queue.totalBytes,
            completed_files: 0,
            failed_files: 0,
            current_file_id: null,
            processing_started_at: null,
            processing_completed_at: null,
            completed_at: null,
            error_message: null,
            updated_at: new Date(),
          },
        });

      if (updated.count !== 1) {
        throw new Error(
          "La importación ha cambiado de estado durante el análisis.",
        );
      }
    });

    queuePersisted = true;

    /*
     * La eliminación del almacenamiento anterior
     * ocurre después de confirmar la nueva cola.
     */
    await Promise.allSettled(
      existingDerivedFiles
        .map((file) => file.storage_path)
        .filter(
          (storagePath): storagePath is string =>
            Boolean(storagePath) &&
            !createdStoragePaths.includes(storagePath!),
        )
        .map((storagePath) =>
          deleteKnowledgeFile(storagePath),
        ),
    );

    const persistedReadyFiles =
      await prisma.knowledge_import_files.findMany({
        where: {
          import_id: importId,
          status: "extracted",
        },
        orderBy: [
          {
            processing_order: "asc",
          },
          {
            created_at: "asc",
          },
        ],
        select: {
          id: true,
          file_name: true,
          relative_path: true,
          mime_type: true,
          file_size: true,
          processing_order: true,
          processing_status: true,
          processing_step: true,
          error_message: true,
        },
      });

    return NextResponse.json({
      importId,
      status: "extracted",
      processingStatus: "pending",
      fileCount: queue.totalFiles,
      completedFiles: 0,
      failedFiles: 0,
      totalSize: queue.totalBytes,
      duplicateCount: preflight.duplicateFiles.length,
      unsupportedCount: 0,
      allFilesDuplicate: false,
      duplicateFiles: preflight.duplicateFiles.map((result) => ({
        name: result.file.fileName,
        relativePath: result.file.relativePath,
        size: result.file.content.byteLength,
        existingFileId: result.duplicate?.status === "duplicate-in-knowledge"
          ? result.duplicate.existingKnowledgeFileId : undefined,
      })),
      files: persistedReadyFiles.map((file) => ({
        id: file.id,
        name: file.file_name,
        relativePath: file.relative_path,
        size: file.file_size,
        fileType: file.mime_type,
        status: "ready" as const,
        processingOrder: file.processing_order,
        processingStatus: file.processing_status,
        processingStep: file.processing_step,
        error: file.error_message,
      })),
    });
  } catch (error) {
    console.error(
      "Knowledge import analysis error:",
      error,
    );

    if (!queuePersisted) {
      await Promise.allSettled(
        createdStoragePaths.map((storagePath) =>
          deleteKnowledgeFile(storagePath),
        ),
      );
    }

    const errorMessage = getErrorMessage(error);

    await prisma.knowledge_imports
      .updateMany({
        where: {
          id: importId,
          status: {
            not: "cancelled",
          },
          processing_status: {
            not: "cancelled",
          },
        },
        data: {
          status: "error",
          processing_status: "error",
          current_file_id: null,
          processing_completed_at: new Date(),
          error_message: errorMessage,
          updated_at: new Date(),
        },
      })
      .catch(() => undefined);

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 },
    );
  }
}
