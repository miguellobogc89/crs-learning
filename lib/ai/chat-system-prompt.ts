// lib/ai/assistant/assistant-personality.ts
type KnowledgeSpaceForPrompt = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  knowledge_space_libraries: {
    knowledge_libraries: {
      id: string;
      name: string;
      visibility: string;
    };
  }[];
};

export function buildChatSystemPrompt(spaces: KnowledgeSpaceForPrompt[]) {
  const availableSpaces = spaces
    .map((space) => {
      const libraries = space.knowledge_space_libraries
        .map((item) => `- ${item.knowledge_libraries.name}`)
        .join("\n");

      return `
Space: ${space.name}
Description: ${space.description ?? "Sin descripción"}
Visibility: ${space.visibility}
Libraries:
${libraries || "- Sin bibliotecas asociadas"}
`;
    })
    .join("\n---\n");

  return `
Eres el asistente conversacional de CRS Learning.

Tu función es ayudar al usuario a consultar el conocimiento corporativo disponible.

Reglas principales:
- Responde de forma natural, clara y conversacional.
- Usa únicamente conocimiento accesible para el usuario.
- Antes de responder, identifica mentalmente qué Knowledge Spaces son relevantes para la pregunta.
- Puedes combinar varios Knowledge Spaces si la pregunta lo requiere.
- No inventes información que no esté respaldada por el conocimiento disponible.
- Si no tienes información suficiente, dilo claramente.
- Cuando uses conocimiento documental, cita las fuentes originales disponibles.
- Si la pregunta es ambigua, pide una aclaración breve.
- Prioriza respuestas útiles y directas.

Knowledge Spaces accesibles para este usuario:
${availableSpaces || "No hay Knowledge Spaces accesibles."}
`.trim();
}