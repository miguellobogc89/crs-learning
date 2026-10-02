// app/actions/course.ts

"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  generateCourseCover,
  newCourse,
} from "@/lib/services/course.service";

type TrainingType = "required" | "skills";
type CourseLevel = "beginner" | "intermediate" | "advanced";
type Difficulty = "low" | "medium" | "high";

type CreateCourseDraftInput = {
  title: string;
  objective: string;
  trainingType: TrainingType;
  level: CourseLevel;
  difficulty: Difficulty;
  thumbnailUrl?: string | null;
};

export async function createCourseDraftAction(
  input: CreateCourseDraftInput,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      ok: false as const,
      error: "Tu sesión ha caducado.",
    };
  }

  if (!input.title.trim()) {
    return {
      ok: false as const,
      error: "El título del curso es obligatorio.",
    };
  }

  try {
    const course = await newCourse({
      userId: session.user.id,
      title: input.title.trim(),
      objective: input.objective.trim(),
      trainingType: input.trainingType,
      level: input.level,
      difficulty: input.difficulty,
      thumbnailUrl: input.thumbnailUrl ?? null,
    });

    revalidatePath("/courses");

    return {
      ok: true as const,

      /*
       * Devolvemos exactamente el formato que utiliza AcademyAdmin.
       * Así el cliente puede insertar la fila en el mismo instante.
       */
      course: {
        id: course.id,
        title: course.title,
        description: course.description ?? "",
        type: input.trainingType,
        level: input.level,
        difficulty: input.difficulty,
        status: "draft" as const,
        updatedAt: new Intl.DateTimeFormat("es-ES", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(course.updated_at),
        students: 0,

        /*
         * No exponemos la URL privada.
         * La imagen se servirá por nuestro endpoint autenticado.
         */
        thumbnailUrl: course.thumbnail_url
          ? `/api/academy/course-cover/${course.id}`
          : null,
      },
    };
  } catch (error) {
    console.error("createCourseDraftAction", error);

    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se ha podido crear el borrador.",
    };
  }
}

export async function generateCourseImageAction(input: {
  title: string;
  objective: string;
  trainingType: TrainingType;
  level: CourseLevel;
  difficulty: Difficulty;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      ok: false as const,
      error: "Tu sesión ha caducado.",
    };
  }

  if (!input.title.trim()) {
    return {
      ok: false as const,
      error: "Escribe primero el título del curso.",
    };
  }

  try {
    const image = await generateCourseCover({
      userId: session.user.id,
      title: input.title.trim(),
      objective: input.objective.trim(),
      trainingType: input.trainingType,
      level: input.level,
      difficulty: input.difficulty,
    });

    return {
      ok: true as const,
      blobUrl: image.blobUrl,
      previewUrl: image.previewUrl,
    };
  } catch (error) {
    console.error("generateCourseImageAction", error);

    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se ha podido generar la portada.",
    };
  }
}