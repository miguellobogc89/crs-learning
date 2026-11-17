// lib/finance/ai.ts
// Única puerta de CRS Finance a la IA (hoy OpenAI, como Trading).
// Variables de entorno (opcionales): FINANCE_AI_MODEL (por defecto OPENAI_MODEL) y FINANCE_AI_FAST_MODEL
// (para clasificar e importar; por defecto TRADING_AI_FAST_MODEL, OPENAI_DOCUMENT_CLASSIFIER_MODEL u OPENAI_MODEL).
import "server-only";
import { getOpenAIClient } from "@/lib/ai/openai";

export type FinanceAiTier = "fast" | "smart";

export function financeModel(tier: FinanceAiTier) {
  const env = process.env;
  const model = tier === "fast"
    ? env.FINANCE_AI_FAST_MODEL?.trim() || env.TRADING_AI_FAST_MODEL?.trim() || env.OPENAI_DOCUMENT_CLASSIFIER_MODEL?.trim() || env.OPENAI_MODEL?.trim()
    : env.FINANCE_AI_MODEL?.trim() || env.OPENAI_MODEL?.trim();
  if (!model) throw new Error("No hay modelo de IA configurado (FINANCE_AI_MODEL u OPENAI_MODEL)");
  return model;
}

/** Los modelos de razonamiento aceptan `reasoning.effort`; el resto no. */
export const isReasoningModel = (model: string) => /^gpt-5(?:[.-]|$)|^o[134](?:[.-]|$)/.test(model) && !/-pro|-chat|-codex/.test(model);

export function aiAvailable() {
  return Boolean(process.env.OPENAI_API_KEY && (process.env.FINANCE_AI_MODEL || process.env.OPENAI_MODEL));
}

/** Llamada con salida JSON validada por esquema estricto. */
export async function financeJson<T>(opts: {
  tier: FinanceAiTier;
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<T> {
  const model = financeModel(opts.tier);
  const response = await getOpenAIClient().responses.create(
    {
      model,
      instructions: opts.instructions,
      ...(isReasoningModel(model) ? { reasoning: { effort: "low" as const } } : {}),
      input: [{ role: "user", content: [{ type: "input_text", text: opts.input }] }],
      text: { format: { type: "json_schema", name: opts.schemaName, strict: true, schema: opts.schema } },
      max_output_tokens: opts.maxOutputTokens ?? 8000,
    },
    { timeout: opts.timeoutMs ?? 60_000, maxRetries: 1 },
  );
  if (response.status !== "completed" || !response.output_text?.trim()) throw new Error("La IA no completó la respuesta");
  return JSON.parse(response.output_text) as T;
}
