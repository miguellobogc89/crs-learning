// app/actions/knowledge.ts
"use server";

import { mkdir, writeFile } from "node:fs/promises";
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

export async function createKnowledgeAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    return;
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "private");

  if (!title) {
    return;
  }

  const knowledge = await newKnowledgeSource({
    ownerUserId: session.user.id,
    title,
    description,
    visibility,
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

  if (!session?.user) {
    return;
  }

  const knowledgeId = String(formData.get("knowledgeId"));
  const files = formData.getAll("files");

  if (!knowledgeId || files.length === 0) {
    return;
  }

  const knowledge = await findKnowledgeSource(knowledgeId);

  if (!knowledge || knowledge.owner_user_id !== session.user.id) {
    return;
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "knowledge");
  await mkdir(uploadDir, { recursive: true });

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

    await writeFile(path.join(uploadDir, storedFileName), buffer);

    await addKnowledgeFile({
      knowledgeSourceId: knowledgeId,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      storagePath,
      extractedText,
    });
  }

  await analyzeKnowledgeSource(knowledgeId);

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${knowledgeId}`);
}