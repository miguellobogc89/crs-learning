// app/api/assistant/[conversationId]/route.ts

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getChatConversation } from "@/lib/services/chat.service";

type StoredSource = {
  citationId: string;
  knowledgeSourceId: string;
  title: string;
  description: string | null;
  libraryId: string | null;
  libraryName: string | null;
  sourceType: "analysis" | "manual" | "file";
  fileName: string | null;
  score: number;
};

export async function GET(
  _request: Request,
  context: {
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

  const { conversationId } = await context.params;

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
      messages: conversation.chat_messages.map(
        (message) => ({
          id: message.id,
          role: normalizeRole(message.role),
          content: message.content,
          createdAt: message.created_at,
          sources: extractSources(message.sources_json),
        }),
      ),
    },
  });
}

function normalizeRole(role: string) {
  if (role === "assistant") {
    return "assistant" as const;
  }

  return "user" as const;
}

function extractSources(value: unknown): StoredSource[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const sourceRecord = value as {
    retrievedKnowledge?: unknown;
  };

  if (!Array.isArray(sourceRecord.retrievedKnowledge)) {
    return [];
  }

  return sourceRecord.retrievedKnowledge.filter(
    isStoredSource,
  );
}

function isStoredSource(
  value: unknown,
): value is StoredSource {
  if (!value || typeof value !== "object") {
    return false;
  }

  const source = value as Partial<StoredSource>;

  return (
    typeof source.citationId === "string" &&
    typeof source.knowledgeSourceId === "string" &&
    typeof source.title === "string" &&
    typeof source.sourceType === "string" &&
    typeof source.score === "number"
  );
}