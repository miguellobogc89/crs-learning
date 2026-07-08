// app/api/assistant/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccessibleKnowledgeSpaces } from "@/lib/services/knowledge-space.service";
import { buildChatSystemPrompt } from "@/lib/ai/assistant/assistant-personality";
import { retrieveKnowledge } from "@/lib/ai/assistant/retrieval";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "No autorizado" },
      { status: 401 },
    );
  }

  const body = await request.json();

  const message = String(body.message ?? "").trim();
  const conversationId = body.conversationId
    ? String(body.conversationId)
    : null;

  if (!message) {
    return NextResponse.json(
      { error: "El mensaje es obligatorio" },
      { status: 400 },
    );
  }

  const userId = session.user.id;

  const conversation = conversationId
    ? await prisma.chat_conversations.findFirst({
        where: {
          id: conversationId,
          owner_user_id: userId,
        },
      })
    : await prisma.chat_conversations.create({
        data: {
          owner_user_id: userId,
          created_by_user_id: userId,
          updated_by_user_id: userId,
          title: buildConversationTitle(message),
        },
      });

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversación no encontrada" },
      { status: 404 },
    );
  }

const userMessage = await prisma.chat_messages.create({
  data: {
    conversation_id: conversation.id,
    user_id: userId,
    role: "user",
    content: message,
  },
});

const spaces = await listAccessibleKnowledgeSpaces(userId);
const retrievedKnowledge = await retrieveKnowledge(userId, message);

const systemPrompt = `
${buildChatSystemPrompt(spaces)}

# Conocimiento corporativo recuperado para la pregunta actual

La siguiente información procede del Knowledge Hub de la organización del usuario.

Debes tratar este contenido como conocimiento interno real, no como ejemplo ni como suposición.

${retrievedKnowledge.contextText}
`.trim();

const previousMessages = await prisma.chat_messages.findMany({
  where: {
    conversation_id: conversation.id,
    id: {
      not: userMessage.id,
    },
  },
  orderBy: {
    created_at: "desc",
  },
  take: 10,
  select: {
    role: true,
    content: true,
  },
});

const conversationHistory = previousMessages.reverse();

const response = await openai.responses.create({
  model: "gpt-4.1-mini",
  input: [
    {
      role: "system",
      content: systemPrompt,
    },
    ...conversationHistory.map((chatMessage) => ({
      role: normalizeRole(chatMessage.role),
      content: chatMessage.content,
    })),
    {
      role: "user",
      content: `
Pregunta actual del usuario:
${message}

Responde únicamente a esta pregunta actual.

Conocimiento recuperado:
${retrievedKnowledge.contextText}
`.trim(),
    },
  ],
});

  const assistantMessage = response.output_text;

await prisma.chat_messages.create({
  data: {
    conversation_id: conversation.id,
    user_id: userId,
    role: "assistant",
    content: assistantMessage,
    model: "gpt-4.1-mini",
    sources_json: {
      retrievedKnowledge: retrievedKnowledge.items,
    },
  },
});

  await prisma.chat_conversations.update({
    where: {
      id: conversation.id,
    },
    data: {
      updated_at: new Date(),
      updated_by_user_id: userId,
    },
  });

  return NextResponse.json({
    conversationId: conversation.id,
    message: assistantMessage,
  });
}

function normalizeRole(role: string) {
  if (role === "assistant") {
    return "assistant" as const;
  }

  return "user" as const;
}

function buildConversationTitle(message: string) {
  if (message.length <= 60) {
    return message;
  }

  return `${message.slice(0, 57)}...`;
}