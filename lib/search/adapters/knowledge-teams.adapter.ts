//lib/search/adapters/knowledge-teams.adapter.ts

/**
 * Proveedor de búsqueda para equipos.
 */
import { prisma } from "@/lib/prisma";
import type {
  SearchContext,
  SearchProvider,
  SearchResult,
} from "../types";

export const teamsSearchProvider: SearchProvider = {
  id: "knowledge-teams",
  category: "equipos",
  label: "🏢 Equipos",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, limit = 10 } = context;

    try {
      const teams = await prisma.knowledge_teams.findMany({
        where: {
          visibility: "private",
          name: {
            contains: query,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          name: true,
          description: true,
          knowledge_team_members: {
            select: {
              id: true,
            },
          },
        },
        take: limit,
      });

      return teams.map((team) => ({
        id: team.id,
        title: team.name,
        category: "equipos",
        description:
          team.description ||
          `${team.knowledge_team_members.length} miembros`,
        url: `/teams/${team.id}`,
      }));
    } catch (error) {
      console.error("[TeamsSearchProvider] Error:", error);
      return [];
    }
  },
};