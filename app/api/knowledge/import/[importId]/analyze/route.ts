// app/api/knowledge/import/[importId]/analyze/route.ts

import AdmZip from "adm-zip";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_EXTRACTED_FILES = 5_000;
const MAX_TOTAL_EXTRACTED_SIZE = 500 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".csv",
  ".txt",
  ".md",
  ".jpg",
  ".jpeg",
  ".png",
  ".zip",
]);

type RouteContext = {
  params: Promise<{
    importId: string;
  }>;
};

type ExtractedFileInput = {
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
};

type ExistingKnowledgeFile = {
  id: string;
  file_name: string;
  file_size: number | null;
  knowledge_sources: {
    id: string;
    title: string;
  };
};

type DuplicateImportFile = {
  name: string;
  relativePath: string;
  size: number;
  existingFileId: string;
  existingArticleId: string;
  existingArticleTitle: string;
};

function normalizeFileName(fileName: string) {
  return path
    .basename(fileName)
    .trim()
    .toLocaleLowerCase("es");
}

function getFileDuplicateKey(
  fileName: string,
  fileSize: number,
) {
  return [
    normalizeFileName(fileName),
    fileSize,
  ].join("::");
}

function normalizeRelativePath(value: string) {
  return value
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(
      (part) =>
        part &&
        part !== "." &&
        part !== "..",
    )
    .join("/");
}

function isAcceptedDocument(relativePath: string) {
  const extension = path
    .extname(relativePath)
    .toLowerCase();

  return ACCEPTED_EXTENSIONS.has(extension);
}

function getMimeType(fileName: string) {
  const extension = path
    .extname(fileName)
    .toLowerCase();

  const mimeTypes: Record<string, string> = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".zip": "application/zip",
  };

  return (
    mimeTypes[extension] ??
    "application/octet-stream"
  );
}

