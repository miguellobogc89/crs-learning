// app/actions/knowledge/article.actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  knowledgeLibraryWriteWhere,
  knowledgeSourceOwnerWhere,
} from "@/lib/knowledge/access-control";
import { prisma } from "@/lib/prisma";
import { analyzeKnowledgeSource } from "@/lib/services/knowledge-analysis.service";
import {
  editKnowledgeSource,
} from "@/lib/services/knowledge.service";
import { recordResourceAccess } from "@/lib/services/resource-access.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export async function updateKnowledgeAction(
  formData: FormData,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  const id = String(
    formData.get("id") ?? "",
  ).trim();

  const title = String(
    formData.get("title") ?? "",
  ).trim();

  const description = String(
    formData.get("description") ?? "",
  ).trim();

  const visibility = String(
    formData.get("visibility") ?? "private",
  ).trim();

  const knowledgeType = String(
    formData.get("knowledgeType") ?? "unknown",
  ).trim();

  const content = String(
    formData.get("content") ?? "",
  );

  if (!id || !title) {
    return;
  }

  const updateResult = await editKnowledgeSource({
    id,
    ownerUserId: session.user.id,
    workspaceId: activeWorkspace.id,
    updatedByUserId: session.user.id,
    title,
    description,
    visibility,
    knowledgeType,
    content,
  });

  if (updateResult.count > 0) {
    await recordResourceAccess({
      userId: session.user.id,
      workspaceId: activeWorkspace.id,
      resourceType: "knowledge_source",
      resourceId: id,
      interactionType: "edited",
    });
  }

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${id}`);
}

export async function rebuildKnowledgeAction(
  knowledgeId: string,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  const knowledge =
    await prisma.knowledge_sources.findFirst({
      where: {
        id: knowledgeId,
        ...knowledgeSourceOwnerWhere(
          session.user.id,
          activeWorkspace.id,
        ),
      },
      select: {
        id: true,
      },
    });

  if (!knowledge) {
    throw new Error("Articulo no encontrado");
  }

  await analyzeKnowledgeSource(knowledgeId);

  revalidatePath("/knowledge");
  revalidatePath(
    `/knowledge/${knowledgeId}`,
  );
}

export async function deleteKnowledgeAction(
  id: string,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  const knowledge =
    await prisma.knowledge_sources.findFirst({
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

  if (!knowledge) {
    throw new Error("Articulo no encontrado");
  }

  await prisma.knowledge_sources.delete({
    where: {
      id,
    },
  });

  revalidatePath("/knowledge");
}

export async function createKnowledgeAction(
  formData: FormData,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  const title = String(
    formData.get("title") ?? "",
  ).trim();

  const description = String(
    formData.get("description") ?? "",
  ).trim();

  const visibility = String(
    formData.get("visibility") ?? "private",
  ).trim();

  const libraryId = String(
    formData.get("libraryId") ?? "",
  ).trim();

  if (!title) {
    throw new Error("El titulo es obligatorio");
  }

  if (!libraryId) {
    throw new Error(
      "No se ha indicado la carpeta de destino",
    );
  }

  const library =
    await prisma.knowledge_libraries.findFirst({
      where: {
        id: libraryId,
        ...knowledgeLibraryWriteWhere(
          session.user.id,
          activeWorkspace.id,
        ),
      },
      select: {
        id: true,
      },
    });

  if (!library) {
    throw new Error(
      "La carpeta de destino no existe",
    );
  }

  const knowledge =
    await prisma.knowledge_sources.create({
      data: {
        owner_user_id: session.user.id,
        created_by_user_id: session.user.id,
        updated_by_user_id: session.user.id,
        library_id: library.id,
        title,
        description,
        visibility,
        knowledge_type: "unknown",
        content: "",
        status: "draft",
      },
      select: {
        id: true,
      },
    });

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${knowledge.id}`);

  redirect(`/knowledge/${knowledge.id}`);
}
