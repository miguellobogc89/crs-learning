// app/api/knowledge/import/[importId]/confirm/route.ts

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { confirmKnowledgeImport } from "@/lib/knowledge/import/confirm-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    importId: string;
  }>;
};

function getErrorStatus(
  errorMessage: string,
) {
  if (
    errorMessage ===
    "Importación no encontrada"
  ) {
    return 404;
  }

  if (
    errorMessage.includes(
      "ya se está creando",
    ) ||
    errorMessage.includes(
      "todavía no está preparada",
    )
  ) {
    return 409;
  }

  if (
    errorMessage.includes(
      "propuesta",
    ) ||
    errorMessage.includes(
      "documento",
    ) ||
    errorMessage.includes(
      "carpeta",
    ) ||
    errorMessage.includes(
      "artículo",
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
      await confirmKnowledgeImport({
        importId,
        userId: session.user.id,
      });

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "Error confirming knowledge import:",
      error,
    );

    const errorMessage =
      error instanceof Error
        ? error.message
        : "No se ha podido confirmar la importación";

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