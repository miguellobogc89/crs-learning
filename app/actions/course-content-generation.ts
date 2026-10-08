
// app/actions/course-content-generation.ts
"use server";

import OpenAI from "openai";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type GeneratedLesson = {
  title: string;
  content: string;
  estimatedMinutes: number;
};

type ModuleInfo = {
  order: number;
  title: string;
  description: string;
  learningObjectives: string[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractModules(config: unknown): ModuleInfo[] {
  if (!record(config) || !record(config.outline)) {
    throw new Error("No existe un temario aprobado.");
  }

  const outline = config.outline;

  if (outline.status !== "approved" || !Array.isArray(outline.modules)) {
    throw new Error("El temario todavía no está aprobado.");
  }

  return outline.modules.map((item, index) => {
    if (
      !record(item) ||
      typeof item.title !== "string" ||
      typeof item.description !== "string" ||
      !Array.isArray(item.learningObjectives) ||
      !item.learningObjectives.every(v => typeof v === "string")
    ) {
      throw new Error("El temario contiene datos incorrectos.");
    }

    return {
      order: index + 1,
      title: item.title,
      description: item.description,
      learningObjectives: item.learningObjectives as string[],
    };
  });
}

async function getAuthorizedCourse(courseId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Sesión caducada.");
  }

  const [user, course] = await Promise.all([
    prisma.users.findUnique({
      where: { id: session.user.id },
      select: { system_role: true, company_id: true },
    }),
    prisma.courses.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        description: true,
        company_id: true,
        is_published: true,
        evaluation_config: true,
        sections: {
          orderBy: { sort_order: "asc" },
          select: {
            id: true,
            title: true,
            sort_order: true,
            lessons: { select: { id: true } },
          },
        },
      },
    }),
  ]);

  if (
    !user ||
    !course ||
    !["org_manager", "system_admin"].includes(user.system_role) ||
    (user.system_role !== "system_admin" &&
      (!user.company_id || user.company_id !== course.company_id))
  ) {
    throw new Error("No tienes permisos para gestionar este curso.");
  }

  if (course.is_published) {
    throw new Error("No se puede generar contenido para un curso publicado.");
  }

  const modules = extractModules(course.evaluation_config);

  if (
    modules.length === 0 ||
    course.sections.length !== modules.length ||
    course.sections.some((section, index) =>
      section.sort_order !== index + 1 ||
      section.title !== modules[index].title
    )
  ) {
    throw new Error("Las secciones no coinciden con el temario aprobado.");
  }

  return { course, modules };
}

function detectRisk(text: string) {
  const patterns = [
    /media tensi[oó]n/i,
    /alta tensi[oó]n/i,
    /trabajos? en tensi[oó]n/i,
    /riesgo el[eé]ctrico/i,
    /espacios? confinados?/i,
    /trabajos? en altura/i,
    /sustancias? peligrosas?/i,
    /atm[oó]sferas? explosivas?/i,
    /radiaciones? ionizantes?/i,
    /operaci[oó]n de maquinaria pesada/i,
  ];

  return patterns.some(pattern => pattern.test(text));
}

export async function getCourseGenerationStatusAction(courseId: string) {
  try {
    const { course, modules } = await getAuthorizedCourse(courseId);
    const config = record(course.evaluation_config)
      ? course.evaluation_config
      : {};

    const generation = record(config.contentGeneration)
      ? config.contentGeneration
      : {};

    const riskText = [
      course.title,
      course.description ?? "",
      ...modules.flatMap(m => [
        m.title,
        m.description,
        ...m.learningObjectives,
      ]),
    ].join(" ");

    return {
      ok: true as const,
      courseTitle: course.title,
      reviewRequired:
        generation.reviewRequired === true || detectRisk(riskText),
      modules: course.sections.map(section => ({
        id: section.id,
        title: section.title,
        order: section.sort_order,
        completed: section.lessons.length > 0,
        lessonCount: section.lessons.length,
      })),
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Error al consultar el curso.",
    };
  }
}

