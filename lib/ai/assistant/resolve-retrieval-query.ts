// lib/ai/assistant/resolve-retrieval-query.ts
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ConversationMessage = {
  role: string;
  content: string;
};

type ResolveRetrievalQueryInput = {
  message: string;
  history: ConversationMessage[];
};

export async function resolveRetrievalQuery({
  message,
  history,
}: ResolveRetrievalQueryInput) {
  if (history.length === 0) {
    return message;
  }

  const recentHistory = history
    .slice(-6)
    .map((item) => {
      const role =
        item.role === "assistant"
          ? "Asistente"
          : "Usuario";

      return `${role}: ${item.content}`;
    })
    .join("\n\n");

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",

    input: [
      {
        role: "system",
        content: `
Tu única función es preparar consultas para un sistema de recuperación de conocimiento.

Recibirás:
- el historial reciente de una conversación;
- la pregunta actual del usuario.

Convierte la pregunta actual en una consulta autónoma que pueda entenderse sin leer el historial.

Reglas:

- Conserva exactamente la intención de la pregunta actual.
- Resuelve referencias como "eso", "esa", "su", "lo anterior", "esa fórmula", "ese procedimiento" o similares usando el historial.
- Incluye en la consulta los conceptos concretos necesarios para recuperar información relevante.
- No respondas a la pregunta.
- No añadas información que no aparezca en la conversación.
- No inventes nombres, conceptos, procesos ni detalles.
- Si la pregunta actual ya es autónoma, devuélvela prácticamente sin cambios.
- Devuelve únicamente la consulta resultante.
`.trim(),
      },
      {
        role: "user",
        content: `
Historial reciente:

${recentHistory}

Pregunta actual:

${message}
`.trim(),
      },
    ],
  });

  const resolvedQuery =
    response.output_text.trim();

  if (!resolvedQuery) {
    return message;
  }

  return resolvedQuery;
}