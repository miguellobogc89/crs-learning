// app/actions/tree.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function deleteSection(formData: FormData) {
  const sectionId = String(formData.get("sectionId"));
  const courseId = String(formData.get("courseId"));

  await prisma.sections.delete({
    where: { id: sectionId },
  });

  revalidatePath(`/courses/${courseId}`);
}

export async function deleteLesson(formData: FormData) {
  const lessonId = String(formData.get("lessonId"));
  const courseId = String(formData.get("courseId"));

  await prisma.lessons.delete({
    where: { id: lessonId },
  });

  revalidatePath(`/courses/${courseId}`);
}

export async function deleteQuiz(formData: FormData) {
  const quizId = String(formData.get("quizId"));
  const courseId = String(formData.get("courseId"));

  await prisma.quizzes.delete({
    where: { id: quizId },
  });

  revalidatePath(`/courses/${courseId}`);
}