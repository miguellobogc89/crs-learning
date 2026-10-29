import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadAnalyticsData } from "@/lib/analytics/data";
import { normalizePurchases } from "./analytics";
import { buildQuestions, type Question } from "./questions";
import { DecisionError, saveDecision } from "./decisions.service";
import { summarize, type Decision } from "./rules";
import { readAnswer } from "./answers";

/**
 * The purchase questions as a conversation of the assistant: one per person and workspace («Preguntas sobre tus
 * facturas»), kept in their list (with an alert while something is pending) whether answered or not. Each question
 * is an assistant message; the person answers by writing («12», «no lo sé», «saltar») and the next one follows.
 * The question being asked travels in the message's sources_json.compras.
 */
export const QUESTIONS_TITLE = "Preguntas sobre tus facturas";
type Meta = { workspaceId: string; lineId?: string; pide?: Question["pide"]; saltadas?: string[] };

async function currentQuestions(workspaceId: string) {
  const { lines, normalized } = normalizePurchases(await loadAnalyticsData(workspaceId));
  const s = summarize(normalized);
  return { questions: buildQuestions(lines, normalized), fixed: s.auto + s.regalo };
}

const metaOf = (sources: unknown): Meta | null => {
  const m = sources && typeof sources === "object" ? (sources as { compras?: unknown }).compras : null;
  return m && typeof m === "object" && typeof (m as Meta).workspaceId === "string" ? m as Meta : null;
};

const count = (n: number, one: string, many: string) => `${n.toLocaleString("es-ES")} ${n === 1 ? one : many}`;

/** The text of a question, as the assistant writes it. */
function questionText(q: Question, position: number, total: number) {
  const hint = q.opciones.length ? ` ¿Quizás ${q.opciones.map(o => o.etiqueta).join(" o ")}?` : "";
  return [`**Pregunta ${position} de ${total}.** ${q.titulo}`, `${q.detalle}${q.documento ? ` [Ver la factura](/api/knowledge/intake/files/${q.documento})` : ""}${hint}`,
    q.pide === "importe" ? "Escríbeme el importe en euros (por ejemplo «18,50»), «no lo sé» o «saltar»." : "Escríbeme el número (por ejemplo «12»), «no lo sé» o «saltar»."].join("\n\n");
}

async function postAssistant(conversationId: string, userId: string, content: string, meta: Meta) {
  const saved = await prisma.chat_messages.create({ data: { conversation_id: conversationId, user_id: userId, role: "assistant", content,
    sources_json: { compras: meta } as unknown as Prisma.InputJsonValue } });
  await prisma.chat_conversations.update({ where: { id: conversationId }, data: { updated_at: new Date(), updated_by_user_id: userId } });
  return saved;
}

async function findConversation(userId: string, workspaceId: string) {
  const message = await prisma.chat_messages.findFirst({ where: { role: "assistant", sources_json: { path: ["compras", "workspaceId"], equals: workspaceId },
    chat_conversations: { owner_user_id: userId } }, orderBy: { created_at: "desc" }, select: { conversation_id: true } });
  if (!message) return null;
  const last = await prisma.chat_messages.findFirst({ where: { conversation_id: message.conversation_id }, orderBy: { created_at: "desc" }, select: { role: true, sources_json: true } });
  return { id: message.conversation_id, pending: last?.role === "assistant" ? metaOf(last.sources_json) : null };
}

/**
 * When the chat opens: the questions conversation, created (or continued with the next question) when there is
 * something to ask. Returns its id and how many questions are pending (0: nothing to do).
 */
