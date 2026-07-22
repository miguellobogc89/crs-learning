// app/api/knowledge/intake/prepare/route.ts

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { expandKnowledgeFiles } from "@/lib/knowledge/expand-knowledge-files";
import { extractFileText } from "@/lib/knowledge/extract-file-text";
import { isAcceptedKnowledgeFileType } from "@/lib/knowledge/file-types";

import type {
  KnowledgeIntakeDocumentInput,
} from "@/lib/knowledge/intake/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error: "No autenticado",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const formData =
      await request.formData();

    const documentId = String(
      formData.get("documentId") ?? "",
    ).trim();

    const file = formData.get("file");

    if (!documentId) {
      return NextResponse.json(
        {
          error:
            "No se ha indicado el identificador del documento",
        },
        {
          status: 400,
        },
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error:
            "No se ha recibido ningún archivo",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !isAcceptedKnowledgeFileType(file)
    ) {
      return NextResponse.json(
        {
          error:
            "El archivo tiene un formato no admitido",
        },
        {
          status: 400,
        },
      );
    }

    const expandedFiles =
      await expandKnowledgeFiles([file]);

    if (expandedFiles.length === 0) {
      return NextResponse.json(
        {
          error:
            "El archivo no contiene documentos compatibles",
        },
        {
          status: 400,
        },
      );
    }

    const documents: KnowledgeIntakeDocumentInput[] =
      [];

    for (
      const [
        index,
        expanded,
      ] of expandedFiles.entries()
    ) {
      const text =
        await extractFileText(
          expanded.file,
        );

      if (!text.trim()) {
        continue;
      }

      const isArchiveEntry =
        Boolean(
          expanded.sourceArchiveName,
        );

      const preparedDocumentId =
        isArchiveEntry
          ? `${documentId}::${index}`
          : documentId;

      documents.push({
        id: preparedDocumentId,
        name:
          expanded.relativePath ??
          expanded.file.name,
        mimeType:
          expanded.file.type || null,
        size: expanded.file.size,
        text,
        sourceArchiveName:
          expanded.sourceArchiveName,
        relativePath:
          expanded.relativePath,
      });
    }

    if (documents.length === 0) {
      return NextResponse.json(
        {
          error:
            "No se ha podido extraer contenido útil del archivo",
        },
        {
          status: 400,
        },
      );
    }

    return NextResponse.json({
      documents,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se ha podido preparar el archivo";

    console.error(
      "KNOWLEDGE INTAKE PREPARE ERROR",
      error,
    );

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}