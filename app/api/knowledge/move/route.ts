// app/api/knowledge/move/route.ts
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type MoveKnowledgeBody = {
  knowledgeId?: string;
  libraryId?: string;
};

export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "No autenticado" },
      { status: 401 },
    );
  }

  let body: MoveKnowledgeBody;

  try {
    body = (await request.json()) as MoveKnowledgeBody;
  } catch {
    return NextResponse.json(
      { error: "Petición no válida" },
      { status: 400 },
    );
  }

  const knowledgeId = body.knowledgeId?.trim();
  const libraryId = body.libraryId?.trim();

  if (!knowledgeId || !libraryId) {
    return NextResponse.json(
      { error: "Faltan datos para mover el artículo" },
      { status: 400 },
    );
  }

  const [knowledge, targetLibrary] = await Promise.all([
    prisma.knowledge_sources.findFirst({
      where: {
        id: knowledgeId,
        owner_user_id: session.user.id,
      },
      select: {
        id: true,
        library_id: true,
      },
    }),
    prisma.knowledge_libraries.findFirst({
      where: {
        id: libraryId,
        owner_user_id: session.user.id,
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!knowledge) {
    return NextResponse.json(
      { error: "Artículo no encontrado" },
      { status: 404 },
    );
  }

  if (!targetLibrary) {
    return NextResponse.json(
      { error: "Carpeta de destino no encontrada" },
      { status: 404 },
    );
  }

  if (knowledge.library_id === libraryId) {
    return NextResponse.json({
      success: true,
    });
  }

  await prisma.knowledge_sources.update({
    where: {
      id: knowledgeId,
    },
    data: {
      library_id: libraryId,
      updated_at: new Date(),
      updated_by_user_id: session.user.id,
    },
  });

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${knowledgeId}`);

  return NextResponse.json({
    success: true,
  });
}