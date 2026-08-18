// app/actions/knowledge/document.actions.ts
"use server";

import { unlink } from "node:fs/promises";
import path from "node:path";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { knowledgeSourceOwnerWhere } from "@/lib/knowledge/access-control";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export async function deleteKnowledgeFileAction(
  knowledgeFileId: string,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  const file = await prisma.knowledge_files.findFirst({
    where: {
      id: knowledgeFileId,
      knowledge_sources: knowledgeSourceOwnerWhere(
        session.user.id,
        activeWorkspace.id,
      ),
    },
    select: {
      id: true,
      storage_path: true,
      knowledge_source_id: true,
    },
  });

  if (!file) {
    throw new Error("Documento no encontrado");
  }

  if (file.storage_path) {
    const relativeStoragePath =
      file.storage_path.startsWith("/")
        ? file.storage_path.slice(1)
        : file.storage_path;

    const absoluteStoragePath = path.join(
      process.cwd(),
      "public",
      relativeStoragePath,
    );

    try {
      await unlink(absoluteStoragePath);
    } catch (error) {
      const errorCode =
        error instanceof Error && "code" in error
          ? String(error.code)
          : "";

      if (errorCode !== "ENOENT") {
        throw error;
      }
    }
  }

  await prisma.knowledge_files.delete({
    where: {
      id: file.id,
    },
  });

  await markKnowledgeAsStale(
    file.knowledge_source_id,
  );

  revalidatePath("/knowledge");
  revalidatePath(
    `/knowledge/${file.knowledge_source_id}`,
  );
}

async function markKnowledgeAsStale(
  knowledgeId: string,
) {
  await prisma.$transaction([
    prisma.knowledge_sources.update({
      where: {
        id: knowledgeId,
      },
      data: {
        status: "stale",
        updated_at: new Date(),
      },
    }),

    prisma.knowledge_analysis.updateMany({
      where: {
        knowledge_source_id: knowledgeId,
      },
      data: {
        status: "stale",
        updated_at: new Date(),
      },
    }),
  ]);
}
