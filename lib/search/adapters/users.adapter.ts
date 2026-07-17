//lib/search/adapters/users.adapter.ts
import { prisma } from "@/lib/prisma";
import type {
  SearchContext,
  SearchProvider,
  SearchResult,
} from "../types";

export const usersSearchProvider: SearchProvider = {
  id: "users",

  category: "usuarios",

  label: "👤 Usuarios",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, limit = 10 } = context;

    try {
      const users = await prisma.users.findMany({
        where: {
          OR: [
            {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: query,
                mode: "insensitive",
              },
            },
          ],
        },
        take: limit,
      });

      return users.map((user) => ({
        id: user.id,
        title: user.name || user.email,
        category: "usuarios",
        description: user.email,
        url: `/users/${user.id}`,
      }));
    } catch (error) {
      console.error("[UsersSearchProvider]", error);
      return [];
    }
  },
};