
// app/actions/knowledge/editable-content.actions.ts

"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { knowledgeSourceOwnerWhere } from
  "@/lib/knowledge/access-control";
import { prisma } from "@/lib/prisma";
import { recordResourceAccess } from
  "@/lib/services/resource-access.service";
import { getActiveWorkspaceContext } from
  "@/lib/services/workspace.service";

export type EditableKnowledgeSection =
  | "general.summary";

type SaveEditableKnowledgeContentInput = {
  knowledgeId: string;
  section: EditableKnowledgeSection;
  html: string;
};

function isJsonObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function saveEditableKnowledgeContentAction({
  knowledgeId,
  section,
  html,
}: SaveEditableKnowledgeContentInput): Promise<void> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const id = knowledgeId.trim();

  if (!id) {
    throw new Error("No se ha indicado el artículo");
  }

  if (section !== "general.summary") {
    throw new Error("Sección de edición no permitida");
  }

  if (typeof html !== "string") {
    throw new Error("El contenido no es válido");
  }

  const { activeWorkspace } =
    await getActiveWorkspaceContext(session.user.id);

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
        knowledge_analysis: {
          select: {
            id: true,
            analysis_json: true,
          },
        },
      },
    });

  if (!knowledge) {
    throw new Error(
      "No se ha encontrado el artículo o no tienes permisos para editarlo",
    );
  }

  const analysis = knowledge.knowledge_analysis;

  if (!analysis) {
    throw new Error(
      "El artículo todavía no tiene un análisis que se pueda editar",
    );
  }

  const currentJson = analysis.analysis_json;

  if (!isJsonObject(currentJson)) {
    throw new Error(
      "El análisis del artículo no tiene un formato válido",
    );
  }

  // Conservamos intactos los campos generados por IA.
  // El HTML editado se guarda aparte, dentro del mismo análisis.
  const currentEditableContent = isJsonObject(
    currentJson.editableContent,
  )
    ? currentJson.editableContent
    : {};

  const nextAnalysisJson = {
    ...currentJson,
    editableContent: {
      ...currentEditableContent,
      generalSummaryHtml: html,
    },
  };

  await prisma.knowledge_analysis.update({
    where: {
      id: analysis.id,
    },
    data: {
      analysis_json:
        nextAnalysisJson as Prisma.InputJsonValue,
    },
  });

  await recordResourceAccess({
    userId: session.user.id,
    workspaceId: activeWorkspace.id,
    resourceType: "knowledge_source",
    resourceId: id,
    interactionType: "edited",
  });

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${id}`);
}