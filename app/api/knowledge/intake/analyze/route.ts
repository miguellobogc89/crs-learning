// app/api/knowledge/intake/analyze/route.ts

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { extractFileText } from "@/lib/knowledge/extract-file-text";
import { isAcceptedKnowledgeFileType } from "@/lib/knowledge/file-types";
import { analyzeNewKnowledgeDocuments } from "@/lib/knowledge/intake/analyze-new-documents";
import type { KnowledgeIntakeDocumentInput } from "@/lib/knowledge/intake/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function parseDocumentIds(
  value: FormDataEntryValue | null,
) {
  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (item): item is string =>
          typeof item === "string" &&
          item.trim().length > 0,
      )
    ) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
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
    const formData = await request.formData();

    const libraryId = String(
      formData.get("libraryId") ?? "",
    ).trim();

    const files = formData
      .getAll("files")
      .filter(
        (value): value is File =>
          value instanceof File,
      );

    const documentIds = parseDocumentIds(
      formData.get("documentIds"),
    );

    if (!libraryId) {
      return NextResponse.json(
        {
          error:
            "No se ha indicado la biblioteca de destino",
        },
        {
          status: 400,
        },
      );
    }

    if (files.length === 0) {
      return NextResponse.json(
        {
          error:
            "Debes seleccionar al menos un documento",
        },
        {
          status: 400,
        },
      );
    }

    if (files.length !== documentIds.length) {
      return NextResponse.json(
        {
          error:
            "No se ha podido relacionar cada archivo con su identificador",
        },
        {
          status: 400,
        },
      );
    }

    const acceptedFiles = files.filter((file) =>
      isAcceptedKnowledgeFileType(file),
    );

    if (acceptedFiles.length !== files.length) {
      return NextResponse.json(
        {
          error:
            "Uno o varios documentos tienen un formato no admitido",
        },
        {
          status: 400,
        },
      );
    }

    const documents: KnowledgeIntakeDocumentInput[] =
      [];

    for (
      let index = 0;
      index < files.length;
      index += 1
    ) {
      const file = files[index];
      const documentId = documentIds[index];

      const extractedText =
        await extractFileText(file);

      documents.push({
        id: documentId,
        name: file.name,
        mimeType: file.type || null,
        size: file.size,
        text: extractedText,
      });
    }

    const result =
      await analyzeNewKnowledgeDocuments({
        userId: session.user.id,
        libraryId,
        documents,
      });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se han podido analizar los documentos";

    console.error(
      "KNOWLEDGE INTAKE ANALYZE ERROR",
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