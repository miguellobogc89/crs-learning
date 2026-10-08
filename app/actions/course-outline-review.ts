// app/actions/course-outline-review.ts
"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { CourseOutline } from "@/academy/generation/course-outline";

export async function saveCourseOutlineAction(courseId: string, outline: CourseOutline) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Sesión caducada." };
  const [user, course] = await Promise.all([
    prisma.users.findUnique({ where: { id: session.user.id }, select: { system_role: true, company_id: true } }),
    prisma.courses.findUnique({ where: { id: courseId }, select: { company_id: true, is_published: true, evaluation_config: true } }),
  ]);
  if (!user || !course || !["org_manager", "system_admin"].includes(user.system_role) ||
    (user.system_role !== "system_admin" && (!user.company_id || user.company_id !== course.company_id))) {
    return { ok: false as const, error: "No tienes permisos para editar este curso." };
  }
  if (course.is_published) return { ok: false as const, error: "No se puede modificar la propuesta de un curso publicado." };
  if (!outline || outline.version !== 1 || outline.status !== "pending_review" ||
      !Array.isArray(outline.modules) || outline.modules.length < 1 || outline.modules.length > 30 ||
      outline.modules.some(m => !m.title?.trim() || !m.description?.trim() ||
        !Number.isInteger(m.estimatedMinutes) || m.estimatedMinutes < 1 || m.estimatedMinutes > 600 ||
        !Array.isArray(m.learningObjectives) || !m.learningObjectives.length ||
        m.learningObjectives.some(v => typeof v !== "string" || !v.trim()))) {
    return { ok: false as const, error: "Revisa los títulos, descripciones, objetivos y duraciones de los módulos." };
  }
  const config = course.evaluation_config;
  const existing = config && typeof config === "object" && !Array.isArray(config) ? config : {};
  await prisma.courses.update({
    where: { id: courseId },
    data: { evaluation_config: { ...existing, outline: { ...outline, modules: outline.modules.map((m, i) => ({ ...m, order: i + 1 })) } } as Prisma.InputJsonObject },
  });
  return { ok: true as const };
}
