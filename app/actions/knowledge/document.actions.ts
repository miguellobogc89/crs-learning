// app/actions/knowledge/document.actions.ts
"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { extractFileText } from "@/lib/knowledge/extract-file-text";
import { isAcceptedKnowledgeFileType } from "@/lib/knowledge/file-types";
import { prisma } from "@/lib/prisma";
import {
  addKnowledgeFile,
  findKnowledgeSource,
} from "@/lib/services/knowledge.service";

export async function uploadKnowledgeFileAction(
  formData: FormData,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const knowledgeId = String(
    formData.get("knowledgeId") ?? "",
  ).trim();

  const files = formData.getAll("files");

  if (!knowledgeId || files.length === 0) {
    return;
  }

  const knowledge = await findKnowledgeSource(knowledgeId);

  if (
    !knowledge ||
    knowledge.owner_user_id !== session.user.id
  ) {
    throw new Error("Artículo no encontrado");
  }

  const uploadDirectory = path.join(
    process.cwd(),
    "public",
    "uploads",
    "knowledge",
  );

  await mkdir(uploadDirectory, {
    recursive: true,
  });

  let uploadedFiles = 0;

  for (const file of files) {
    if (!(file instanceof File)) {
      continue;
    }

    if (!isAcceptedKnowledgeFileType(file)) {
      continue;
    }

    const extractedText = await extractFileText(file);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const safeFileName = file.name
      .replaceAll(" ", "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");

    const storedFileName = [
      knowledgeId,
      Date.now(),
      crypto.randomUUID(),
      safeFileName,
    ].join("-");

    const storagePath =
      `/uploads/knowledge/${storedFileName}`;

    await writeFile(
      path.join(uploadDirectory, storedFileName),
      buffer,
    );

    await addKnowledgeFile({
      knowledgeSourceId: knowledgeId,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      storagePath,
      extractedText,
    });

    uploadedFiles += 1;
  }

  if (uploadedFiles === 0) {
    return;
  }

  await markKnowledgeAsStale(knowledgeId);

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${knowledgeId}`);
}

export async function deleteKnowledgeFileAction(
  knowledgeFileId: string,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const file = await prisma.knowledge_files.findFirst({
    where: {
      id: knowledgeFileId,
      knowledge_sources: {
        owner_user_id: session.user.id,
      },
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