// app/api/knowledge/import/[importId]/extract-text/route.ts

import {
  after,
  NextResponse,
} from "next/server";

import { auth } from "@/auth";
import {
  processImportText,
} from "@/lib/knowledge/import/process-import-text";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    importId: string;
  }>;
};

const ALLOWED_IMPORT_STATUSES = [
  "extracted",
  "text_error",
  "text_ready",
] as const;

async function markImportAsFailed(
  importId: string,
  error: unknown,
) {
  const errorMessage =
    error instanceof Error
      ? error.message
      : "No se ha podido extraer el texto de la importación";

  const completedAt = new Date();

  await prisma.knowledge_imports
    .update({
      where: {
        id: importId,
      },
      data: {
        status: "text_error",
        processing_status: "error",
        current_file_id: null,
        processing_completed_at:
          completedAt,
        error_message: errorMessage,
        updated_at: completedAt,
      },
    })
    .catch(() => undefined);
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
      select: {
        id: true,
        status: true,
        processing_status: true,
        total_files: true,
        completed_files: true,
        failed_files: true,
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
    knowledgeImport.processing_status ===
    "processing"
  ) {
    return NextResponse.json(
      {
        importId,
        status:
          knowledgeImport.status,
        processingStatus:
          knowledgeImport.processing_status,
        message:
          "La extracción de texto ya está en curso",
      },
      {
        status: 202,
      },
    );
  }

  if (
    knowledgeImport.status ===
      "text_ready" &&
    knowledgeImport.processing_status ===
      "completed"
  ) {
    return NextResponse.json({
      importId,
      status: "text_ready",
      processingStatus:
        "completed",
      totalFiles:
        knowledgeImport.total_files,
      completedFiles:
        knowledgeImport.completed_files,
      failedFiles:
        knowledgeImport.failed_files,
      alreadyCompleted: true,
    });
  }

  if (
    !ALLOWED_IMPORT_STATUSES.includes(
      knowledgeImport.status as
        (typeof ALLOWED_IMPORT_STATUSES)[number],
    )
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

  /*
   * Intentamos reservar la importación antes de
   * programar el trabajo.
   *
   * El filtro evita que dos peticiones simultáneas
   * inicien el mismo proceso.
   */
  const claimedImport =
    await prisma.knowledge_imports.updateMany({
      where: {
        id: importId,
        owner_user_id:
          session.user.id,
        processing_status: {
          not: "processing",
        },
      },
      data: {
        status: "text_processing",
        processing_status:
          "processing",
        current_file_id: null,
        processing_started_at:
          new Date(),
        processing_completed_at:
          null,
        error_message: null,
        updated_at: new Date(),
      },
    });

  if (
    claimedImport.count === 0
  ) {
    return NextResponse.json(
      {
        importId,
        status:
          "text_processing",
        processingStatus:
          "processing",
        message:
          "La extracción de texto ya está en curso",
      },
      {
        status: 202,
      },
    );
  }

  after(async () => {
    try {
      await processImportText(
        importId,
      );
    } catch (error) {
      console.error(
        `[knowledge-import] Error procesando texto de ${importId}`,
        error,
      );

      await markImportAsFailed(
        importId,
        error,
      );
    }
  });

  return NextResponse.json(
    {
      importId,
      status:
        "text_processing",
      processingStatus:
        "processing",
      accepted: true,
      message:
        "La extracción de texto se ha iniciado en segundo plano",
    },
    {
      status: 202,
    },
  );
}