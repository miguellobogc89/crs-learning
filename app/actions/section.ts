// app/actions/section.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function createSection(formData: FormData) {
  const title = String(formData.get("title"));
  const courseId = String(formData.get("courseId"));

  if (!title.trim()) {
    return;
  }

  await prisma.sections.create({
    data: {
      title,
      course_id: courseId,
      sort_order: 0,
    },
  });

  revalidatePath(`/courses/${courseId}`);
}