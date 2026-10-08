"use server";

import { revalidatePath } from "next/cache";
import { createCourseDraftAction, updateCourseAction } from "@/app/actions/course";
import { generateCourseOutline, type CourseOutlineInput } from "@/academy/generation/course-outline";
import { prisma } from "@/lib/prisma";

export async function createCourseWithOutlineAction(
  input: CourseOutlineInput & { thumbnailUrl?: string | null; courseId?: string },
) {
  const result = input.courseId
    ? await updateCourseAction({
        courseId: input.courseId,
        title: input.title,
        description: input.objective,
        trainingType: input.trainingType,
        level: input.level,
        difficulty: input.difficulty,
        thumbnailUrl: input.thumbnailUrl,
      })
    : await createCourseDraftAction(input);
  if (!result.ok) return result;

  try {
    const outline = await generateCourseOutline({
      title: input.title.trim(),
      objective: input.objective.trim(),
      trainingType: input.trainingType,
      level: input.level,
      difficulty: input.difficulty,
    });
    const course = await prisma.courses.findUniqueOrThrow({
      where: { id: result.course.id },
      select: { evaluation_config: true },
    });
    const config = course.evaluation_config;
    await prisma.courses.update({
      where: { id: result.course.id },
      data: {
        evaluation_config: {
          ...(config && typeof config === "object" && !Array.isArray(config) ? config : {}),
          outline,
        },
      },
    });
    revalidatePath("/courses");
    return { ...result, outline, warning: null };
  } catch (error) {
    console.error("createCourseWithOutlineAction", error);
    return {
      ...result,
      outline: null,
      warning: "Borrador creado, pero no se ha podido generar la propuesta de módulos.",
    };
  }
}
