
// app/actions/academy-didactic.ts
"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateDidacticPackage } from "@/lib/academy/didactic-generator";
import {
  validateDidacticPackage,
  type DidacticPackage,
} from "@/lib/academy/didactic-package";

function record(value: unknown): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function authorizeCourse(
  userId: string,
  courseId: string,
) {
  const [user, course] = await Promise.all([
    prisma.users.findUnique({
      where: { id: userId },
      select: {
        company_id: true,
        system_role: true,
      },
    }),
    prisma.courses.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        company_id: true,
        title: true,
        description: true,
        evaluation_config: true,
      },
    }),
  ]);

  if (!user || !course) {
    throw new Error("Curso no encontrado.");
  }

  const authorized =
    user.system_role === "system_admin" ||
    (
      user.system_role === "org_manager" &&
      Boolean(user.company_id) &&
      user.company_id === course.company_id
    );

  if (!authorized) {
    throw new Error("No tienes permiso para producir este curso.");
  }

  return course;
}

export async function generateLessonDidacticAction(input: {
  courseId: string;
  lessonId: string;
}) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("Sesión caducada.");
    }

    const course = await authorizeCourse(
      session.user.id,
      input.courseId,
    );

    const lesson = await prisma.lessons.findFirst({
      where: {
        id: input.lessonId,
        sections: {
          course_id: course.id,
        },
      },
      select: {
        id: true,
        title: true,
        content: true,
        sections: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!lesson) {
      throw new Error("La lección no pertenece a este curso.");
    }

    const didacticPackage = await generateDidacticPackage({
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      moduleTitle: lesson.sections.title,
      courseTitle: course.title,
      courseDescription: course.description,
      content: lesson.content,
    });

    // Recargar la configuración después de la generación:
    // otras operaciones podrían haberla modificado mientras tanto.
    let saved = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      const latest = await prisma.courses.findUnique({
        where: { id: course.id },
        select: {
          evaluation_config: true,
        },
      });

      if (!latest) {
        throw new Error("El curso ya no existe.");
      }

      const config = record(latest.evaluation_config);
      const packages = record(config.didacticPackages);

      const nextConfig = {
        ...config,
        didacticPackages: {
          ...packages,
          [lesson.id]: didacticPackage,
        },
      };

      const result = await prisma.courses.updateMany({
        where: {
          id: course.id,
          evaluation_config:
            latest.evaluation_config === null
              ? { equals: Prisma.DbNull }
              : { equals: latest.evaluation_config },
        },
        data: {
          evaluation_config:
            nextConfig as Prisma.InputJsonObject,
        },
      });

      if (result.count === 1) {
        saved = true;
        break;
      }
    }

    if (!saved) {
      throw new Error(
        "El curso se ha modificado durante la generación. " +
        "Reintenta la operación.",
      );
    }

    revalidatePath(`/courses/${course.id}`);

    return {
      ok: true as const,
      lessonId: lesson.id,
      screenCount: didacticPackage.screens.length,
      package: didacticPackage,
    };
  } catch (error) {
    console.error("generateLessonDidacticAction", error);

    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se ha podido generar la clase.",
    };
  }
}

export async function getLessonDidacticAction(input: {
  courseId: string;
  lessonId: string;
}): Promise<
  | { ok: true; package: DidacticPackage | null }
  | { ok: false; error: string }
> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("Sesión caducada.");
    }

    // Reutilizamos el control de acceso de Academy
    // para permitir lectura al alumno o al manager.
    const { getAcademyCourseDetail } = await import(
      "@/lib/services/academy.service"
    );

    const detail = await getAcademyCourseDetail(
      session.user.id,
      input.courseId,
    );

    if (!detail) {
      throw new Error("No tienes acceso a este curso.");
    }

    const belongsToCourse = detail.course.sections.some(
      (section) =>
        section.lessons.some(
          (lesson) => lesson.id === input.lessonId,
        ),
    );

    if (!belongsToCourse) {
      throw new Error("Lección no encontrada.");
    }

    const config = record(detail.course.evaluation_config);
    const packages = record(config.didacticPackages);
    const candidate = packages[input.lessonId];

    return {
      ok: true,
      package: validateDidacticPackage(candidate)
        ? candidate
        : null,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se ha podido cargar el contenido.",
    };
  }
}
