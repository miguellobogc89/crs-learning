// lib/services/chat.service.ts

import { prisma } from "@/lib/prisma";

export async function listChatConversations(
  userId: string,
) {
  return prisma.chat_conversations.findMany({
    where: {
      owner_user_id: userId,
    },
    orderBy: {
      updated_at: "desc",
    },
    take: 50,
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

export async function getChatConversation(
  userId: string,
  conversationId: string,
) {
  return prisma.chat_conversations.findFirst({
    where: {
      id: conversationId,
      owner_user_id: userId,
    },
    select: {
      id: true,
      title: true,
      chat_messages: {
        orderBy: {
          created_at: "asc",
        },
        select: {
          id: true,
          role: true,
          content: true,
          created_at: true,
          sources_json: true,
        },
      },
    },
  });
}