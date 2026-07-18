// lib/ai/openai.ts
import OpenAI from "openai";

let openAIClient: OpenAI | null = null;

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "No se ha configurado la variable de entorno OPENAI_API_KEY",
    );
  }

  if (!openAIClient) {
    openAIClient = new OpenAI({
      apiKey,
    });
  }

  return openAIClient;
}

/**
 * Alias de compatibilidad para servicios anteriores.
 */
export function getOpenAI() {
  return getOpenAIClient();
}

export function getKnowledgeImportModel() {
  const model =
    process.env.OPENAI_KNOWLEDGE_IMPORT_MODEL;

  if (!model) {
    throw new Error(
      "No se ha configurado OPENAI_KNOWLEDGE_IMPORT_MODEL",
    );
  }

  return model;
}