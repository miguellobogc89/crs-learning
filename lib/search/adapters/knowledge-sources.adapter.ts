/**
 * Adaptador de búsqueda para documentos/knowledge sources
 * Módulo: Knowledge
 */

import { prisma } from "@/lib/prisma";
import type { SearchAdapter, SearchContext, SearchResult } from "../types";

export const knowledgeSourcesSearchAdapter: SearchAdapter = {
  id: "knowledge-sources",
  category: "documentos",
  label: "📄 Documentos",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, limit = 10 } = context;

    try {
      const sources = await prisma.knowledge_sources.findMany({
        where: {
          visibility: "public",
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
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
        category: "documentos" as const,
        description:
          source.description ||
          `Tipo: ${source.knowledge_type || "Documento"}`,
        url: `/knowledge/${source.id}`,
      }));
    } catch (error) {
      console.error("[SearchAdapter:knowledge-sources] Error:", error);
      return [];
    }
  },
};
