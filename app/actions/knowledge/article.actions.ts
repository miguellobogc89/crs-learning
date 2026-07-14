// app/actions/knowledge/article.actions.ts
"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { extractFileText } from "@/lib/knowledge/extract-file-text";
import { isAcceptedKnowledgeFileType } from "@/lib/knowledge/file-types";
import { prisma } from "@/lib/prisma";
import { analyzeKnowledgeSource } from "@/lib/services/knowledge-analysis.service";
import {
  addKnowledgeFile,
  editKnowledgeSource,
} from "@/lib/services/knowledge.service";

export async function createKnowledgeWithDocumentsAction(
  formData: FormData,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

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
    formData.get("knowledgeType") ?? "other",
  ).trim();

  const libraryId = String(
    formData.get("libraryId") ?? "",
  ).trim();

  const uploadedFiles = formData
    .getAll("files")
    .filter(
      (value): value is File =>
        value instanceof File,
    );

  if (!title) {
    throw new Error("El título es obligatorio");
  }

  if (!libraryId) {
    throw new Error(
      "No se ha indicado la carpeta de destino",
    );
  }

  if (uploadedFiles.length === 0) {
    throw new Error(
      "Debes seleccionar al menos un documento",
    );
  }

  const library =
    await prisma.knowledge_libraries.findFirst({
      where: {
        id: libraryId,
        owner_user_id: session.user.id,
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

  const acceptedFiles = uploadedFiles.filter(
    (file) =>
      isAcceptedKnowledgeFileType(file),
  );

  if (acceptedFiles.length === 0) {
    throw new Error(
      "Ninguno de los documentos tiene un formato admitido",
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
        knowledge_type: knowledgeType,
        content: "",
        status: "processing",
      },
      select: {
        id: true,
      },
    });

  const uploadDirectory = path.join(
    process.cwd(),
    "public",
    "uploads",
    "knowledge",
  );

  await mkdir(uploadDirectory, {
    recursive: true,
  });

  try {
    for (const file of acceptedFiles) {
      const extractedText =
        await extractFileText(file);

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const safeFileName = file.name
        .replaceAll(" ", "_")
        .replace(/[^a-zA-Z0-9._-]/g, "");

      const storedFileName = [
        knowledge.id,
        Date.now(),
        crypto.randomUUID(),
        safeFileName,
      ].join("-");

      const storagePath =
        `/uploads/knowledge/${storedFileName}`;

      await writeFile(
        path.join(
          uploadDirectory,
          storedFileName,
        ),
        buffer,
      );

      await addKnowledgeFile({
        knowledgeSourceId: knowledge.id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storagePath,
        extractedText,
      });
    }

    await analyzeKnowledgeSource(
      knowledge.id,
    );
  } catch (error) {
    await prisma.knowledge_sources.update({
      where: {
        id: knowledge.id,
      },
      data: {
        status: "error",
        updated_at: new Date(),
      },
    });

    throw error;
  }

  revalidatePath("/knowledge");
  revalidatePath(
    `/knowledge/${knowledge.id}`,
  );

  redirect(`/knowledge/${knowledge.id}`);
}

export async function updateKnowledgeAction(
  formData: FormData,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

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

  await editKnowledgeSource({
    id,
    ownerUserId: session.user.id,
    updatedByUserId: session.user.id,
    title,
    description,
    visibility,
    knowledgeType,
    content,
  });

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

  const knowledge =
    await prisma.knowledge_sources.findFirst({
      where: {
        id: knowledgeId,
        owner_user_id: session.user.id,
      },
      select: {
        id: true,
      },
    });

  if (!knowledge) {
    throw new Error(
      "Artículo no encontrado",
    );
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

  const knowledge =
    await prisma.knowledge_sources.findFirst({
      where: {
        id,
        owner_user_id: session.user.id,
      },
      select: {
        id: true,
      },
    });

  if (!knowledge) {
    throw new Error(
      "Artículo no encontrado",
    );
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
    throw new Error("El título es obligatorio");
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
        owner_user_id: session.user.id,
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

export async function createKnowledgeFromFolderUploadAction(
  formData: FormData,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const libraryId = String(
    formData.get("libraryId") ?? "",
  ).trim();

  const uploadedFiles = formData
    .getAll("files")
    .filter(
      (value): value is File =>
        value instanceof File,
    );

  if (!libraryId) {
    throw new Error(
      "No se ha indicado la carpeta de destino",
    );
  }

  if (uploadedFiles.length === 0) {
    throw new Error(
      "Debes seleccionar al menos un documento",
    );
  }

  const library =
    await prisma.knowledge_libraries.findFirst({
      where: {
        id: libraryId,
        owner_user_id: session.user.id,
      },
      select: {
        id: true,
        name: true,
      },
    });

  if (!library) {
    throw new Error(
      "La carpeta de destino no existe",
    );
  }

  const acceptedFiles = uploadedFiles.filter(
    (file) =>
      isAcceptedKnowledgeFileType(file),
  );

  if (acceptedFiles.length === 0) {
    throw new Error(
      "Ninguno de los documentos tiene un formato admitido",
    );
  }

  let provisionalTitle = library.name;

  if (acceptedFiles.length === 1) {
    provisionalTitle = acceptedFiles[0].name.replace(
      /\.[^/.]+$/,
      "",
    );
  }

  const knowledge =
    await prisma.knowledge_sources.create({
      data: {
        owner_user_id: session.user.id,
        created_by_user_id: session.user.id,
        updated_by_user_id: session.user.id,
        library_id: library.id,
        title: provisionalTitle,
        description:
          "Artículo generado automáticamente a partir de documentación subida.",
        visibility: "private",
        knowledge_type: "unknown",
        content: "",
        status: "processing",
      },
      select: {
        id: true,
      },
    });

  const uploadDirectory = path.join(
    process.cwd(),
    "public",
    "uploads",
    "knowledge",
  );

  await mkdir(uploadDirectory, {
    recursive: true,
  });

  try {
    for (const file of acceptedFiles) {
      const extractedText =
        await extractFileText(file);

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const safeFileName = file.name
        .replaceAll(" ", "_")
        .replace(/[^a-zA-Z0-9._-]/g, "");

      const storedFileName = [
        knowledge.id,
        Date.now(),
        crypto.randomUUID(),
        safeFileName,
      ].join("-");

      const storagePath =
        `/uploads/knowledge/${storedFileName}`;

      await writeFile(
        path.join(
          uploadDirectory,
          storedFileName,
        ),
        buffer,
      );

      await addKnowledgeFile({
        knowledgeSourceId: knowledge.id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storagePath,
        extractedText,
      });
    }

    await analyzeKnowledgeSource(knowledge.id);
  } catch (error) {
    await prisma.knowledge_sources.update({
      where: {
        id: knowledge.id,
      },
      data: {
        status: "error",
        updated_at: new Date(),
      },
    });

    throw error;
  }

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${knowledge.id}`);

  redirect(`/knowledge/${knowledge.id}`);
}