export async function ensureQuestionsConversation(userId: string, workspaceId: string): Promise<{ conversationId: string | null; pendientes: number }> {
  const [{ questions, fixed }, existing] = await Promise.all([currentQuestions(workspaceId), findConversation(userId, workspaceId)]);
  if (!questions.length) return { conversationId: existing?.id ?? null, pendientes: 0 };
  // Already asking something still open: leave it as it is.
  if (existing?.pending?.lineId && questions.some(q => q.lineId === existing.pending!.lineId)) return { conversationId: existing.id, pendientes: questions.length };
  const first = questions[0];
  let conversationId = existing?.id;
  let intro = "";
  if (!conversationId) {
    const created = await prisma.chat_conversations.create({ data: { owner_user_id: userId, created_by_user_id: userId, updated_by_user_id: userId, title: QUESTIONS_TITLE } });
    conversationId = created.id;
    intro = `He revisado tus facturas.${fixed ? ` ${count(fixed, "compra que no cuadraba la he arreglado yo", "compras que no cuadraban las he arreglado yo")}.` : ""} Me ${questions.length === 1 ? "queda una pregunta" : `quedan ${questions.length.toLocaleString("es-ES")} preguntas`} para ti; contéstame escribiendo.\n\n`;
  } else intro = `Tengo ${count(questions.length, "pregunta nueva", "preguntas")} sobre tus facturas.\n\n`;
  await postAssistant(conversationId, userId, intro + questionText(first, 1, questions.length), { workspaceId, lineId: first.lineId, pide: first.pide, saltadas: [] });
  return { conversationId, pendientes: questions.length };
}

/**
 * A message written in the questions conversation: if it answers the question asked, the answer is saved and the
 * reply carries the next question. Null when the conversation is not asking anything (the assistant answers as usual).
 */
export async function answerQuestion(input: { userId: string; workspaceId: string; conversationId: string; userMessageId: string; text: string; canWrite: boolean }): Promise<{ content: string; sources: Prisma.InputJsonValue } | null> {
  const last = await prisma.chat_messages.findFirst({ where: { conversation_id: input.conversationId, id: { not: input.userMessageId } }, orderBy: { created_at: "desc" }, select: { role: true, sources_json: true } });
  const meta = last?.role === "assistant" ? metaOf(last.sources_json) : null;
  if (!meta?.lineId || meta.workspaceId !== input.workspaceId) return null;
  const again = (content: string) => ({ content, sources: { compras: meta } as unknown as Prisma.InputJsonValue });
  const answer = readAnswer(input.text, meta.pide ?? "unidades");
  if (answer.tipo === "no_entendido") {
    // A real question or comment («¿por qué me preguntas esto?»): the assistant answers it as usual.
    if (input.text.includes("?") || input.text.trim().split(/\s+/).length > 6) return null;
    return again("No te he entendido. Escríbeme solo el número (por ejemplo «12»), «no lo sé» o «saltar».");
  }
  let saltadas = meta.saltadas ?? [];
  const decision: Decision | null = answer.tipo === "saltar" ? null : answer.decision;
  if (answer.tipo === "saltar") saltadas = [...saltadas, meta.lineId];
  const done = answer.texto;
  if (decision) {
    if (!input.canWrite) return again("Solo el propietario o un administrador del espacio puede confirmar compras.");
    try { await saveDecision({ workspaceId: input.workspaceId, userId: input.userId, lineId: meta.lineId, decision }); }
    catch (error) { if (error instanceof DecisionError) return again(error.message); throw error; }
  }
  const { questions } = await currentQuestions(input.workspaceId);
  const next = questions.filter(q => !saltadas.includes(q.lineId));
  if (!next.length) {
    const content = questions.length ? `${done} Las que has saltado (${questions.length.toLocaleString("es-ES")}) te las volveré a preguntar más adelante.` : `${done} ¡Listo! No me quedan preguntas: tus compras ya cuadran. Gracias.`;
    return { content, sources: { compras: { workspaceId: input.workspaceId } } as unknown as Prisma.InputJsonValue };
  }
  const q = next[0];
  const position = saltadas.length + 1;
  return { content: `${done}\n\n${questionText(q, position, questions.length)}`,
    sources: { compras: { workspaceId: input.workspaceId, lineId: q.lineId, pide: q.pide, saltadas } } as unknown as Prisma.InputJsonValue };
}
