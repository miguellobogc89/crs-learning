/**
 * Adaptador de búsqueda para bibliotecas
 * Módulo: Knowledge > Libraries
 */

import { prisma } from "@/lib/prisma";
import type { SearchAdapter, SearchContext, SearchResult } from "../types";

export const librariesSearchAdapter: SearchAdapter = {
  id: "knowledge-libraries",
  category: "bibliotecas",
  label: "📚 Bibliotecas",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, limit = 10 } = context;

    try {
      const libraries = await prisma.knowledge_libraries.findMany({
        where: {
          visibility: "restricted",
          name: { contains: query, mode: "insensitive" },
        },
        select: {
          id: true,
          name: true,
          parent_id: true,
          owner_user_id: true,
        },
        take: limit,
      });

      return libraries.map((library) => ({
        id: library.id,
        title: library.name,
        category: "bibliotecas" as const,
        description: library.parent_id ? "Sublibrary" : "Biblioteca",
        url: `/knowledge/library/${library.id}`,
      }));
    } catch (error) {
      console.error("[SearchAdapter:knowledge-libraries] Error:", error);
      return [];
    }
  },
};
