// app/api/knowledge/import/[importId]/analyze/route.ts
import AdmZip from "adm-zip";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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

  return path.join(
    process.cwd(),
    "public",
    normalizedPath,
  );
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
        knowledge_import_files: true,
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
    knowledgeImport.status === "processing"
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



  const extractedRoot = path.join(
    process.cwd(),
    "public",
    "uploads",
    "knowledge-imports",
    importId,
    "extracted",
  );

  try {
    await rm(extractedRoot, {
      recursive: true,
      force: true,
    });

    await mkdir(extractedRoot, {
      recursive: true,
    });

    /*
     * Permite repetir el análisis sin duplicar
     * los documentos extraídos anteriormente.
     */
    await prisma.knowledge_import_files.deleteMany({
      where: {
        import_id: importId,
        status: "extracted",
      },
    });

    const extractedFiles: Array<{
      import_id: string;
      file_name: string;
      relative_path: string;
      mime_type: string;
      file_size: number;
      storage_path: string;
      status: string;
    }> = [];

    let totalExtractedSize = 0;

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
       * Si no es ZIP, lo dejamos registrado como
       * documento listo para la siguiente fase.
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

        extractedFiles.push({
          import_id: importId,
          file_name: uploadedFile.file_name,
          relative_path: relativePath,
          mime_type:
            uploadedFile.mime_type ??
            getMimeType(
              uploadedFile.file_name,
            ),
          file_size: Number(
            uploadedFile.file_size ?? 0,
          ),
          storage_path:
            uploadedFile.storage_path,
          status: "extracted",
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

        const declaredSize =
          Number(
            entry.header.size ?? 0,
          );

        totalExtractedSize += declaredSize;

        if (
          totalExtractedSize >
          MAX_TOTAL_EXTRACTED_SIZE
        ) {
          throw new Error(
            "El contenido descomprimido supera el límite permitido de 500 MB",
          );
        }

        const destinationPath =
          path.join(
            extractedRoot,
            relativePath,
          );

        /*
         * Protección adicional frente a ZIP Slip.
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

        totalExtractedSize +=
          buffer.length - declaredSize;

        if (
          totalExtractedSize >
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
          file_name:
            path.basename(relativePath),
          relative_path: relativePath,
          mime_type:
            getMimeType(relativePath),
          file_size: buffer.length,
          storage_path:
            publicStoragePath,
          status: "extracted",
        });
      }
    }

    if (extractedFiles.length === 0) {
      throw new Error(
        "No se han encontrado documentos compatibles para analizar",
      );
    }

    /*
     * createMany puede necesitar dividirse si
     * el ZIP contiene miles de documentos.
     */
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

    await prisma.knowledge_imports.update({
      where: {
        id: importId,
      },
      data: {
        status: "extracted",
        total_files:
          extractedFiles.length,
        total_size:
          totalExtractedSize,
        error_message: null,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      importId,
      status: "extracted",
      fileCount: extractedFiles.length,
      totalSize: totalExtractedSize,
      files: extractedFiles.map(
        (file) => ({
          name: file.file_name,
          relativePath:
            file.relative_path,
          size: file.file_size,
          mimeType: file.mime_type,
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