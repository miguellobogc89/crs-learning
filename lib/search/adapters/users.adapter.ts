//lib/search/adapters/users.adapter.ts

import { listVisibleUsersForViewer } from "@/lib/services/user-profile.service";
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
    const { query, userId, limit = 10 } = context;

    try {
      const users = await listVisibleUsersForViewer({
        viewerUserId: userId,
        query,
        limit,
      });

      return users.map((user) => ({
        id: user.id,
        title: user.name || user.email,
        category: "usuarios",
        description: user.email,
        avatar: user.image ?? undefined,
        url: `/users/${user.id}`,
      }));
    } catch (error) {
      console.error("[UsersSearchProvider] Error:", error);
      return [];
    }
  },
};
