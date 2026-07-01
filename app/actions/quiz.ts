// app/actions/quiz.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function createSectionQuiz(formData: FormData) {
  const sectionId = String(formData.get("sectionId"));
  const courseId = String(formData.get("courseId"));

  if (!sectionId || !courseId) {
    return;
  }

  await prisma.quizzes.create({
    data: {
      section_id: sectionId,
      title: "Nuevo test",
      passing_score: 70,
    },
  });

  revalidatePath(`/courses/${courseId}`);
}