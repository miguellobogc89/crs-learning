/**
 * Adaptador de búsqueda para equipos
 * Módulo: Knowledge > Teams
 */

import { prisma } from "@/lib/prisma";
import type { SearchAdapter, SearchContext, SearchResult } from "../types";

export const teamsSearchAdapter: SearchAdapter = {
  id: "knowledge-teams",
  category: "equipos",
  label: "🏢 Equipos",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, limit = 10 } = context;

    try {
      const teams = await prisma.knowledge_teams.findMany({
        where: {
          visibility: "private",
          name: { contains: query, mode: "insensitive" },
        },
        select: {
          id: true,
          name: true,
          description: true,
          knowledge_team_members: {
            select: { id: true },
          },
        },
        take: limit,
      });

      return teams.map((team) => ({
        id: team.id,
        title: team.name,
        category: "equipos" as const,
        description:
          team.description ||
          `${team.knowledge_team_members.length} miembros`,
        url: `/teams/${team.id}`,
      }));
    } catch (error) {
      console.error("[SearchAdapter:knowledge-teams] Error:", error);
      return [];
    }
  },
};
