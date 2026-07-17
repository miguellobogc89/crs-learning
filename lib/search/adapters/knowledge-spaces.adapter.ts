//lib/search/adapters/knowledge-spaces.adapter.ts

/**
 * Proveedor de búsqueda para espacios y carpetas de Knowledge.
 */
import { prisma } from "@/lib/prisma";
import type {
  SearchContext,
  SearchProvider,
  SearchResult,
} from "../types";

export const spacesSearchProvider: SearchProvider = {
  id: "knowledge-spaces",
  category: "carpetas",
  label: "📁 Carpetas",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, limit = 10 } = context;

    try {
      const spaces = await prisma.knowledge_spaces.findMany({
        where: {
          visibility: "restricted",
          name: {
            contains: query,
            mode: "insensitive",
          },
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
        category: "carpetas",
        description: space.description || "Carpeta",
        url: `/knowledge/space/${space.id}`,
      }));
    } catch (error) {
      console.error("[SpacesSearchProvider] Error:", error);
      return [];
    }
  },
};