// app/actions/knowledge.ts
"use server";
import { prisma } from "@/lib/prisma";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeKnowledgeSource } from "@/lib/services/knowledge-analysis.service";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAcceptedKnowledgeFileType } from "@/lib/knowledge/file-types";
import {
  addKnowledgeFile,
  editKnowledgeSource,
  findKnowledgeSource,
  newKnowledgeSource,
} from "@/lib/services/knowledge.service";
import { extractFileText } from "@/lib/knowledge/extract-file-text";
import {
  addMemberToTeam,
  createTeam,
  removeTeamShareFromLibrary,
  shareLibraryWithKnowledgeTeam,
} from "@/lib/services/knowledge-team.service";

export async function shareKnowledgeLibraryWithTeamAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const libraryId = String(formData.get("libraryId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();
  const accessLevel = String(formData.get("accessLevel") ?? "read") as
    | "read"
    | "edit"
    | "owner";

  if (!libraryId || !teamId) {
    return;
  }

  await shareLibraryWithKnowledgeTeam({
    libraryId,
    teamId,
    ownerUserId: session.user.id,
    accessLevel,
  });

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/library/${libraryId}`);
}

export async function createKnowledgeTeamAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    return;
  }

  await createTeam({
    ownerUserId: session.user.id,
    name,
    description,
  });

  revalidatePath("/my-space");
}

export async function addKnowledgeTeamMemberAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const teamId = String(formData.get("teamId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!teamId || !email) {
    return;
  }

  await addMemberToTeam({
    teamId,
    email,
  });

  revalidatePath("/my-space");
}

export async function createKnowledgeAction(formData: FormData) {
  console.log("FORM LIBRARY:", formData.get("libraryId"));
  const session = await auth();

  if (!session?.user) {
    return;
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "private");
  const libraryId = String(formData.get("libraryId") ?? "");

  if (!title) {
    return;
  }


let targetLibraryId = libraryId;

if (!targetLibraryId) {
  const rootLibrary = await prisma.knowledge_libraries.findFirst({
    where: {
      owner_user_id: session.user.id,
      name: "Mi biblioteca",
      parent_id: null,
    },
    select: {
      id: true,
    },
  });

  if (!rootLibrary) {
  throw new Error("No se encontró la biblioteca raíz.");
}

targetLibraryId = rootLibrary.id;
}

const knowledge = await newKnowledgeSource({
  ownerUserId: session.user.id,
  title,
  description,
  visibility,
  libraryId: targetLibraryId,
});

  revalidatePath("/knowledge");

  redirect(`/knowledge/${knowledge.id}`);
}

export async function updateKnowledgeAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    return;
  }

const id = String(formData.get("id"));
const title = String(formData.get("title") ?? "").trim();
const description = String(formData.get("description") ?? "").trim();
const visibility = String(formData.get("visibility") ?? "private");
const knowledgeType = String(formData.get("knowledgeType") ?? "unknown");
const content = String(formData.get("content") ?? "");

  if (!id || !title) {
    return;
  }

  await editKnowledgeSource({
    id,
    ownerUserId: session.user.id,
    title,
    description,
    visibility,
    knowledgeType,
    content,
  });

  await analyzeKnowledgeSource(id);

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${id}`);
}

export async function uploadKnowledgeFileAction(formData: FormData) {
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

  const uploadDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "knowledge",
  );

  await mkdir(uploadDir, {
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

    const safeFileName = file.name.replaceAll(" ", "_");
    const storedFileName = `${knowledgeId}-${Date.now()}-${safeFileName}`;
    const storagePath = `/uploads/knowledge/${storedFileName}`;

    await writeFile(
      path.join(uploadDir, storedFileName),
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

  await prisma.knowledge_sources.update({
    where: {
      id: knowledgeId,
    },
    data: {
      status: "stale",
      updated_at: new Date(),
    },
  });

  await prisma.knowledge_analysis.updateMany({
    where: {
      knowledge_source_id: knowledgeId,
    },
    data: {
      status: "stale",
      updated_at: new Date(),
    },
  });

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

  await prisma.$transaction([
    prisma.knowledge_files.delete({
      where: {
        id: file.id,
      },
    }),

    prisma.knowledge_sources.update({
      where: {
        id: file.knowledge_source_id,
      },
      data: {
        status: "stale",
        updated_at: new Date(),
      },
    }),

    prisma.knowledge_analysis.updateMany({
      where: {
        knowledge_source_id: file.knowledge_source_id,
      },
      data: {
        status: "stale",
        updated_at: new Date(),
      },
    }),
  ]);

  revalidatePath("/knowledge");
  revalidatePath(
    `/knowledge/${file.knowledge_source_id}`,
  );
}

export async function rebuildKnowledgeAction(
  knowledgeId: string,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const knowledge = await prisma.knowledge_sources.findFirst({
    where: {
      id: knowledgeId,
      owner_user_id: session.user.id,
    },
    select: {
      id: true,
    },
  });

  if (!knowledge) {
    throw new Error("Artículo no encontrado");
  }

  await analyzeKnowledgeSource(knowledgeId);

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${knowledgeId}`);
}

export async function removeKnowledgeLibraryTeamShareAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const libraryId = String(formData.get("libraryId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!libraryId || !teamId) {
    return;
  }

  await removeTeamShareFromLibrary({
    libraryId,
    teamId,
    ownerUserId: session.user.id,
  });

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/library/${libraryId}`);
}

export async function deleteKnowledgeAction(id: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const knowledge = await prisma.knowledge_sources.findFirst({
    where: {
      id,
      owner_user_id: session.user.id,
    },
    select: {
      id: true,
    },
  });

  if (!knowledge) {
    throw new Error("Artículo no encontrado");
  }

  await prisma.knowledge_sources.delete({
    where: {
      id,
    },
  });

  revalidatePath("/knowledge");
}