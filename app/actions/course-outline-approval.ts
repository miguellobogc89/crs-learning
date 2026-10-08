// app/actions/course-outline-approval.ts

"use server";

// app/actions/course-outline-approval.ts

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type OutlineModule = {
  order: number;
  title: string;
  description: string;
  estimatedMinutes: number;
  learningObjectives: string[];
};

type Outline = {
  version: number;
  status: string;
  modules: OutlineModule[];
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseOutline(value: unknown): Outline | null {
  if (!isRecord(value)) return null;

  if (
    value.version !== 1 ||
    value.status !== "pending_review" ||
    !Array.isArray(value.modules) ||
    value.modules.length < 1 ||
    value.modules.length > 30
  ) {
    return null;
  }

  const modules: OutlineModule[] = [];

  for (const item of value.modules) {
    if (!isRecord(item)) return null;

    if (
      typeof item.title !== "string" ||
      !item.title.trim() ||
      typeof item.description !== "string" ||
      !item.description.trim() ||
      !Array.isArray(item.learningObjectives) ||
      item.learningObjectives.length === 0 ||
      !item.learningObjectives.every(
        (objective) =>
          typeof objective === "string" &&
          objective.trim().length > 0,
      ) ||
      !Number.isInteger(item.estimatedMinutes) ||
      (item.estimatedMinutes as number) < 1 ||
      (item.estimatedMinutes as number) > 600
    ) {
      return null;
    }

    modules.push({
      order: modules.length + 1,
      title: item.title.trim(),
      description: item.description.trim(),
      estimatedMinutes: item.estimatedMinutes as number,
      learningObjectives: item.learningObjectives as string[],
    });
  }

  return {
    ...value,
    version: 1,
    status: "pending_review",
    modules,
  } as Outline;
}

export async function approveCourseOutlineAction(courseId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      ok: false as const,
      error: "Sesión caducada.",
    };
  }

  const user = await prisma.users.findUnique({
    where: { id: session.user.id },
    select: {
      system_role: true,
      company_id: true,
    },
  });

  if (
    !user ||
    !["org_manager", "system_admin"].includes(user.system_role)
  ) {
    return {
      ok: false as const,
      error: "No tienes permisos para aprobar temarios.",
    };
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Bloqueo por curso para evitar aprobaciones simultáneas.
        await tx.$queryRaw`
          SELECT id
          FROM courses
          WHERE id = ${courseId}::uuid
          FOR UPDATE
        `;

        const course = await tx.courses.findUnique({
          where: { id: courseId },
          select: {
            company_id: true,
            is_published: true,
            evaluation_config: true,
          },
        });

        if (!course) {
          throw new Error("El curso no existe.");
        }

        if (
          user.system_role !== "system_admin" &&
          (!user.company_id ||
            user.company_id !== course.company_id)
        ) {
          throw new Error(
            "No tienes permisos para aprobar este curso.",
          );
        }

        if (course.is_published) {
          throw new Error(
            "No se puede aprobar el temario de un curso publicado.",
          );
        }

        const config = course.evaluation_config;

        if (!isRecord(config)) {
          throw new Error(
            "El curso no tiene una propuesta de temario.",
          );
        }

        const existingOutline = config.outline;

        if (
          isRecord(existingOutline) &&
          existingOutline.status === "approved"
        ) {
          return {
            alreadyApproved: true,
            sectionsCreated: 0,
          };
        }

        const outline = parseOutline(existingOutline);

        if (!outline) {
          throw new Error(
            "La propuesta está incompleta o no está pendiente de revisión.",
          );
        }

        const existingSections = await tx.sections.count({
          where: { course_id: courseId },
        });

        if (existingSections > 0) {
          throw new Error(
            "El curso ya tiene secciones. No se sobrescribirán.",
          );
        }

        await tx.sections.createMany({
          data: outline.modules.map((module, index) => ({
            course_id: courseId,
            title: module.title,
            description: module.description,
            sort_order: index + 1,
            learning_objectives:
              module.learningObjectives as Prisma.InputJsonArray,
          })),
        });

        const approvedOutline = {
          ...outline,
          status: "approved",
          approvedAt: new Date().toISOString(),
          approvedBy: session.user.id,
        };

        await tx.courses.update({
          where: { id: courseId },
          data: {
            evaluation_config: {
              ...config,
              outline: approvedOutline,
            } as Prisma.InputJsonObject,
          },
        });

        return {
          alreadyApproved: false,
          sectionsCreated: outline.modules.length,
        };
      },
      {
        maxWait: 5000,
        timeout: 15000,
      },
    );

    revalidatePath("/courses");
    revalidatePath(`/courses/${courseId}`);

    return {
      ok: true as const,
      ...result,
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo aprobar el temario.",
    };
  }
}
