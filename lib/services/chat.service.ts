// lib/services/chat.service.ts
import { prisma } from "@/lib/prisma";

export async function listChatConversations(userId: string) {
  return prisma.chat_conversations.findMany({
    where: {
      owner_user_id: userId,
    },
    orderBy: {
      updated_at: "desc",
    },
    select: {
      id: true,
      title: true,
      scope_type: true,
      scope_library_id: true,
      created_at: true,
      updated_at: true,
      knowledge_libraries: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}