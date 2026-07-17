//lib/search/adapters/knowledge-sources.adapter.ts

/**
 * Proveedor de búsqueda para artículos de Knowledge.
 *
 * Una knowledge_source representa un artículo, no un documento adjunto.
 * Los documentos físicos pertenecen a knowledge_files.
 */
import { prisma } from "@/lib/prisma";
import type {
  SearchContext,
  SearchProvider,
  SearchResult,
} from "../types";

export const knowledgeSourcesSearchProvider: SearchProvider = {
  id: "knowledge-sources",
  category: "articulos",
  label: "💡 Artículos",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, limit = 10 } = context;

    try {
      const sources = await prisma.knowledge_sources.findMany({
        where: {
          visibility: "public",
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
          knowledge_type: true,
        },
        take: limit,
      });

      return sources.map((source) => ({
        id: source.id,
        title: source.title,
        category: "articulos",
        description:
          source.description ||
          `Tipo: ${source.knowledge_type || "Artículo"}`,
        url: `/knowledge/${source.id}`,
      }));
    } catch (error) {
      console.error("[KnowledgeSourcesSearchProvider] Error:", error);
      return [];
    }
  },
};