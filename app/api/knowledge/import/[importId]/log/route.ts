// app/api/knowledge/import/[importId]/log/route.ts

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    importId: string;
  }>;
};

export async function GET(
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
        execution_log_json: true,
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
    knowledgeImport.status !==
      "completed" ||
    !knowledgeImport.execution_log_json
  ) {
    return NextResponse.json(
      {
        error:
          "La importación todavía no contiene un log de ejecución",
      },
      {
        status: 409,
      },
    );
  }

  const fileName =
    `knowledge-import-${importId}-log.json`;

  return new Response(
    JSON.stringify(
      knowledgeImport.execution_log_json,
      null,
      2,
    ),
    {
      status: 200,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Content-Disposition":
          `attachment; filename="${fileName}"`,
        "Cache-Control":
          "no-store",
      },
    },
  );
}