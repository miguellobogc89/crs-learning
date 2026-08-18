// app/api/knowledge/[id]/analyze/route.ts
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { knowledgeSourceOwnerWhere } from "@/lib/knowledge/access-control";
import { prisma } from "@/lib/prisma";
import { analyzeKnowledgeSource } from "@/lib/services/knowledge-analysis.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  const source = await prisma.knowledge_sources.findFirst({
    where: {
      id,
      ...knowledgeSourceOwnerWhere(
        session.user.id,
        activeWorkspace.id,
      ),
    },
    select: {
      id: true,
    },
  });

  if (!source) {
    return NextResponse.json({ error: "Knowledge not found" }, { status: 404 });
  }

  try {
    await analyzeKnowledgeSource(id);

    return NextResponse.json({
      ok: true,
      status: "completed",
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
      },
      { status: 500 }
    );
  }
}
