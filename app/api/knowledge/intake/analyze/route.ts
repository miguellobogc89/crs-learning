// app/api/knowledge/intake/analyze/route.ts

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { analyzeNewKnowledgeDocuments } from "@/lib/knowledge/intake/analyze-new-documents";
import type { KnowledgeIntakeDocumentInput } from "@/lib/knowledge/intake/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type AnalyzeRequestBody = {
  libraryId?: unknown;
  documents?: unknown;
};

function isKnowledgeDocument(
  value: unknown,
): value is KnowledgeIntakeDocumentInput {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const document =
    value as Partial<KnowledgeIntakeDocumentInput>;

  return (
    typeof document.id === "string" &&
    document.id.trim().length > 0 &&
    typeof document.name === "string" &&
    document.name.trim().length > 0 &&
    typeof document.size === "number" &&
    typeof document.text === "string" &&
    (typeof document.mimeType ===
      "string" ||
      document.mimeType === null)
  );
}

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
    const body =
      (await request.json()) as AnalyzeRequestBody;

    const libraryId =
      typeof body.libraryId === "string"
        ? body.libraryId.trim()
        : "";

    const documents =
      Array.isArray(body.documents) &&
      body.documents.every(
        isKnowledgeDocument,
      )
        ? body.documents
        : [];

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

    if (documents.length === 0) {
      return NextResponse.json(
        {
          error:
            "No se han recibido documentos para analizar",
        },
        {
          status: 400,
        },
      );
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