export async function generateCourseModuleAction(
  courseId: string,
  moduleOrder: number,
) {
  try {
    const { course, modules } = await getAuthorizedCourse(courseId);

    const module = modules[moduleOrder - 1];
    const section = course.sections[moduleOrder - 1];

    if (!module || !section || section.sort_order !== moduleOrder) {
      throw new Error("El módulo solicitado no existe.");
    }

    if (section.lessons.length > 0) {
      return { ok: true as const, alreadyGenerated: true };
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Falta configurar OPENAI_API_KEY.");
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Eres un diseñador instruccional de formación corporativa.",
            "Devuelve exclusivamente JSON con una propiedad lessons.",
            "Genera entre 2 y 4 lecciones por módulo.",
            "Cada lección debe tener title, content y estimatedMinutes.",
            "content debe contener material didáctico desarrollado en Markdown.",
            "Cada lección debe explicar conceptos, ejemplos y una aplicación práctica.",
            "No inventes normas, referencias legales ni procedimientos internos.",
            "Si el tema es peligroso, explica principios preventivos generales.",
            "No redactes instrucciones operativas peligrosas como si fueran procedimientos autorizados.",
            "No afirmes haber consultado documentos o fuentes externas.",
            "Responde en español.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            courseTitle: course.title,
            courseObjective: course.description,
            module,
          }),
        },
      ],
    });

    const raw = response.choices[0]?.message?.content;

    if (!raw) throw new Error("La IA no ha devuelto contenido.");

    const parsed: unknown = JSON.parse(raw);

    if (!record(parsed) || !Array.isArray(parsed.lessons)) {
      throw new Error("La respuesta de la IA no contiene lecciones.");
    }

    const lessons: GeneratedLesson[] = parsed.lessons.map(item => {
      if (
        !record(item) ||
        typeof item.title !== "string" ||
        !item.title.trim() ||
        typeof item.content !== "string" ||
        item.content.trim().length < 200 ||
        typeof item.estimatedMinutes !== "number" ||
        !Number.isInteger(item.estimatedMinutes) ||
        item.estimatedMinutes < 1 ||
        item.estimatedMinutes > 120
      ) {
        throw new Error("La IA ha devuelto una lección incompleta.");
      }

      return {
        title: item.title.trim(),
        content: item.content.trim(),
        estimatedMinutes: item.estimatedMinutes,
      };
    });

    if (lessons.length < 2 || lessons.length > 4) {
      throw new Error("El módulo debe contener entre 2 y 4 lecciones.");
    }

    const riskText = [
      course.title,
      course.description ?? "",
      ...modules.flatMap(m => [m.title, m.description, ...m.learningObjectives]),
      ...lessons.flatMap(l => [l.title, l.content]),
    ].join(" ");

    await prisma.$transaction(async tx => {
      await tx.$queryRaw`
        SELECT id FROM courses
        WHERE id = ${courseId}::uuid
        FOR UPDATE
      `;

      const current = await tx.courses.findUniqueOrThrow({
        where: { id: courseId },
        select: {
          is_published: true,
          evaluation_config: true,
        },
      });

      if (current.is_published) {
        throw new Error("El curso ya está publicado.");
      }

      extractModules(current.evaluation_config);

      const existing = await tx.lessons.count({
        where: { module_id: section.id },
      });

      if (existing > 0) return;

      for (const [index, lesson] of lessons.entries()) {
        const created = await tx.lessons.create({
          data: {
            module_id: section.id,
            title: lesson.title,
            content: lesson.content,
            lesson_type: "reading",
            estimated_minutes: lesson.estimatedMinutes,
            sort_order: index + 1,
          },
        });

        await tx.section_items.create({
          data: {
            section_id: section.id,
            item_type: "lesson",
            lesson_id: created.id,
            sort_order: index + 1,
          },
        });
      }

      const config = record(current.evaluation_config)
        ? current.evaluation_config
        : {};

      const generation = record(config.contentGeneration)
        ? config.contentGeneration
        : {};

      await tx.courses.update({
        where: { id: courseId },
        data: {
          evaluation_config: {
            ...config,
            contentGeneration: {
              ...generation,
              reviewRequired:
                generation.reviewRequired === true || detectRisk(riskText),
              lastGeneratedAt: new Date().toISOString(),
            },
          } as Prisma.InputJsonObject,
        },
      });
    });

    revalidatePath("/courses");
    revalidatePath(`/courses/${courseId}`);

    return { ok: true as const, alreadyGenerated: false };
  } catch (error) {
    console.error("generateCourseModuleAction", error);

    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo generar el módulo.",
    };
  }
}
