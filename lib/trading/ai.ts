// lib/trading/ai.ts
// Única puerta del módulo de trading a la IA. Hoy usa OpenAI; cambiar de proveedor
// (por ejemplo, a Anthropic) es añadir otra rama aquí sin tocar el resto del módulo.
//
// Variables de entorno (todas opcionales):
//   TRADING_AI_PROVIDER        "openai" (por defecto)
//   TRADING_AI_FAST_MODEL      modelo barato para clasificar (por defecto OPENAI_DOCUMENT_CLASSIFIER_MODEL u OPENAI_MODEL)
//   TRADING_AI_SMART_MODEL     modelo bueno para decidir (por defecto OPENAI_MODEL)
//   TRADING_AI_DAILY_CALLS     tope de llamadas diarias del módulo (por defecto 300)
import "server-only";
import { getOpenAIClient } from "@/lib/ai/openai";
import { prisma } from "@/lib/prisma";

export type AiTier = "fast" | "smart";

export class AiBudgetError extends Error {
  constructor(limit: number) {
    super(`Se ha alcanzado el tope diario de ${limit} llamadas a la IA del módulo de trading (TRADING_AI_DAILY_CALLS)`);
    this.name = "AiBudgetError";
  }
}

function modelFor(tier: AiTier) {
  const env = process.env;
  const m =
    tier === "fast"
      ? env.TRADING_AI_FAST_MODEL?.trim() || env.OPENAI_DOCUMENT_CLASSIFIER_MODEL?.trim() || env.OPENAI_MODEL?.trim()
      : env.TRADING_AI_SMART_MODEL?.trim() || env.OPENAI_MODEL?.trim();
  if (!m) throw new Error("No hay modelo de IA configurado (TRADING_AI_FAST_MODEL u OPENAI_MODEL)");
  return m;
}

export function dailyCallLimit() {
  const n = Number(process.env.TRADING_AI_DAILY_CALLS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 300;
}

const today = () => new Date(new Date().toISOString().slice(0, 10));

export async function usageToday() {
  const rows = await prisma.trading_ai_usage.findMany({ where: { day: today() } });
  return {
    calls: rows.reduce((s, r) => s + r.calls, 0),
    inputTokens: rows.reduce((s, r) => s + r.input_tokens, 0),
    outputTokens: rows.reduce((s, r) => s + r.output_tokens, 0),
    limit: dailyCallLimit(),
  };
}

async function record(purpose: string, input: number, output: number) {
  const day = today();
  await prisma.trading_ai_usage.upsert({
    where: { day_purpose: { day, purpose } },
    create: { day, purpose, calls: 1, input_tokens: input, output_tokens: output },
    update: { calls: { increment: 1 }, input_tokens: { increment: input }, output_tokens: { increment: output } },
  });
}

/** Llamada con salida JSON validada por esquema. */
export async function aiJson<T>(opts: {
  tier: AiTier;
  purpose: string;
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<T> {
  const usage = await usageToday();
  if (usage.calls >= usage.limit) throw new AiBudgetError(usage.limit);
  const provider = (process.env.TRADING_AI_PROVIDER || "openai").trim().toLowerCase();
  if (provider !== "openai") throw new Error(`Proveedor de IA no soportado todavía: ${provider}`);

  const model = modelFor(opts.tier);
  const reasoning = /^gpt-5(?:[.-]|$)|^o[134](?:[.-]|$)/.test(model) && !/-pro|-chat|-codex/.test(model);
  const response = await getOpenAIClient().responses.create(
    {
      model,
      instructions: opts.instructions,
      ...(reasoning ? { reasoning: { effort: opts.tier === "fast" ? ("low" as const) : ("medium" as const) } } : {}),
      input: [{ role: "user", content: [{ type: "input_text", text: opts.input }] }],
      text: { format: { type: "json_schema", name: opts.schemaName, strict: true, schema: opts.schema } },
      max_output_tokens: opts.maxOutputTokens ?? 6000,
    },
    { timeout: opts.timeoutMs ?? 60_000, maxRetries: 1 },
  );
  await record(opts.purpose, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);
  if (response.status !== "completed" || !response.output_text?.trim()) throw new Error("La IA no completó la respuesta");
  return JSON.parse(response.output_text) as T;
}

export function aiModelInfo() {
  try {
    return { provider: (process.env.TRADING_AI_PROVIDER || "openai").trim(), fast: modelFor("fast") };
  } catch {
    return { provider: (process.env.TRADING_AI_PROVIDER || "openai").trim(), fast: null };
  }
}
