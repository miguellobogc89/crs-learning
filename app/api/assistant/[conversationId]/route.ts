// app/api/assistant/[conversationId]/route.ts
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getChatConversation } from "@/lib/services/chat.service";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      conversationId: string;
    }>;
  },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error: "No autorizado",
      },
      {
        status: 401,
      },
    );
  }

  const { conversationId } = await params;

  const conversation = await getChatConversation(
    session.user.id,
    conversationId,
  );

  if (!conversation) {
    return NextResponse.json(
      {
        error: "Conversación no encontrada",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      messages: conversation.chat_messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.created_at,
      })),
    },
  });
}