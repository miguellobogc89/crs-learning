// lib/actions/create-shared-knowledge-folder.actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { knowledgeLibraryWriteWhere } from "@/lib/knowledge/access-control";
import { prisma } from "@/lib/prisma";
import { getWorkspaceMembers } from "@/lib/repositories/workspace.repository";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export type FolderPermissionInput = {
  userId: string;
  accessLevel: "read" | "edit";
};

type CreateSharedFolderInput = {
  name: string;
  parentLibraryId: string | null;
  recipients: FolderPermissionInput[];
};

export async function createSharedKnowledgeFolder({
  name,
  parentLibraryId,
  recipients,
}: CreateSharedFolderInput) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const ownerId = session.user.id;
  const normalizedName = name.trim();

  if (!normalizedName || normalizedName.length > 120) {
    throw new Error("Introduce un nombre válido para la carpeta");
  }

  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new Error("Selecciona al menos un destinatario");
  }

  if (
    recipients.some(
      (recipient) =>
        !recipient ||
        typeof recipient.userId !== "string" ||
        (recipient.accessLevel !== "read" &&
          recipient.accessLevel !== "edit"),
    )
  ) {
    throw new Error("Los destinatarios o sus permisos no son válidos");
  }

  const recipientIds = recipients.map(
    (recipient) => recipient.userId,
  );

  if (new Set(recipientIds).size !== recipientIds.length) {
    throw new Error("Hay destinatarios duplicados");
  }

  if (recipientIds.includes(ownerId)) {
    throw new Error(
      "No necesitas compartir la carpeta contigo mismo",
    );
  }

  const { activeWorkspace } =
    await getActiveWorkspaceContext(ownerId);

  const workspaceId = activeWorkspace.id;

  // Solo se permite compartir con miembros reales
  // del workspace activo.
  const members = await getWorkspaceMembers(workspaceId);

  const validMemberIds = new Set(
    members
      .filter((member) => member.user_id !== ownerId)
      .map((member) => member.user_id),
  );

  if (
    recipientIds.some(
      (recipientId) => !validMemberIds.has(recipientId),
    )
  ) {
    throw new Error(
      "Uno o varios destinatarios no pertenecen al espacio de trabajo activo",
    );
  }

  const parentLibrary = parentLibraryId
    ? await prisma.knowledge_libraries.findFirst({
        where: {
          id: parentLibraryId,
          ...knowledgeLibraryWriteWhere(
            ownerId,
            workspaceId,
          ),
        },
        select: { id: true },
      })
    : null;

  if (parentLibraryId && !parentLibrary) {
    throw new Error(
      "No tienes permiso para crear una carpeta en esta ubicación",
    );
  }

  // La carpeta y sus permisos se guardan juntos.
  // Si falla una operación, se revierte toda la transacción.
  const library = await prisma.$transaction(
    async (tx) => {
      const existingLibrary =
        await tx.knowledge_libraries.findFirst({
          where: {
            owner_user_id: ownerId,
            workspace_id: workspaceId,
            parent_id: parentLibraryId ?? null,
            name: {
              equals: normalizedName,
              mode: "insensitive",
            },
          },
          select: { id: true },
        });

      if (existingLibrary) {
        throw new Error(
          "Ya existe una carpeta con ese nombre en esta ubicación",
        );
      }

      const maxPosition =
        await tx.knowledge_libraries.aggregate({
          where: {
            owner_user_id: ownerId,
            workspace_id: workspaceId,
            parent_id: parentLibraryId ?? null,
          },
          _max: {
            position: true,
          },
        });

      return tx.knowledge_libraries.create({
        data: {
          owner_user_id: ownerId,
          workspace_id: workspaceId,
          parent_id: parentLibraryId ?? null,
          name: normalizedName,
          position:
            (maxPosition._max.position ?? -1) + 1,
          visibility: "restricted",
          created_by_user_id: ownerId,
          updated_by_user_id: ownerId,

          knowledge_library_permissions: {
            create: recipients.map((recipient) => ({
              user_id: recipient.userId,
              access_level: recipient.accessLevel,
            })),
          },
        },
        select: {
          id: true,
          name: true,
        },
      });
    },
  );

  revalidatePath("/knowledge");

  return library;
}