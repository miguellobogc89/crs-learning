//app/api/assistant/route.ts
 
import { answerQuestion } from "@/lib/purchases/conversation.service";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import type {
  Response as ModelResponse,
  ResponseFunctionToolCall,
  ResponseInput,
} from "openai/resources/responses/responses";

import { auth } from "@/auth";
import { buildChatSystemPrompt } from "@/lib/ai/assistant/assistant-personality";
import {
  retrieveKnowledge,
  type RetrievedKnowledgeItem,
} from "@/lib/ai/assistant/retrieval";
import { prisma } from "@/lib/prisma";
import { listAccessibleKnowledgeSpaces } from "@/lib/services/knowledge-space.service";
import { recordResourceAccess } from "@/lib/services/resource-access.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { resolveRetrievalQuery } from "@/lib/ai/assistant/resolve-retrieval-query";
import { getOpenAIModel } from "@/lib/ai/openai";
import {
  CHANGES_TOOL_NAME,
  changesTool,
  DATA_TOOL_NAME,
  dataPrompt,
  dataTool,
  executeDataTool,
  extractDataBlocks,
  type DataBlock,
} from "@/lib/assistant/data/tools";
import {
  extractProposals,
  loadWorkspaceData,
  proposeChanges,
  type Proposal,
  type WorkspaceData,
} from "@/lib/assistant/changes/service";

