// app/api/knowledge/import/[importId]/extract-text/route.ts

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { processImportText } from "@/lib/knowledge/import/process-import-text";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    importId: string;
  }>;
};

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "No autorizado" },
      { status: 401 },
    );
  }

  const { importId } = await context.params;

  if (!importId) {
    return NextResponse.json(
      { error: "Importación no válida" },
      { status: 400 },
    );
  }

  const { activeWorkspace } =
    await getActiveWorkspaceContext(session.user.id);

  const knowledgeImport =
    await prisma.knowledge_imports.findFirst({
      where: {
        id: importId,
        owner_user_id: session.user.id,
        knowledge_libraries: {
          workspace_id: activeWorkspace.id,
        },
      },
      select: {
        id: true,
        status: true,
        processing_status: true,
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
          select: {
            id: true,
          },
        },
      },
    });

  if (!knowledgeImport) {
    return NextResponse.json(
      { error: "Importación no encontrada" },
      { status: 404 },
    );
  }

  if (
    knowledgeImport.status === "cancelled" ||
    knowledgeImport.processing_status === "cancelled"
  ) {
    return NextResponse.json(
      { error: "La importación ha sido cancelada" },
      { status: 409 },
    );
  }

  if (
    knowledgeImport.processing_status === "processing"
  ) {
    return NextResponse.json(
      {
        error: "La extracción de texto ya está en curso",
      },
      { status: 409 },
    );
  }

  if (
    knowledgeImport.status !== "extracted" &&
    knowledgeImport.status !== "text_error" &&
    knowledgeImport.status !== "text_ready"
  ) {
    return NextResponse.json(
      {
        error:
          "La importación todavía no está preparada para extraer texto",
      },
      { status: 409 },
    );
  }

  if (
    knowledgeImport.knowledge_import_files.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "No hay documentos extraídos para procesar",
      },
      { status: 400 },
    );
  }

  try {
    const result = await processImportText(importId);

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "No se ha podido completar la extracción de texto";

    console.error(
      "Knowledge import text extraction error:",
      error,
    );

    if (
      errorMessage ===
      "La importacion ha sido cancelada"
    ) {
      return NextResponse.json(
        {
          error: "La importación ha sido cancelada",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 },
    );
  }
}