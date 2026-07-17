import { NextResponse } from "next/server";
import OpenAI from "openai";

import { auth } from "@/auth";
import { buildChatSystemPrompt } from "@/lib/ai/assistant/assistant-personality";
import {
  retrieveKnowledge,
  type RetrievedKnowledgeItem,
} from "@/lib/ai/assistant/retrieval";
import { prisma } from "@/lib/prisma";
import { listAccessibleKnowledgeSpaces } from "@/lib/services/knowledge-space.service";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
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

  const body = await request.json();

  const message = String(body.message ?? "").trim();

  let conversationId: string | null = null;

  if (body.conversationId) {
    conversationId = String(body.conversationId);
  }

  if (!message) {
    return NextResponse.json(
      {
        error: "El mensaje es obligatorio",
      },
      {
        status: 400,
      },
    );
  }

  const userId = session.user.id;

  let conversation;

  if (conversationId) {
    conversation =
      await prisma.chat_conversations.findFirst({
        where: {
          id: conversationId,
          owner_user_id: userId,
        },
      });
  } else {
    conversation =
      await prisma.chat_conversations.create({
        data: {
          owner_user_id: userId,
          created_by_user_id: userId,
          updated_by_user_id: userId,
          title: buildConversationTitle(message),
        },
      });
  }

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

  const userMessage =
    await prisma.chat_messages.create({
      data: {
        conversation_id: conversation.id,
        user_id: userId,
        role: "user",
        content: message,
      },
    });

  const spaces =
    await listAccessibleKnowledgeSpaces(userId);

  const retrievedKnowledge = await retrieveKnowledge(
    userId,
    message,
  );

  const messageSources = buildMessageSources(
    retrievedKnowledge.items,
  );

  const systemPrompt = buildSystemPrompt({
    spaces,
    contextText: retrievedKnowledge.contextText,
  });

  const previousMessages =
    await prisma.chat_messages.findMany({
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

  const conversationHistory =
    previousMessages.reverse();

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...conversationHistory.map(
        (chatMessage) => ({
          role: normalizeRole(chatMessage.role),
          content: chatMessage.content,
        }),
      ),
      {
        role: "user",
        content: buildCurrentQuestionPrompt({
          message,
          contextText:
            retrievedKnowledge.contextText,
        }),
      },
    ],
  });

  let assistantMessage =
    response.output_text.trim();

  const availableCitationIds =
    retrievedKnowledge.items.map(
      (item) => item.citationId,
    );

  const citationValidation =
    validateCitations(
      assistantMessage,
      availableCitationIds,
    );

  if (
    retrievedKnowledge.items.length > 0 &&
    !citationValidation.isValid
  ) {
    assistantMessage =
      await repairAnswerCitations({
        answer: assistantMessage,
        question: message,
        contextText:
          retrievedKnowledge.contextText,
        availableCitationIds,
        validationErrors:
          citationValidation.errors,
      });
  }

  const finalCitationValidation =
    validateCitations(
      assistantMessage,
      availableCitationIds,
    );

  if (
    retrievedKnowledge.items.length > 0 &&
    !finalCitationValidation.isValid
  ) {
    console.warn(
      "Assistant answer returned with invalid citations:",
      finalCitationValidation.errors,
    );
  }

  const savedAssistantMessage =
    await prisma.chat_messages.create({
      data: {
        conversation_id: conversation.id,
        user_id: userId,
        role: "assistant",
        content: assistantMessage,
        model: "gpt-4.1-mini",
        sources_json: {
          retrievedKnowledge: messageSources,
          citedSourceIds:
            finalCitationValidation.citedIds,
          citationsValid:
            finalCitationValidation.isValid,
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
    message: {
      id: savedAssistantMessage.id,
      role: "assistant",
      content: assistantMessage,
      sources: messageSources,
    },
  });
}

function buildSystemPrompt({
  spaces,
  contextText,
}: {
  spaces: Awaited<
    ReturnType<
      typeof listAccessibleKnowledgeSpaces
    >
  >;
  contextText: string;
}) {
  return `
${buildChatSystemPrompt(spaces)}

# Conocimiento corporativo recuperado

La información incluida a continuación procede del Knowledge Hub de la organización del usuario.

Debes tratar este contenido como conocimiento corporativo real y accesible para este usuario.

No debes inventar información que no aparezca en las fuentes recuperadas.

# Normas obligatorias de citación

Cada fragmento recuperado tiene un identificador como [Fuente F1], [Fuente F2] o [Fuente F3].

Cuando utilices información de un fragmento, cita la afirmación usando exactamente su identificador:

[F1]
[F2]
[F1][F3]

Coloca cada cita inmediatamente después de la afirmación que respalda.

No incluyas una sección de fuentes al final. La interfaz mostrará las fuentes automáticamente.

No cites una fuente que no respalde realmente la afirmación.

No inventes identificadores de fuentes.

Si varias fuentes respaldan una afirmación, puedes citar varias.

Si las fuentes contienen versiones contradictorias, expón ambas versiones y cita cada una por separado.

Si no existe conocimiento suficiente para responder, indícalo claramente sin completar la respuesta mediante conocimiento general.

# Fragmentos disponibles

${contextText}
`.trim();
}

function buildCurrentQuestionPrompt({
  message,
  contextText,
}: {
  message: string;
  contextText: string;
}) {
  return `
Pregunta actual del usuario:

${message}

Responde únicamente a esta pregunta.

Utiliza exclusivamente el conocimiento corporativo recuperado para esta petición.

Cita cada afirmación relevante con el identificador correspondiente, por ejemplo [F1] o [F1][F2].

Conocimiento recuperado:

${contextText}
`.trim();
}

async function repairAnswerCitations({
  answer,
  question,
  contextText,
  availableCitationIds,
  validationErrors,
}: {
  answer: string;
  question: string;
  contextText: string;
  availableCitationIds: string[];
  validationErrors: string[];
}) {
  const repairResponse =
    await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `
Eres un revisor de respuestas corporativas.

Debes corregir exclusivamente las citas de la respuesta proporcionada.

No añadas información nueva.

No cambies el significado de la respuesta salvo que una afirmación no esté respaldada por las fuentes.

Elimina cualquier afirmación que no pueda justificarse mediante el contexto disponible.

Los únicos identificadores permitidos son:

${availableCitationIds.join(", ")}

Cada afirmación basada en el contexto debe llevar su cita inmediatamente después.

No incluyas una sección final de fuentes.

Devuelve únicamente la respuesta corregida.
`.trim(),
        },
        {
          role: "user",
          content: `
Pregunta original:

${question}

Problemas detectados:

${validationErrors.join("\n")}

Respuesta que debes corregir:

${answer}

Fuentes disponibles:

${contextText}
`.trim(),
        },
      ],
    });

  return repairResponse.output_text.trim();
}

