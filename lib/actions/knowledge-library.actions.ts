// lib/actions/knowledge-library.actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { deleteKnowledgeSelection } from "@/lib/knowledge/delete-knowledge.service";
import { auth } from "@/auth";
import {
  knowledgeLibraryReadWhere,
  knowledgeLibraryWriteWhere,
} from "@/lib/knowledge/access-control";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export async function createKnowledgeLibrary(parentId?: string | null) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  if (parentId) {
    const parentLibrary = await prisma.knowledge_libraries.findFirst({
      where: {
        id: parentId,
        ...knowledgeLibraryWriteWhere(
          session.user.id,
          activeWorkspace.id,
        ),
      },
      select: {
        id: true,
      },
    });

    if (!parentLibrary) {
      throw new Error("La carpeta de destino no existe");
    }
  }

  const maxPosition = await prisma.knowledge_libraries.aggregate({
    where: {
      owner_user_id: session.user.id,
      workspace_id: activeWorkspace.id,
      parent_id: parentId ?? null,
    },
    _max: {
      position: true,
    },
  });

  const library = await prisma.knowledge_libraries.create({
    data: {
      owner_user_id: session.user.id,
      workspace_id: activeWorkspace.id,
      parent_id: parentId ?? null,
      name: "Nueva biblioteca",
      position: (maxPosition._max.position ?? -1) + 1,
    },
  });

  revalidatePath("/knowledge");

  return library;
}

export async function createNamedKnowledgeLibrary(
  name: string,
  parentId?: string | null,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("El nombre de la carpeta es obligatorio");
  }

  const parentLibrary = parentId
    ? await prisma.knowledge_libraries.findFirst({
        where: {
          id: parentId,
          ...knowledgeLibraryWriteWhere(
            session.user.id,
            activeWorkspace.id,
          ),
        },
        select: {
          id: true,
        },
      })
    : null;

  if (parentId && !parentLibrary) {
    throw new Error("La carpeta de destino no existe");
  }

  const existingLibrary = await prisma.knowledge_libraries.findFirst({
    where: {
      owner_user_id: session.user.id,
      workspace_id: activeWorkspace.id,
      parent_id: parentId ?? null,
      name: {
        equals: normalizedName,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
    },
  });

  if (existingLibrary) {
    throw new Error(
      "Ya existe una carpeta con ese nombre en esta ubicación",
    );
  }

  const maxPosition = await prisma.knowledge_libraries.aggregate({
    where: {
      owner_user_id: session.user.id,
      workspace_id: activeWorkspace.id,
      parent_id: parentId ?? null,
    },
    _max: {
      position: true,
    },
  });

  const library = await prisma.knowledge_libraries.create({
    data: {
      owner_user_id: session.user.id,
      workspace_id: activeWorkspace.id,
      parent_id: parentId ?? null,
      name: normalizedName,
      position: (maxPosition._max.position ?? -1) + 1,
      visibility: "restricted",
      created_by_user_id: session.user.id,
      updated_by_user_id: session.user.id,
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

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("El nombre de la carpeta es obligatorio");
  }

  await prisma.knowledge_libraries.updateMany({
    where: {
      id,
      ...knowledgeLibraryWriteWhere(
        session.user.id,
        activeWorkspace.id,
      ),
    },
    data: {
      name: normalizedName,
      updated_at: new Date(),
      updated_by_user_id: session.user.id,
    },
  });

  revalidatePath("/knowledge");
}

export async function deleteKnowledgeLibrary(id: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  await deleteKnowledgeSelection({ userId: session.user.id, workspaceId: activeWorkspace.id,
    sourceIds: [], folderIds: [id] });

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

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  if (libraryId === parentId) {
    throw new Error("Una carpeta no puede contenerse a sí misma");
  }

  const [library, targetParent] = await Promise.all([
    prisma.knowledge_libraries.findFirst({
      where: {
        id: libraryId,
        ...knowledgeLibraryWriteWhere(
          session.user.id,
          activeWorkspace.id,
        ),
      },
      select: {
        id: true,
        parent_id: true,
      },
    }),
    prisma.knowledge_libraries.findFirst({
      where: {
        id: parentId,
        ...knowledgeLibraryWriteWhere(
          session.user.id,
          activeWorkspace.id,
        ),
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
          ...knowledgeLibraryReadWhere(
            session.user.id,
            activeWorkspace.id,
          ),
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
      workspace_id: activeWorkspace.id,
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
      updated_by_user_id: session.user.id,
    },
  });

  revalidatePath("/knowledge");
}
