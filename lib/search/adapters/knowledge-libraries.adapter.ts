//lib/search/adapters/knowledge-libraries.adapter.ts

/**
 * Proveedor de búsqueda para bibliotecas de Knowledge.
 */
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryReadWhere } from "@/lib/knowledge/access-control";
import type {
  SearchContext,
  SearchProvider,
  SearchResult,
} from "../types";

export const librariesSearchProvider: SearchProvider = {
  id: "knowledge-libraries",
  category: "bibliotecas",
  label: "📚 Bibliotecas",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, userId, workspaceId, limit = 10 } = context;

    try {
      const libraries = await prisma.knowledge_libraries.findMany({
        where: {
          AND: [
            knowledgeLibraryReadWhere(userId, workspaceId),
            {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
          ],
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
        category: "bibliotecas",
        description: library.parent_id
          ? "Biblioteca secundaria"
          : "Biblioteca",
        url: `/knowledge/library/${library.id}`,
      }));
    } catch (error) {
      console.error("[LibrariesSearchProvider] Error:", error);
      return [];
    }
  },
};
