import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        error: "Importacion no valida",
      },
      {
        status: 400,
      },
    );
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

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
      },
    });

  if (!knowledgeImport) {
    return NextResponse.json(
      {
        error: "Importacion no encontrada",
      },
      {
        status: 404,
      },
    );
  }

  if (
    knowledgeImport.status !== "cancelled" ||
    knowledgeImport.processing_status !==
      "cancelled"
  ) {
    const cancelledAt = new Date();

    await prisma.$transaction([
      prisma.knowledge_imports.update({
        where: {
          id: importId,
        },
        data: {
          status: "cancelled",
          processing_status:
            "cancelled",
          current_file_id: null,
          processing_completed_at:
            cancelledAt,
          completed_at: cancelledAt,
          error_message: null,
          updated_at: cancelledAt,
        },
      }),

      prisma.knowledge_import_files.updateMany({
        where: {
          import_id: importId,
          processing_status: {
            in: [
              "pending",
              "processing",
              "analyzing",
            ],
          },
        },
        data: {
          processing_status:
            "cancelled",
          processing_step: "cancelled",
          completed_at: cancelledAt,
          updated_at: cancelledAt,
        },
      }),
    ]);
  }

  return NextResponse.json({
    importId,
    status: "cancelled",
    processingStatus: "cancelled",
  });
}
