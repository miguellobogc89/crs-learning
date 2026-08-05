// lib/knowledge/import/process-import-text.ts

import { readFile } from "fs/promises";
import path from "path";
import { parseOffice } from "officeparser";

import {
  isPlainTextKnowledgeDocument,
  isSupportedKnowledgeDocument,
} from "@/lib/knowledge/import-flow";
import { prisma } from "@/lib/prisma";

const MAX_TEXT_LENGTH_PER_FILE =
  2_000_000;

export type ImportTextFileResult = {
  id: string;
  name: string;
  relativePath: string;
  processingOrder: number | null;
  status:
    | "text_ready"
    | "text_error";
  characters: number;
  error?: string;
};

export type ProcessImportTextResult = {
  importId: string;
  status:
    | "text_ready"
    | "text_error";
  processingStatus:
    | "completed"
    | "error";
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  totalCharacters: number;
  files: ImportTextFileResult[];
};

function resolveStoragePath(
  storagePath: string,
) {
  const normalizedPath = storagePath
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");

  const publicRoot = path.resolve(
    process.cwd(),
    "public",
  );

  const absolutePath = path.resolve(
    publicRoot,
    normalizedPath,
  );

  if (
    absolutePath !== publicRoot &&
    !absolutePath.startsWith(
      `${publicRoot}${path.sep}`,
    )
  ) {
    throw new Error(
      "La ruta del archivo no es válida",
    );
  }

  return absolutePath;
}

function cleanExtractedText(
  text: string,
) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function limitExtractedText(
  text: string,
) {
  if (
    text.length <=
    MAX_TEXT_LENGTH_PER_FILE
  ) {
    return text;
  }

  return [
    text.slice(
      0,
      MAX_TEXT_LENGTH_PER_FILE,
    ),
    "",
    "[CONTENIDO RECORTADO POR LÍMITE DE TAMAÑO]",
  ].join("\n");
}

async function extractPlainText(
  absolutePath: string,
) {
  const buffer = await readFile(
    absolutePath,
  );

  return buffer.toString("utf8");
}

async function extractOfficeText(
  absolutePath: string,
) {
  const ast = await parseOffice(
    absolutePath,
  );

  return ast.toText();
}

async function extractTextFromFile(
  absolutePath: string,
  fileName: string,
) {
  const extension = path
    .extname(fileName)
    .toLowerCase();

  if (
    !isSupportedKnowledgeDocument(
      fileName,
    )
  ) {
    throw new Error(
      `Formato no compatible: ${
        extension ||
        "sin extensión"
      }`,
    );
  }

  if (isPlainTextKnowledgeDocument(fileName)) {
    return extractPlainText(
      absolutePath,
    );
  }

  return extractOfficeText(
    absolutePath,
  );
}

async function isImportCancelled(
  importId: string,
) {
  const knowledgeImport =
    await prisma.knowledge_imports.findUnique({
      where: {
        id: importId,
      },
      select: {
        status: true,
        processing_status: true,
      },
    });

  return (
    knowledgeImport?.status ===
      "cancelled" ||
    knowledgeImport?.processing_status ===
      "cancelled"
  );
}

