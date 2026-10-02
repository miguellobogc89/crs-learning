// app/actions/course.ts

"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

import {
  assignCourse,
  deleteCourse,
  generateCourseCover,
  getCourseManagementData,
  newCourse,
  setCoursePublished,
  updateCourse,
  uploadCourseCover,
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
      course: serializeAdminCourse(course, {
        trainingType: input.trainingType,
        difficulty: input.difficulty,
        students: 0,
      }),
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

  if (!input.title.trim() || !input.objective.trim()) {
    return {
      ok: false as const,
      error:
        "Añade el título y la descripción antes de generar una imagen.",
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

export async function uploadCourseImageAction(
  formData: FormData,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      ok: false as const,
      error: "Tu sesión ha caducado.",
    };
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return {
      ok: false as const,
      error: "No se ha recibido ninguna imagen.",
    };
  }

  try {
    const image = await uploadCourseCover({
      userId: session.user.id,
      file,
    });

    return {
      ok: true as const,
      blobUrl: image.blobUrl,
      previewUrl: image.previewUrl,
    };
  } catch (error) {
    console.error("uploadCourseImageAction", error);

    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se ha podido subir la portada.",
    };
  }
}

export async function updateCourseAction(input: {
  courseId: string;
  title: string;
  description: string;
  trainingType: TrainingType;
  level: CourseLevel;
  difficulty: Difficulty;
  thumbnailUrl?: string | null;
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
      error: "El título del curso es obligatorio.",
    };
  }

  try {
    const result = await updateCourse({
      userId: session.user.id,
      ...input,
      title: input.title.trim(),
      description: input.description.trim(),
    });

    revalidatePath("/courses");

    return {
      ok: true as const,
      course: result,
    };
  } catch (error) {
    console.error("updateCourseAction", error);

    return actionError(
      error,
      "No se ha podido actualizar el curso.",
    );
  }
}

export async function setCoursePublishedAction(
  courseId: string,
  published: boolean,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      ok: false as const,
      error: "Tu sesión ha caducado.",
    };
  }

  try {
    const course = await setCoursePublished({
      userId: session.user.id,
      courseId,
      published,
    });

    revalidatePath("/courses");

    return {
      ok: true as const,
      course,
    };
  } catch (error) {
    console.error("setCoursePublishedAction", error);

    return actionError(
      error,
      "No se ha podido cambiar el estado del curso.",
    );
  }
}

export async function deleteCourseAction(
  courseId: string,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      ok: false as const,
      error: "Tu sesión ha caducado.",
    };
  }

  try {
    await deleteCourse({
      userId: session.user.id,
      courseId,
    });

    revalidatePath("/courses");

    return {
      ok: true as const,
    };
  } catch (error) {
    console.error("deleteCourseAction", error);

    return actionError(
      error,
      "No se ha podido eliminar el curso.",
    );
  }
}

export async function getCourseManagementDataAction(
  courseId: string,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      ok: false as const,
      error: "Tu sesión ha caducado.",
    };
  }

  try {
    const options = await getCourseManagementData({
      userId: session.user.id,
      courseId,
    });

    return {
      ok: true as const,
      options,
    };
  } catch (error) {
    console.error(
      "getCourseManagementDataAction",
      error,
    );

    return actionError(
      error,
      "No se han podido cargar las asignaciones.",
    );
  }
}

export async function assignCourseAction(input: {
  courseId: string;
  targetId: string;
  targetType: "user" | "team";
}) {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      ok: false as const,
      error: "Tu sesión ha caducado.",
    };
  }

  try {
    const course = await assignCourse({
      userId: session.user.id,
      ...input,
    });

    revalidatePath("/courses");

    return {
      ok: true as const,
      course,
    };
  } catch (error) {
    console.error("assignCourseAction", error);

    return actionError(
      error,
      "No se ha podido asignar el curso.",
    );
  }
}

function serializeAdminCourse(
  course: {
    id: string;
    title: string;
    description: string | null;
    level: string;
    is_published: boolean;
    updated_at: Date;
    thumbnail_url: string | null;
  },
  options: {
    trainingType: TrainingType;
    difficulty: Difficulty;
    students: number;
  },
) {
  const level: CourseLevel =
    course.level === "intermediate" ||
    course.level === "advanced"
      ? course.level
      : "beginner";

  return {
    id: course.id,
    title: course.title,
    description: course.description ?? "",
    type: options.trainingType,
    level,
    difficulty: options.difficulty,
    status: course.is_published
      ? ("published" as const)
      : ("draft" as const),
    updatedAt: new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(course.updated_at),
    students: options.students,
    thumbnailUrl: course.thumbnail_url
      ? `/api/academy/course-cover/${course.id}?v=${course.updated_at.getTime()}`
      : null,
  };
}

function actionError(
  error: unknown,
  fallback: string,
) {
  return {
    ok: false as const,
    error:
      error instanceof Error
        ? error.message
        : fallback,
  };
}