/** Tool rounds per message (each round can run several queries). */
const MAX_TOOL_ROUNDS = 6;

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
  const { activeWorkspace } = await getActiveWorkspaceContext(userId);

  let conversation;

  if (conversationId) {
    conversation =
      await prisma.chat_conversations.findFirst({
        where: {
          id: conversationId,
          owner_user_id: userId,
          OR: [
            {
              scope_library_id: null,
            },
            {
              knowledge_libraries: {
                workspace_id: activeWorkspace.id,
              },
            },
          ],
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

  await recordResourceAccess({
    userId,
    workspaceId: activeWorkspace.id,
    resourceType: "chat_conversation",
    resourceId: conversation.id,
    interactionType: "messaged",
  });

  // An answer to a question about the purchases (lib/purchases): saved, and the next question follows.
  if (conversationId) {
    const answered = await answerQuestion({ userId, workspaceId: activeWorkspace.id, conversationId: conversation.id, userMessageId: userMessage.id, text: message,
      canWrite: activeWorkspace.role === "owner" || activeWorkspace.role === "admin" });
    if (answered) {
      const saved = await prisma.chat_messages.create({ data: { conversation_id: conversation.id, user_id: userId, role: "assistant", content: answered.content, sources_json: answered.sources } });
      await prisma.chat_conversations.update({ where: { id: conversation.id }, data: { updated_at: new Date(), updated_by_user_id: userId } });
      return NextResponse.json({ conversationId: conversation.id, message: { id: saved.id, role: "assistant", content: answered.content, sources: [], dataBlocks: [], proposals: [] } });
    }
  }

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
        sources_json: true,
      },
    });

  // Data shown in earlier answers is named in the history, so follow-ups ("¿y de esos…?") keep their context.
  const conversationHistory =
    previousMessages.reverse().map((item: { role: string; content: string; sources_json: unknown }) => {
      const shown = extractDataBlocks(item.sources_json);
      const proposed = extractProposals(item.sources_json);
      const notes = [
        shown.length ? `[Datos mostrados: ${shown.map((b) => `«${b.titulo}» (${b.total} filas, tablas ${b.tablas.join(" + ")})`).join("; ")}]` : "",
        proposed.length ? `[Propuestas de cambio: ${proposed.map((p) => `«${p.titulo}» (${p.estado}${p.objetivo ? `, paso ${p.objetivo.actual} de ${p.objetivo.pasos.length}: ${p.objetivo.pasos.join(" → ")}` : ""})`).join("; ")}]` : "",
      ].filter(Boolean);
      return {
        role: item.role,
        content: notes.length ? `${item.content}\n\n${notes.join("\n")}` : item.content,
      };
    });

  const spaces =
    await listAccessibleKnowledgeSpaces(userId);

  const retrievalQuery =
    await resolveRetrievalQuery({
      message,
      history: conversationHistory,
    });

const [retrievedKnowledge, workspaceData] = await Promise.all([
  retrieveKnowledge(
    userId,
    activeWorkspace.id,
    retrievalQuery,
  ),
  // The workspace's tables (read-only). Without them the assistant still answers from documents.
  loadWorkspaceData(activeWorkspace.id).catch((error: unknown): WorkspaceData | null => {
    console.warn("[assistant] tablas no disponibles:", error instanceof Error ? error.message : error);
    return null;
  }),
]);
const tables = workspaceData?.tables ?? [];

  const messageSources = buildMessageSources(
    retrievedKnowledge.items,
  );

  const systemPrompt = [
    buildSystemPrompt({
      spaces,
      contextText: retrievedKnowledge.contextText,
    }),
    tables.length ? dataPrompt(tables, new Set(workspaceData!.ctx.types.filter((t) => t.editable).map((t) => t.tableKey)))
      : "# Datos del espacio de trabajo\n\nAhora mismo no tienes acceso a las tablas de datos. Si te piden cifras, tablas o cambios en los datos, di que no están disponibles en este momento; no inventes ni propongas nada.",
  ].filter(Boolean).join("\n\n");

console.log("AI INPUT DEBUG", {
  systemPromptChars: systemPrompt.length,
  retrievalContextChars:
    retrievedKnowledge.contextText.length,
  historyMessages: conversationHistory.length,
  historyChars: conversationHistory.reduce(
    (total, item) => total + item.content.length,
    0,
  ),
  questionChars: message.length,
});



  // The model may query the data (one or more rounds) before answering.
  let input: ResponseInput = [
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
        }),
      },
    ];
  const dataBlocks: DataBlock[] = [];
  const proposals: Proposal[] = [];
  let nudged = false;
  let nudgedAsk = false;
  let lastProposalErrors: string[] = [];
  let dataQueries = 0;
  let tokensInput = 0;
  let tokensOutput = 0;
  let response: ModelResponse;
  for (let round = 0; ; round += 1) {
    const useTools = tables.length > 0 && round < MAX_TOOL_ROUNDS;
    response = await openai.responses.create({
      model: assistantModel(),
      input,
      stream: false,
      ...(useTools ? { tools: [dataTool, changesTool] } : {}),
    });
    tokensInput += response.usage?.input_tokens ?? 0;
    tokensOutput += response.usage?.output_tokens ?? 0;
    const calls = response.output.filter(
      (item): item is ResponseFunctionToolCall => item.type === "function_call",
    );
    // The model sometimes describes a proposal it never made: make it actually prepare it (once).
    if (!calls.length && useTools && !nudged && !proposals.length && workspaceData && claimsProposal(response.output_text)) {
      nudged = true;
      console.info("[assistant] propuesta descrita sin crear; se pide prepararla", JSON.stringify({ errores: lastProposalErrors.slice(0, 3) }));
      input = [...input, ...(response.output as ResponseInput), { role: "system", content: lastProposalErrors.length
        ? `Tu propuesta NO se ha creado porque tenía errores: ${lastProposalErrors.join(" · ")}. Corrígela y vuelve a llamar a «${CHANGES_TOOL_NAME}». Si no puedes corregirla, explica al usuario qué falla; no digas que está lista.`
        : `Has descrito una propuesta de cambios pero no has llamado a «${CHANGES_TOOL_NAME}», así que no existe y el usuario no puede aplicarla. Llama ahora a «${CHANGES_TOOL_NAME}» con esa propuesta (o, si no procede, responde sin hablar de propuestas).` }];
      continue;
    }
    // Asking permission instead of building («¿quieres que lo prepare?»): the method says prepare the first step now.
    if (!calls.length && useTools && !nudgedAsk && !proposals.length && workspaceData && asksPermission(response.output_text)) {
      nudgedAsk = true;
      console.info("[assistant] pide permiso en vez de construir; se le pide preparar el primer paso");
      input = [...input, ...(response.output as ResponseInput), { role: "system", content:
        `No preguntes si el usuario quiere que lo prepares: según tu método, decide tú la estructura que falta y prepara AHORA la propuesta del primer paso con «${CHANGES_TOOL_NAME}» (indicando «pasos_del_objetivo» y «paso_actual»). Empieza la respuesta explicando en una o dos frases el camino completo y por qué empiezas por ese paso. Si de verdad no hace falta construir nada, responde sin ofrecerlo.` }];
      continue;
    }
    if (!calls.length || !useTools) break;
    const outputs = calls.map((call) => {
      if (call.name === CHANGES_TOOL_NAME && workspaceData) {
        dataQueries += 1;
        let args: Parameters<typeof proposeChanges>[1];
        try { args = JSON.parse(call.arguments); } catch { args = {}; }
        const { plan, proposal } = proposeChanges(workspaceData.ctx, args);
        if (proposal) proposals.push(proposal);
        lastProposalErrors = proposal ? [] : plan.errores;
        console.info("[assistant] proponer_cambios", JSON.stringify(proposal ? { ok: true, cifras: plan.cifras } : { ok: false, errores: plan.errores.slice(0, 3) }));
        return { type: "function_call_output" as const, call_id: call.call_id, output: JSON.stringify(proposal
          ? { estado: "propuesta mostrada al usuario, PENDIENTE de que pulse «Aplicar»", pasos: plan.pasos.map((p) => ({ paso: p.texto, avisos: p.avisos })), cifras: plan.cifras,
              por_completar_por_el_usuario: plan.pendientes.map((x) => `${x.nombreTabla} · ${x.nombreColumna}: ${x.filas} filas (en /analytics?view=tablas&table=${encodeURIComponent(x.tabla)}&pendiente=${encodeURIComponent(x.columna)})`) }
          : { errores: plan.errores }) };
      }
      if (call.name !== DATA_TOOL_NAME) {
        return { type: "function_call_output" as const, call_id: call.call_id, output: JSON.stringify({ error: `Herramienta desconocida: ${call.name}` }) };
      }
      dataQueries += 1;
      const result = executeDataTool(tables, call.arguments, `D${dataBlocks.length + 1}`);
      if (result.block) dataBlocks.push(result.block);
      if (result.output.startsWith('{"error"')) console.info("[assistant] consultar_datos", result.output.slice(0, 300));
      return { type: "function_call_output" as const, call_id: call.call_id, output: result.output };
    });
    input = [...input, ...(response.output as ResponseInput), ...outputs];
  }

  console.info("[assistant] mensaje", JSON.stringify({ modelo: assistantModel(), tablas: tables.length, herramientas: dataQueries, propuestas: proposals.length, datos: dataBlocks.length }));
  // Never leave the person waiting for a card that does not exist.
  if (!proposals.length && claimsProposal(response.output_text)) {
    console.warn("[assistant] la respuesta habla de una propuesta que no existe", JSON.stringify({ errores: lastProposalErrors.slice(0, 3) }));
    response.output_text = `${response.output_text.trim()}\n\n> ⚠️ **No se ha podido preparar la propuesta**, así que no hay nada que aplicar todavía.${lastProposalErrors.length ? ` Motivo: ${lastProposalErrors[0]}` : ""} Pídemela de nuevo, si puede ser con más detalle.`;
  }

  let assistantMessage =
    response.output_text.trim() || (proposals.length ? "He preparado la propuesta: revísala y pulsa «Aplicar» si te parece bien." : dataBlocks.length ? "Aquí tienes los datos." : "No he podido generar una respuesta.");

  const availableCitationIds =
    retrievedKnowledge.items.map(
      (item) => item.citationId,
    );

  const citationValidation =
    validateCitations(
      assistantMessage,
      availableCitationIds,
    );

  // An answer built from the data has no [F…] citations by design: never "repair" it against the documents.
  if (
    dataQueries === 0 &&
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
      model: assistantModel(),

      tokens_input: tokensInput || null,

      tokens_output: tokensOutput || null,

      sources_json: {
        retrievedKnowledge: messageSources,
        citedSourceIds:
          finalCitationValidation.citedIds,
        citationsValid:
          finalCitationValidation.isValid,
        dataBlocks,
        dataQueries,
        proposals,
      } as unknown as Prisma.InputJsonValue,
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
      dataBlocks,
      proposals: extractProposals({ proposals }),
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
}: {
  message: string;
}) {
  return `
Pregunta actual del usuario:

${message}

Responde únicamente a esta pregunta.

Usa el conocimiento corporativo recuperado como fuente de verdad para cualquier hecho específico de la organización.

Si el usuario pide explicar, interpretar, simplificar, desarrollar o ejemplificar un concepto presente en el conocimiento recuperado, puedes usar tu conocimiento general y capacidad de razonamiento para hacerlo.

Distingue claramente los hechos obtenidos del Knowledge Hub de las explicaciones, razonamientos o ejemplos que generes para ayudar al usuario.

No inventes hechos corporativos, políticas, procedimientos, herramientas, responsables, permisos ni plazos que no estén respaldados por el conocimiento recuperado.

Cita con [F1], [F2], etc. únicamente las afirmaciones que procedan del conocimiento recuperado. No atribuyas una cita del Knowledge Hub a un ejemplo o explicación creada por ti.


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
      model: getOpenAIModel(),
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

/** The answer offers to build something instead of building it. */
function asksPermission(text: string) {
  return /(quieres|te gustar[ií]a|deseas|prefieres)\s+que\s+(te\s+|lo\s+|la\s+|los\s+|las\s+)?(prepare|cree|haga|construya|monte|proponga|organice|configure)|si\s+quieres,?\s+(te\s+)?(puedo|lo\s+preparo|preparo|creo)|puedo\s+ayudarte\s+a\s+(crear|preparar|construir|montar|organizar)/i.test(text);
}

/** The answer talks about a change proposal ready to apply. */
function claimsProposal(text: string) {
  return /propuesta/i.test(text) && /(lista|preparad|revis|aplic)/i.test(text) || /pulsa[^.]{0,20}«?aplicar|bot[oó]n[^.]{0,10}«?aplicar/i.test(text);
}

/** The assistant can use its own (more capable) model: OPENAI_ASSISTANT_MODEL, or the general one. */
function assistantModel() {
  return process.env.OPENAI_ASSISTANT_MODEL?.trim() || getOpenAIModel();
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
