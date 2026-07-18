// app/api/knowledge/import/[importId]/generate-proposal/route.ts
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { generateKnowledgeImportProposal } from "@/lib/knowledge/import/generate-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    importId: string;
  }>;
};

function getErrorStatus(errorMessage: string) {
  if (
    errorMessage ===
      "Importación no encontrada"
  ) {
    return 404;
  }

  if (
    errorMessage.includes(
      "ya se está generando",
    ) ||
    errorMessage.includes(
      "todavía no está preparada",
    )
  ) {
    return 409;
  }

  if (
    errorMessage.includes(
      "No hay documentos",
    )
  ) {
    return 400;
  }

  return 500;
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

  try {
    const result =
      await generateKnowledgeImportProposal({
        importId,
        userId: session.user.id,
      });

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "Error generating knowledge import proposal:",
      error,
    );

    const errorMessage =
      error instanceof Error
        ? error.message
        : "No se ha podido generar la propuesta";

    return NextResponse.json(
      {
        error: errorMessage,
      },
      {
        status:
          getErrorStatus(errorMessage),
      },
    );
  }
}