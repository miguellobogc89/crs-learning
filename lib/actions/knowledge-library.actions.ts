// lib/actions/knowledge-library.actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function createKnowledgeLibrary(parentId?: string | null) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const maxPosition = await prisma.knowledge_libraries.aggregate({
    where: {
      owner_user_id: session.user.id,
      parent_id: parentId ?? null,
    },
    _max: {
      position: true,
    },
  });

  const library = await prisma.knowledge_libraries.create({
    data: {
      owner_user_id: session.user.id,
      parent_id: parentId ?? null,
      name: "Nueva biblioteca",
      position: (maxPosition._max.position ?? -1) + 1,
    },
  });

  revalidatePath("/knowledge");

  return library;
}

export async function renameKnowledgeLibrary(
  id: string,
  name: string,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  await prisma.knowledge_libraries.updateMany({
    where: {
      id,
      owner_user_id: session.user.id,
    },
    data: {
      name,
    },
  });

  revalidatePath("/knowledge");
}

export async function deleteKnowledgeLibrary(id: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  await prisma.knowledge_libraries.deleteMany({
    where: {
      id,
      owner_user_id: session.user.id,
    },
  });

  revalidatePath("/knowledge");
}