function resolveStoragePath(storagePath: string) {
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

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error: "No autorizado",
      },
      {
        status: 401,
      },
    );
  }

  const { importId } = await context.params;

  if (!importId) {
    return NextResponse.json(
      {
        error: "Importación no válida",
      },
      {
        status: 400,
      },
    );
  }

  const knowledgeImport =
    await prisma.knowledge_imports.findFirst({
      where: {
        id: importId,
        owner_user_id: session.user.id,
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
      {
        error: "Importación no encontrada",
      },
      {
        status: 404,
      },
    );
  }

  if (
    knowledgeImport.processing_status ===
    "processing"
  ) {
    return NextResponse.json(
      {
        error:
          "La importación ya se está procesando",
      },
      {
        status: 409,
      },
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
          "La importación no contiene archivos subidos",
      },
      {
        status: 400,
      },
    );
  }

  const existingKnowledgeFiles =
  await prisma.knowledge_files.findMany({
    where: {
      knowledge_sources: {
        library_id:
          knowledgeImport.library_id,
      },
    },
    select: {
      id: true,
      file_name: true,
      file_size: true,
      knowledge_sources: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

const existingFilesByKey = new Map<
  string,
  ExistingKnowledgeFile
>();

for (const existingFile of existingKnowledgeFiles) {
  if (existingFile.file_size === null) {
    continue;
  }

  existingFilesByKey.set(
    getFileDuplicateKey(
      existingFile.file_name,
      existingFile.file_size,
    ),
    existingFile,
  );
}

  const extractedRoot = path.join(
    process.cwd(),
    "public",
    "uploads",
    "knowledge-imports",
    importId,
    "extracted",
  );

try {
  await prisma.knowledge_imports.update({
    where: {
      id: importId,
    },
    data: {
      status: "processing",
      processing_status: "analyzing",
      completed_files: 0,
      failed_files: 0,
      current_file_id: null,
      processing_started_at: null,
      processing_completed_at: null,
      error_message: null,
      updated_at: new Date(),
    },
  });

  await rm(extractedRoot, {
    recursive: true,
    force: true,
  });

  await mkdir(extractedRoot, {
    recursive: true,
  });

  /*
   * Al repetir el análisis, eliminamos todos los
   * registros derivados. Los archivos originales
   * con estado "uploaded" se conservan.
   */
  await prisma.knowledge_import_files.deleteMany({
    where: {
      import_id: importId,
      status: {
        not: "uploaded",
      },
    },
  });

  const extractedFiles: ExtractedFileInput[] =
    [];

  const duplicateFiles: DuplicateImportFile[] =
    [];

  /*
   * También evita repetir un mismo documento dentro de
   * la propia selección o dentro de varios ZIP.
   */
  const acceptedFileKeys = new Set<string>();

  let totalExtractedSize = 0;
  let processingOrder = 0;

  for (const uploadedFile of uploadedFiles) {
    if (!uploadedFile.storage_path) {
      throw new Error(
        `El archivo ${uploadedFile.file_name} no tiene una ruta de almacenamiento`,
      );
    }

    const absoluteSourcePath =
      resolveStoragePath(
        uploadedFile.storage_path,
      );

      const isZip =
        uploadedFile.file_name
          .toLowerCase()
          .endsWith(".zip") ||
        uploadedFile.mime_type ===
          "application/zip" ||
        uploadedFile.mime_type ===
          "application/x-zip-compressed";

      /*
       * Los archivos que no son ZIP también se
       * registran como elementos independientes
       * de la cola.
       */
if (!isZip) {
  const relativePath =
    normalizeRelativePath(
      uploadedFile.relative_path ??
        uploadedFile.file_name,
    );

  if (!isAcceptedDocument(relativePath)) {
    continue;
  }

  const fileSize = Number(
    uploadedFile.file_size ?? 0,
  );

  const duplicateKey =
    getFileDuplicateKey(
      uploadedFile.file_name,
      fileSize,
    );

  const existingFile =
    existingFilesByKey.get(
      duplicateKey,
    );

  if (existingFile) {
    duplicateFiles.push({
      name: uploadedFile.file_name,
      relativePath,
      size: fileSize,
      existingFileId: existingFile.id,
      existingArticleId:
        existingFile.knowledge_sources.id,
      existingArticleTitle:
        existingFile.knowledge_sources.title,
    });

    continue;
  }

  /*
   * Evita duplicados dentro de esta misma carga.
   */
  if (acceptedFileKeys.has(duplicateKey)) {
    continue;
  }

  acceptedFileKeys.add(duplicateKey);

  totalExtractedSize += fileSize;

  if (
    totalExtractedSize >
    MAX_TOTAL_EXTRACTED_SIZE
  ) {
    throw new Error(
      "El contenido total supera el límite permitido de 500 MB",
    );
  }

  processingOrder += 1;

  extractedFiles.push({
    import_id: importId,
    file_name: uploadedFile.file_name,
    relative_path: relativePath,
    mime_type:
      uploadedFile.mime_type ||
      getMimeType(
        uploadedFile.file_name,
      ),
    file_size: fileSize,
    storage_path:
      uploadedFile.storage_path,
    status: "extracted",
    processing_order: processingOrder,
    processing_status: "pending",
    processing_step: "waiting",
    started_at: null,
    completed_at: null,
    error_message: null,
  });

  continue;
}

      const zip = new AdmZip(
        absoluteSourcePath,
      );

      const entries = zip.getEntries();

      for (const entry of entries) {
        if (entry.isDirectory) {
          continue;
        }

        const relativePath =
          normalizeRelativePath(
            entry.entryName,
          );

        if (!relativePath) {
          continue;
        }

        if (
          !isAcceptedDocument(relativePath)
        ) {
          continue;
        }

        if (
          extractedFiles.length >=
          MAX_EXTRACTED_FILES
        ) {
          throw new Error(
            `El ZIP supera el límite de ${MAX_EXTRACTED_FILES} documentos`,
          );
        }

        const declaredSize = Number(
          entry.header.size ?? 0,
        );

        if (
          totalExtractedSize +
            declaredSize >
          MAX_TOTAL_EXTRACTED_SIZE
        ) {
          throw new Error(
            "El contenido descomprimido supera el límite permitido de 500 MB",
          );
        }

        const destinationPath = path.join(
          extractedRoot,
          relativePath,
        );

        /*
         * Protección frente a ZIP Slip.
         */
        const resolvedDestination =
          path.resolve(destinationPath);

        const resolvedRoot =
          path.resolve(extractedRoot);

        if (
          !resolvedDestination.startsWith(
            `${resolvedRoot}${path.sep}`,
          )
        ) {
          throw new Error(
            `Ruta no válida dentro del ZIP: ${entry.entryName}`,
          );
        }

const buffer = entry.getData();

const extractedFileName =
  path.basename(relativePath);

const duplicateKey =
  getFileDuplicateKey(
    extractedFileName,
    buffer.length,
  );

const existingFile =
  existingFilesByKey.get(
    duplicateKey,
  );

if (existingFile) {
  duplicateFiles.push({
    name: extractedFileName,
    relativePath,
    size: buffer.length,
    existingFileId: existingFile.id,
    existingArticleId:
      existingFile.knowledge_sources.id,
    existingArticleTitle:
      existingFile.knowledge_sources.title,
  });

  continue;
}

if (acceptedFileKeys.has(duplicateKey)) {
  continue;
}

acceptedFileKeys.add(duplicateKey);

if (
  totalExtractedSize +
    buffer.length >
  MAX_TOTAL_EXTRACTED_SIZE
) {
          throw new Error(
            "El contenido descomprimido supera el límite permitido de 500 MB",
          );
        }

        await mkdir(
          path.dirname(destinationPath),
          {
            recursive: true,
          },
        );

        await writeFile(
          destinationPath,
          buffer,
        );

        totalExtractedSize += buffer.length;
        processingOrder += 1;

        const publicStoragePath = [
          "",
          "uploads",
          "knowledge-imports",
          importId,
          "extracted",
          relativePath,
        ].join("/");

        extractedFiles.push({
          import_id: importId,
          file_name: extractedFileName,
          relative_path: relativePath,
          mime_type:
            getMimeType(relativePath),
          file_size: buffer.length,
          storage_path:
            publicStoragePath,
          status: "extracted",
          processing_order: processingOrder,
          processing_status: "pending",
          processing_step: "waiting",
          started_at: null,
          completed_at: null,
          error_message: null,
        });
      }
    }

if (
  extractedFiles.length === 0 &&
  duplicateFiles.length === 0
) {
  throw new Error(
    "No se han encontrado documentos compatibles para analizar",
  );
}

    const batchSize = 250;

    for (
      let index = 0;
      index < extractedFiles.length;
      index += batchSize
    ) {
      await prisma.knowledge_import_files.createMany({
        data: extractedFiles.slice(
          index,
          index + batchSize,
        ),
      });
    }

const allFilesDuplicate =
  extractedFiles.length === 0 &&
  duplicateFiles.length > 0;

await prisma.knowledge_imports.update({
  where: {
    id: importId,
  },
  data: {
    status: allFilesDuplicate
      ? "completed"
      : "extracted",

    processing_status:
      allFilesDuplicate
        ? "completed"
        : "pending",

    total_files:
      extractedFiles.length,

    total_size:
      totalExtractedSize,

    completed_files:
      allFilesDuplicate ? 0 : 0,

    failed_files: 0,
    current_file_id: null,

    processing_started_at:
      allFilesDuplicate
        ? new Date()
        : null,

    processing_completed_at:
      allFilesDuplicate
        ? new Date()
        : null,

    completed_at:
      allFilesDuplicate
        ? new Date()
        : null,

    error_message: null,
    updated_at: new Date(),
  },
});

return NextResponse.json({
  importId,

  status: allFilesDuplicate
    ? "completed"
    : "extracted",

  processingStatus:
    allFilesDuplicate
      ? "completed"
      : "pending",

  fileCount: extractedFiles.length,
  completedFiles: 0,
  failedFiles: 0,
  totalSize: totalExtractedSize,

  duplicateCount:
    duplicateFiles.length,

  allFilesDuplicate,

  duplicateFiles,

  files: extractedFiles.map(
    (file) => ({
      name: file.file_name,
      relativePath:
        file.relative_path,
      size: file.file_size,
      mimeType: file.mime_type,
      processingOrder:
        file.processing_order,
      processingStatus:
        file.processing_status,
    }),
  ),
});


  } catch (error) {
    console.error(
      "Error extracting knowledge import:",
      error,
    );

    const errorMessage =
      error instanceof Error
        ? error.message
        : "No se ha podido extraer la documentación";

    await prisma.knowledge_imports
      .update({
        where: {
          id: importId,
        },
        data: {
          status: "error",
          processing_status: "error",
          current_file_id: null,
          processing_completed_at:
            new Date(),
          error_message: errorMessage,
          updated_at: new Date(),
        },
      })
      .catch(() => undefined);

    await rm(extractedRoot, {
      recursive: true,
      force: true,
    }).catch(() => undefined);

    return NextResponse.json(
      {
        error: errorMessage,
      },
      {
        status: 500,
      },
    );
  }
}