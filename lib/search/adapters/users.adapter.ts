/**
 * Adaptador de búsqueda para usuarios
 * Módulo: Users
 */

import { prisma } from "@/lib/prisma";
import type { SearchAdapter, SearchContext, SearchResult } from "../types";

export const usersSearchAdapter: SearchAdapter = {
  id: "users",
  category: "usuarios",
  label: "👥 Usuarios",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, limit = 10 } = context;

    try {
      const users = await prisma.users.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
        take: limit,
      });

      return users.map((user) => ({
        id: user.id,
        title: user.name || user.email || "Usuario sin nombre",
        category: "usuarios" as const,
        description: user.email,
        avatar: user.image || undefined,
        url: `/users/${user.id}`,
      }));
    } catch (error) {
      console.error("[SearchAdapter:users] Error:", error);
      return [];
    }
  },
};
