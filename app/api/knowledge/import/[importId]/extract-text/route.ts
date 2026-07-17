// app/api/knowledge/import/[importId]/extract-text/route.ts
import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { parseOffice } from "officeparser";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf",
  ".txt",
  ".md",
  ".csv",
  ".docx",
  ".xlsx",
  ".pptx",
]);

const MAX_TEXT_LENGTH_PER_FILE = 2_000_000;

type RouteContext = {
  params: Promise<{
    importId: string;
  }>;
};

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

function cleanExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function limitExtractedText(text: string) {
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
    !SUPPORTED_EXTENSIONS.has(extension)
  ) {
    throw new Error(
      `Formato no compatible: ${extension || "sin extensión"}`,
    );
  }

  if (
    extension === ".txt" ||
    extension === ".md" ||
    extension === ".csv"
  ) {
    return extractPlainText(
      absolutePath,
    );
  }

  return extractOfficeText(
    absolutePath,
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

  const { importId } =
    await context.params;

  if (!importId) {
    return NextResponse.json(
      {
        error:
          "Importación no válida",
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
        owner_user_id:
          session.user.id,
      },
      include: {
        knowledge_import_files: {
          where: {
            status: {
              in: [
                "extracted",
                "text_error",
                "text_ready",
              ],
            },
          },
          orderBy: {
            created_at: "asc",
          },
        },
      },
    });

  if (!knowledgeImport) {
    return NextResponse.json(
      {
        error:
          "Importación no encontrada",
      },
      {
        status: 404,
      },
    );
  }

  if (
    knowledgeImport.status ===
    "text_processing"
  ) {
    return NextResponse.json(
      {
        error:
          "La extracción de texto ya está en curso",
      },
      {
        status: 409,
      },
    );
  }

  if (
    knowledgeImport.status !==
      "extracted" &&
    knowledgeImport.status !==
      "text_error" &&
    knowledgeImport.status !==
      "text_ready"
  ) {
    return NextResponse.json(
      {
        error:
          "La importación todavía no está preparada para extraer texto",
      },
      {
        status: 409,
      },
    );
  }

  const files =
    knowledgeImport
      .knowledge_import_files;

  if (files.length === 0) {
    return NextResponse.json(
      {
        error:
          "No hay documentos extraídos para procesar",
      },
      {
        status: 400,
      },
    );
  }

  await prisma.knowledge_imports.update({
    where: {
      id: importId,
    },
    data: {
      status: "text_processing",
      error_message: null,
      updated_at: new Date(),
    },
  });

  const results: Array<{
    id: string;
    name: string;
    relativePath: string;
    status: "text_ready" | "text_error";
    characters: number;
    error?: string;
  }> = [];

  let successfulFiles = 0;
  let failedFiles = 0;
  let totalCharacters = 0;

  for (const file of files) {
    try {
      if (!file.storage_path) {
        throw new Error(
          "El archivo no tiene ruta de almacenamiento",
        );
      }

      await prisma.knowledge_import_files.update({
        where: {
          id: file.id,
        },
        data: {
          status: "text_processing",
          error_message: null,
          updated_at: new Date(),
        },
      });

      const absolutePath =
        resolveStoragePath(
          file.storage_path,
        );

      const rawText =
        await extractTextFromFile(
          absolutePath,
          file.file_name,
        );

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

      await prisma.knowledge_import_files.update({
        where: {
          id: file.id,
        },
        data: {
          status: "text_ready",
          extracted_text:
            extractedText,
          error_message: null,
          updated_at: new Date(),
        },
      });

      successfulFiles += 1;
      totalCharacters +=
        extractedText.length;

      results.push({
        id: file.id,
        name: file.file_name,
        relativePath:
          file.relative_path,
        status: "text_ready",
        characters:
          extractedText.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "No se ha podido extraer el texto";

      failedFiles += 1;

      await prisma.knowledge_import_files
        .update({
          where: {
            id: file.id,
          },
          data: {
            status: "text_error",
            extracted_text: "",
            error_message:
              errorMessage,
            updated_at: new Date(),
          },
        })
        .catch(() => undefined);

      results.push({
        id: file.id,
        name: file.file_name,
        relativePath:
          file.relative_path,
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

  const importErrorMessage =
    failedFiles > 0
      ? `${failedFiles} de ${files.length} documentos no pudieron procesarse`
      : null;

  await prisma.knowledge_imports.update({
    where: {
      id: importId,
    },
    data: {
      status: finalStatus,
      error_message:
        importErrorMessage,
      updated_at: new Date(),
    },
  });

  return NextResponse.json({
    importId,
    status: finalStatus,
    totalFiles: files.length,
    successfulFiles,
    failedFiles,
    totalCharacters,
    files: results,
  });
}