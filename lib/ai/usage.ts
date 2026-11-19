// lib/ai/usage.ts
// Consumo y ajustes de la IA de las tres apps (Trade, Finance, Business). Cada llamada apunta sus tokens en
// ai_usage; los ajustes del panel «Consumo de IA» se guardan en ai_settings y mandan sobre las variables de
// entorno de Vercel (applyAiSettings los copia en process.env, que es lo que lee el resto del código).
import "server-only";
import { prisma } from "@/lib/prisma";

export type AiApp = "trade" | "finance" | "business";

/** Precio por millón de tokens (dólares) de los modelos que se pueden elegir. */
export const MODEL_PRICES: Record<string, { input: number; output: number; label: string }> = {
  "gpt-5": { input: 1.25, output: 10, label: "GPT-5 (alto)" },
  "gpt-5-mini": { input: 0.25, output: 2, label: "GPT-5 mini (medio)" },
  "gpt-5-nano": { input: 0.05, output: 0.4, label: "GPT-5 nano (mínimo)" },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, label: "GPT-4.1 mini" },
};
const USD_EUR = 0.92;

export function costEur(model: string, input: number, output: number): number | null {
  const p = MODEL_PRICES[model] ?? MODEL_PRICES[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")];
  if (!p) return null;
  return Math.round(((input * p.input + output * p.output) / 1_000_000) * USD_EUR * 100) / 100;
}

export async function recordAiUsage(app: AiApp, purpose: string, model: string, input: number, output: number) {
  await prisma.$executeRaw`INSERT INTO ai_usage (day, app, purpose, model, calls, input_tokens, output_tokens)
    VALUES (current_date, ${app}, ${purpose.slice(0, 60)}, ${model.slice(0, 60)}, 1, ${input}, ${output})
    ON CONFLICT (day, app, purpose, model) DO UPDATE SET calls = ai_usage.calls + 1,
      input_tokens = ai_usage.input_tokens + EXCLUDED.input_tokens, output_tokens = ai_usage.output_tokens + EXCLUDED.output_tokens`.catch(() => undefined);
}

export type AiSettingDef = {
  key: string;
  /** Variable de entorno que sustituye (la que lee el código). */
  env: string;
  app: AiApp;
  label: string;
  kind: "model" | "number" | "effort" | "bool";
  /** Qué pasa al subirlo o bajarlo, en una línea. */
  help: string;
  min?: number;
  max?: number;
};

export const AI_SETTINGS: AiSettingDef[] = [
  { key: "trade.faro_minutes", env: "TRADING_FARO_MINUTES", app: "trade", kind: "number", min: 15, max: 720, label: "FARO analiza cada (minutos)", help: "Es lo que más gasta de Trade. El doble de minutos ≈ la mitad de gasto y la mitad de ideas nuevas. No afecta a ENJAMBRE ni a CAMALEÓN, que no usan IA." },
  { key: "trade.faro_us_minutes", env: "TRADING_FARO_US_MINUTES", app: "trade", kind: "number", min: 15, max: 720, label: "FARO en bolsa de EE. UU. cada (minutos)", help: "Lo mismo para las acciones de EE. UU. Ningún agente las opera hoy: subirlo ahorra sin perder nada." },
  { key: "trade.daily_calls", env: "TRADING_AI_DAILY_CALLS", app: "trade", kind: "number", min: 0, max: 2000, label: "Límite de llamadas al día", help: "Tope de seguridad: al llegar, la IA de Trade se para hasta el día siguiente (FARO deja de publicar ideas). Hoy usa unas 50–60 al día." },
  { key: "trade.smart_model", env: "TRADING_AI_SMART_MODEL", app: "trade", kind: "model", label: "Modelo de FARO (el que decide)", help: "Un modelo más barato abarata cada análisis, pero las ideas pueden ser peores. Mini cuesta la quinta parte que GPT-5." },
  { key: "trade.smart_effort", env: "TRADING_AI_SMART_EFFORT", app: "trade", kind: "effort", label: "Cuánto razona FARO", help: "Más razonamiento = más tokens de salida (los caros) y más lento. Bajo es lo normal." },
  { key: "trade.fast_model", env: "TRADING_AI_FAST_MODEL", app: "trade", kind: "model", label: "Modelo rápido (clasificar)", help: "Para tareas sencillas (noticias, avisos). Nano basta." },
  { key: "finance.enabled", env: "FINANCE_AI_ENABLED", app: "finance", kind: "bool", label: "Clasificar movimientos con IA", help: "Apagado: lo que no entiendan las reglas y palabras clave queda «por revisar» y lo corriges tú. El copiloto sigue funcionando." },
  { key: "finance.fast_model", env: "FINANCE_AI_FAST_MODEL", app: "finance", kind: "model", label: "Modelo para clasificar", help: "Clasifica los movimientos nuevos. Nano suele bastar." },
  { key: "finance.model", env: "FINANCE_AI_MODEL", app: "finance", kind: "model", label: "Modelo del copiloto", help: "Solo gasta cuando le preguntas." },
  { key: "business.assistant_model", env: "OPENAI_ASSISTANT_MODEL", app: "business", kind: "model", label: "Modelo del asistente", help: "Cada mensaje envía mucho contexto (unos 40.000 tokens). Mini cuesta la quinta parte que GPT-5 y responde bien; nano puede fallar al consultar datos." },
];

let cache: { at: number; values: Map<string, string> } | null = null;

async function storedSettings() {
  if (cache && Date.now() - cache.at < 60_000) return cache.values;
  const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`SELECT key, value FROM ai_settings`.catch(() => []);
  cache = { at: Date.now(), values: new Map(rows.map((r) => [r.key, r.value])) };
  return cache.values;
}

/** Copia los ajustes guardados en process.env (las variables que lee cada parte). Llamar al empezar cada ruta. */
export async function applyAiSettings() {
  const values = await storedSettings();
  for (const d of AI_SETTINGS) {
    const v = values.get(d.key);
    if (v !== undefined && v !== "") process.env[d.env] = v;
  }
}

export async function saveAiSetting(key: string, value: string | null) {
  const d = AI_SETTINGS.find((x) => x.key === key);
  if (!d) throw new Error("Ajuste desconocido");
  let v = (value ?? "").trim();
  if (v) {
    if (d.kind === "model" && !MODEL_PRICES[v]) throw new Error("Modelo no válido");
    if (d.kind === "effort" && !["low", "medium", "high"].includes(v)) throw new Error("Valor no válido");
    if (d.kind === "bool" && !["true", "false"].includes(v)) throw new Error("Valor no válido");
    if (d.kind === "number") {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < (d.min ?? 0) || n > (d.max ?? 1e9)) throw new Error(`Entre ${d.min} y ${d.max}`);
      v = String(n);
    }
    await prisma.$executeRaw`INSERT INTO ai_settings (key, value, updated_at) VALUES (${key}, ${v}, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  } else await prisma.$executeRaw`DELETE FROM ai_settings WHERE key = ${key}`;
  cache = null;
}

/** Para el panel: consumo por app y motivo (hoy, 7 y 30 días) y los ajustes con su valor efectivo. */
export async function aiUsageView() {
  const rows = await prisma.$queryRaw<{ day: Date; app: string; purpose: string; model: string; calls: number; input_tokens: bigint; output_tokens: bigint }[]>`
    SELECT day, app, purpose, model, calls, input_tokens, output_tokens FROM ai_usage WHERE day >= current_date - 30`;
  const today = new Date().toISOString().slice(0, 10);
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const groups = new Map<string, { app: string; purpose: string; models: Set<string>; calls: [number, number, number]; tokens: [number, number, number]; cost: [number, number, number]; unpriced: boolean }>();
  for (const r of rows) {
    const k = `${r.app}|${r.purpose}`;
    const g = groups.get(k) ?? { app: r.app, purpose: r.purpose, models: new Set<string>(), calls: [0, 0, 0], tokens: [0, 0, 0], cost: [0, 0, 0], unpriced: false };
    const d = r.day.toISOString().slice(0, 10);
    const inT = Number(r.input_tokens), outT = Number(r.output_tokens);
    const c = costEur(r.model, inT, outT);
    if (c === null) g.unpriced = true;
    else g.models.add(r.model);
    const slots = [d === today, d >= since7, true];
    slots.forEach((on, i) => {
      if (!on) return;
      g.calls[i] += r.calls;
      g.tokens[i] += inT + outT;
      g.cost[i] += c ?? 0;
    });
    groups.set(k, g);
  }
  const values = await storedSettings();
  return {
    prices: MODEL_PRICES,
    usage: [...groups.values()]
      .map((g) => ({ ...g, models: [...g.models], cost: g.cost.map((x) => Math.round(x * 100) / 100) }))
      .sort((a, b) => b.tokens[2] - a.tokens[2]),
    settings: AI_SETTINGS.map((d) => ({
      ...d,
      value: values.get(d.key) ?? null,
      // Lo que se usa si no lo cambias aquí (la variable de Vercel).
      fallback: process.env[d.env]?.trim() || null,
    })),
  };
}
