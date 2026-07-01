// app/actions/lesson.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function createLesson(formData: FormData) {
  const title = String(formData.get("title"));
  const sectionId = String(formData.get("sectionId"));
  const courseId = String(formData.get("courseId"));

  if (!title.trim()) {
    return;
  }

const lesson = await prisma.lessons.create({
  data: {
    module_id: sectionId,
    title,
    content: "",
    sort_order: 0,
  },
});

await prisma.section_items.create({
  data: {
    section_id: sectionId,
    item_type: "lesson",
    lesson_id: lesson.id,
    sort_order: 0,
  },
});

  revalidatePath(`/courses/${courseId}`);
}

export async function updateLesson(formData: FormData) {
  const lessonId = String(formData.get("lessonId"));
  const courseId = String(formData.get("courseId"));
  const title = String(formData.get("title"));
  const content = String(formData.get("content"));

  if (!lessonId || !title.trim()) {
    return;
  }

  await prisma.lessons.update({
    where: {
      id: lessonId,
    },
    data: {
      title,
      content,
      updated_at: new Date(),
    },
  });

  revalidatePath(`/courses/${courseId}`);
}