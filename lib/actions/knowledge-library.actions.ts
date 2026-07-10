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
      updated_at: new Date(),
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

export async function moveKnowledgeLibrary(
  libraryId: string,
  parentId: string,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  if (libraryId === parentId) {
    throw new Error("Una carpeta no puede contenerse a sí misma");
  }

  const [library, targetParent] = await Promise.all([
    prisma.knowledge_libraries.findFirst({
      where: {
        id: libraryId,
        owner_user_id: session.user.id,
      },
      select: {
        id: true,
        parent_id: true,
      },
    }),
    prisma.knowledge_libraries.findFirst({
      where: {
        id: parentId,
        owner_user_id: session.user.id,
      },
      select: {
        id: true,
        parent_id: true,
      },
    }),
  ]);

  if (!library || !targetParent) {
    throw new Error("Biblioteca no encontrada");
  }

  let currentParentId: string | null = targetParent.id;

  while (currentParentId) {
    if (currentParentId === library.id) {
      throw new Error(
        "No puedes mover una carpeta dentro de una de sus subcarpetas",
      );
    }

const currentParent: { parent_id: string | null } | null =
  await prisma.knowledge_libraries.findFirst({
    where: {
      id: currentParentId,
      owner_user_id: session.user.id,
    },
    select: {
      parent_id: true,
    },
  });

currentParentId = currentParent?.parent_id ?? null;
  }

  const maxPosition = await prisma.knowledge_libraries.aggregate({
    where: {
      owner_user_id: session.user.id,
      parent_id: parentId,
      id: {
        not: libraryId,
      },
    },
    _max: {
      position: true,
    },
  });

  await prisma.knowledge_libraries.update({
    where: {
      id: libraryId,
    },
    data: {
      parent_id: parentId,
      position: (maxPosition._max.position ?? -1) + 1,
      updated_at: new Date(),
    },
  });

  revalidatePath("/knowledge");
}