/**
 * Adaptador de búsqueda para espacios/carpetas
 * Módulo: Knowledge > Spaces
 */

import { prisma } from "@/lib/prisma";
import type { SearchAdapter, SearchContext, SearchResult } from "../types";

export const spacesSearchAdapter: SearchAdapter = {
  id: "knowledge-spaces",
  category: "carpetas",
  label: "📁 Carpetas",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, limit = 10 } = context;

    try {
      const spaces = await prisma.knowledge_spaces.findMany({
        where: {
          visibility: "restricted",
          name: { contains: query, mode: "insensitive" },
        },
        select: {
          id: true,
          name: true,
          description: true,
        },
        take: limit,
      });

      return spaces.map((space) => ({
        id: space.id,
        title: space.name,
        category: "carpetas" as const,
        description: space.description || "Espacio",
        url: `/knowledge/space/${space.id}`,
      }));
    } catch (error) {
      console.error("[SearchAdapter:knowledge-spaces] Error:", error);
      return [];
    }
  },
};
