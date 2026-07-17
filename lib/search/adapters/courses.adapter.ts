//lib/search/adapters/courses.adapter.ts

/**
 * Proveedor de búsqueda para cursos.
 *
 * Dominio: Learning
 */
import { prisma } from "@/lib/prisma";
import type {
  SearchContext,
  SearchProvider,
  SearchResult,
} from "../types";

export const coursesSearchProvider: SearchProvider = {
  id: "courses",
  category: "cursos",
  label: "🎓 Cursos",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, limit = 10 } = context;

    try {
      const courses = await prisma.courses.findMany({
        where: {
          is_published: true,
          OR: [
            {
              title: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              description: {
                contains: query,
                mode: "insensitive",
              },
            },
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
        category: "cursos",
        description:
          course.description ||
          `Nivel: ${course.level || "No especificado"}`,
        url: `/courses/${course.id}`,
      }));
    } catch (error) {
      console.error("[CoursesSearchProvider] Error:", error);
      return [];
    }
  },
};