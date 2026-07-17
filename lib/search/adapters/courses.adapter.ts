/**
 * Adaptador de búsqueda para cursos/artículos
 * Módulo: Courses
 */

import { prisma } from "@/lib/prisma";
import type { SearchAdapter, SearchContext, SearchResult } from "../types";

export const coursesSearchAdapter: SearchAdapter = {
  id: "courses",
  category: "articulos",
  label: "💡 Artículos",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, limit = 10 } = context;

    try {
      const courses = await prisma.courses.findMany({
        where: {
          is_published: true,
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          title: true,
          description: true,
          level: true,
        },
        take: limit,
      });

      return courses.map((course) => ({
        id: course.id,
        title: course.title,
        category: "articulos" as const,
        description:
          course.description ||
          `Nivel: ${course.level || "No especificado"}`,
        url: `/courses/${course.id}`,
      }));
    } catch (error) {
      console.error("[SearchAdapter:courses] Error:", error);
      return [];
    }
  },
};