export async function processImportText(
  importId: string,
): Promise<ProcessImportTextResult> {
  const knowledgeImport =
    await prisma.knowledge_imports.findUnique({
      where: {
        id: importId,
      },
      include: {
        knowledge_import_files: {
          where: {
            status: {
              in: [
                "extracted",
                "text_error",
                "text_ready",
                "text_processing",
              ],
            },
          },
          orderBy: [
            {
              processing_order:
                "asc",
            },
            {
              created_at: "asc",
            },
          ],
        },
      },
    });

  if (!knowledgeImport) {
    throw new Error(
      "Importación no encontrada",
    );
  }

  if (
    knowledgeImport.status ===
      "cancelled" ||
    knowledgeImport.processing_status ===
      "cancelled"
  ) {
    throw new Error(
      "La importacion ha sido cancelada",
    );
  }

  const allFiles =
    knowledgeImport
      .knowledge_import_files;

  if (allFiles.length === 0) {
    throw new Error(
      "No hay documentos extraídos para procesar",
    );
  }

  const filesToProcess =
    allFiles.filter(
      (file) =>
        file.processing_status !==
          "completed" ||
        file.status !==
          "text_ready",
    );

  const alreadyCompletedFiles =
    allFiles.filter(
      (file) =>
        file.processing_status ===
          "completed" &&
        file.status ===
          "text_ready",
    );

  if (
    filesToProcess.length === 0
  ) {
    return {
      importId,
      status: "text_ready",
      processingStatus:
        "completed",
      totalFiles:
        allFiles.length,
      successfulFiles:
        alreadyCompletedFiles.length,
      failedFiles: 0,
      totalCharacters:
        allFiles.reduce(
          (total, file) =>
            total +
            (file.extracted_text
              ?.length ?? 0),
          0,
        ),
      files: allFiles.map(
        (
          file,
        ): ImportTextFileResult => ({
          id: file.id,
          name: file.file_name,
          relativePath:
            file.relative_path,
          processingOrder:
            file.processing_order,
          status: "text_ready",
          characters:
            file.extracted_text
              ?.length ?? 0,
        }),
      ),
    };
  }

  const processingStartedAt =
    knowledgeImport
      .processing_started_at ??
    new Date();

  await prisma.knowledge_imports.updateMany({
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
      status: "text_processing",
      processing_status:
        "processing",
      completed_files:
        alreadyCompletedFiles.length,
      failed_files: 0,
      current_file_id: null,
      processing_started_at:
        processingStartedAt,
      processing_completed_at:
        null,
      error_message: null,
      updated_at: new Date(),
    },
  });

  const results:
    ImportTextFileResult[] = [];

  let successfulFiles =
    alreadyCompletedFiles.length;

  let failedFiles = 0;

  let totalCharacters =
    alreadyCompletedFiles.reduce(
      (total, file) =>
        total +
        (file.extracted_text
          ?.length ?? 0),
      0,
    );

  for (
    const file of filesToProcess
  ) {
    const fileStartedAt =
      new Date();

    try {
      if (
        await isImportCancelled(
          importId,
        )
      ) {
        throw new Error(
          "La importacion ha sido cancelada",
        );
      }

      await prisma.$transaction([
        prisma.knowledge_imports.update({
          where: {
            id: importId,
          },
          data: {
            current_file_id:
              file.id,
            processing_status:
              "processing",
            updated_at:
              fileStartedAt,
          },
        }),

        prisma.knowledge_import_files.update({
          where: {
            id: file.id,
          },
          data: {
            status:
              "text_processing",
            processing_status:
              "processing",
            processing_step:
              "extracting_text",
            started_at:
              file.started_at ??
              fileStartedAt,
            completed_at: null,
            error_message: null,
            updated_at:
              fileStartedAt,
          },
        }),
      ]);

      if (!file.storage_path) {
        throw new Error(
          "El archivo no tiene ruta de almacenamiento",
        );
      }

      const absolutePath =
        resolveStoragePath(
          file.storage_path,
        );

      const rawText =
        await extractTextFromFile(
          absolutePath,
          file.file_name,
        );

      if (
        await isImportCancelled(
          importId,
        )
      ) {
        throw new Error(
          "La importacion ha sido cancelada",
        );
      }

      await prisma
        .knowledge_import_files
        .update({
          where: {
            id: file.id,
          },
          data: {
            processing_step:
              "cleaning_text",
            updated_at:
              new Date(),
          },
        });

      const extractedText =
        limitExtractedText(
          cleanExtractedText(
            rawText,
          ),
        );

      if (!extractedText) {
        throw new Error(
          "No se ha podido extraer texto del documento",
        );
      }

      const completedAt =
        new Date();

      await prisma.$transaction([
        prisma.knowledge_import_files.update({
          where: {
            id: file.id,
          },
          data: {
            status:
              "text_ready",
            extracted_text:
              extractedText,
            processing_status:
              "completed",
            processing_step:
              "completed",
            completed_at:
              completedAt,
            error_message: null,
            updated_at:
              completedAt,
          },
        }),

        prisma.knowledge_imports.update({
          where: {
            id: importId,
          },
          data: {
            completed_files: {
              increment: 1,
            },
            current_file_id:
              null,
            updated_at:
              completedAt,
          },
        }),
      ]);

      successfulFiles += 1;
      totalCharacters +=
        extractedText.length;

      results.push({
        id: file.id,
        name: file.file_name,
        relativePath:
          file.relative_path,
        processingOrder:
          file.processing_order,
        status: "text_ready",
        characters:
          extractedText.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "No se ha podido extraer el texto";

      if (
        errorMessage ===
        "La importacion ha sido cancelada"
      ) {
        throw error;
      }

      const completedAt =
        new Date();

      failedFiles += 1;

      await prisma
        .$transaction([
          prisma
            .knowledge_import_files
            .update({
              where: {
                id: file.id,
              },
              data: {
                status:
                  "text_error",
                extracted_text: "",
                processing_status:
                  "error",
                processing_step:
                  "error",
                completed_at:
                  completedAt,
                error_message:
                  errorMessage,
                updated_at:
                  completedAt,
              },
            }),

          prisma
            .knowledge_imports
            .update({
              where: {
                id: importId,
              },
              data: {
                failed_files: {
                  increment: 1,
                },
                current_file_id:
                  null,
                updated_at:
                  completedAt,
              },
            }),
        ])
        .catch(() => undefined);

      results.push({
        id: file.id,
        name: file.file_name,
        relativePath:
          file.relative_path,
        processingOrder:
          file.processing_order,
        status: "text_error",
        characters: 0,
        error: errorMessage,
      });
    }
  }

  const finalStatus =
    successfulFiles > 0
      ? "text_ready"
      : "text_error";

  const finalProcessingStatus =
    successfulFiles > 0
      ? "completed"
      : "error";

  const importErrorMessage =
    failedFiles > 0
      ? `${failedFiles} de ${allFiles.length} documentos no pudieron procesarse`
      : null;

  const processingCompletedAt =
    new Date();

  await prisma.knowledge_imports.updateMany({
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
      status: finalStatus,
      processing_status:
        finalProcessingStatus,
      completed_files:
        successfulFiles,
      failed_files:
        failedFiles,
      current_file_id: null,
      processing_completed_at:
        processingCompletedAt,
      error_message:
        importErrorMessage,
      updated_at:
        processingCompletedAt,
    },
  });

  return {
    importId,
    status: finalStatus,
    processingStatus:
      finalProcessingStatus,
    totalFiles: allFiles.length,
    successfulFiles,
    failedFiles,
    totalCharacters,
    files: results,
  };
}