function validateCitations(
  answer: string,
  availableCitationIds: string[],
) {
  const availableIds = new Set(
    availableCitationIds,
  );

  const citedIds = extractCitationIds(answer);
  const errors: string[] = [];

  if (
    availableCitationIds.length > 0 &&
    citedIds.length === 0
  ) {
    errors.push(
      "La respuesta no contiene ninguna cita.",
    );
  }

  for (const citedId of citedIds) {
    if (!availableIds.has(citedId)) {
      errors.push(
        `La cita [${citedId}] no existe entre las fuentes disponibles.`,
      );
    }
  }

  return {
    isValid: errors.length === 0,
    citedIds,
    errors,
  };
}

function extractCitationIds(answer: string) {
  const citationPattern = /\[(F\d+)\]/g;
  const citedIds = new Set<string>();

  let match = citationPattern.exec(answer);

  while (match) {
    citedIds.add(match[1]);
    match = citationPattern.exec(answer);
  }

  return Array.from(citedIds);
}

function normalizeRole(role: string) {
  if (role === "assistant") {
    return "assistant" as const;
  }

  return "user" as const;
}

function buildConversationTitle(
  message: string,
) {
  if (message.length <= 60) {
    return message;
  }

  return `${message.slice(0, 57)}...`;
}

function buildMessageSources(
  items: RetrievedKnowledgeItem[],
) {
  return items.map((item) => ({
    citationId: item.citationId,
    knowledgeSourceId:
      item.knowledgeSourceId,
    title: item.title,
    description: item.description,
    libraryId: item.libraryId,
    libraryName: item.libraryName,
    sourceType: item.sourceType,
    fileName: item.fileName,
    documentName: item.documentName,
    score: item.score,
  }));
}