// lib/trading/news/classify.ts
// Instrucciones, contrato JSON y normalización de la clasificación de noticias por IA.
// Puro: no llama a ningún proveedor (eso lo hace lib/trading/ai.ts).
import { MARKET_TAGS, NEWS_CATEGORIES, type NewsCategory } from "./sources";

export type AssetRef = { symbol: string; name: string; aliases?: string[] };

export type NewsToClassify = {
  id: string;
  market: "bolsa" | "crypto";
  title: string;
  snippet: string;
  publisher: string | null;
  hints: string[];
};

export type Classification = {
  id: string;
  relevant: boolean;
  symbols: string[];
  category: NewsCategory;
  sentiment: number;
  impact: number;
  summary: string;
};

export const CLASSIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "relevant", "symbols", "category", "sentiment", "impact", "summary"],
        properties: {
          id: { type: "string" },
          relevant: { type: "boolean" },
          symbols: { type: "array", items: { type: "string" } },
          category: { type: "string", enum: [...NEWS_CATEGORIES] },
          sentiment: { type: "integer", description: "-2 muy negativa … 0 neutra … 2 muy positiva" },
          impact: { type: "integer", description: "0 ruido, 1 menor, 2 relevante, 3 muy importante" },
          summary: { type: "string" },
        },
      },
    },
  },
} as const;

export function classifyInstructions(assets: AssetRef[]) {
  const list = assets.map((a) => `${a.symbol}: ${a.name}${a.aliases?.length ? ` (${a.aliases.join(", ")})` : ""}`).join("\n");
  return [
    "Eres analista de mercados. Clasificas noticias para un inversor particular español que sigue el IBEX 35 y las principales criptomonedas.",
    "Para cada noticia devuelve un objeto con su mismo id.",
    "",
    "Reglas:",
    "- relevant: true solo si la noticia puede influir en el precio de alguno de los activos de la lista, o en el mercado en su conjunto (tipos de interés, macro española o europea, regulación crypto…). Deportes, patrocinios, opinión sin datos, publicidad o noticias que solo mencionan la empresa de pasada → false.",
    `- symbols: solo símbolos de la lista. Usa MERCADO_ES (${MARKET_TAGS.MERCADO_ES}) o CRYPTO (${MARKET_TAGS.CRYPTO}) cuando afecte a todo el mercado. La pista de búsqueda (hints) es orientativa: ignórala si la noticia no trata de ese activo. Lista vacía si no es relevante.`,
    "- category: el tipo de hecho principal.",
    "- sentiment: para quien tiene ese activo, de -2 (muy negativa) a 2 (muy positiva); 0 si es neutra o mixta.",
    "- impact: 0 ruido, 1 menor, 2 relevante (puede mover el precio en torno a un 1-3 %), 3 muy importante (resultados muy por encima o por debajo de lo esperado, OPA, ampliación grande, hackeo grave, decisión regulatoria clave, quiebra). Sé exigente: la mayoría de noticias son 0 o 1.",
    "- summary: una frase en español de España, de 180 caracteres como máximo, neutra y concreta, que diga qué ha pasado. Usa solo lo que dicen el titular y la entradilla: no inventes cifras ni datos.",
    "",
    "Activos:",
    list,
    "MERCADO_ES: bolsa española en general",
    "CRYPTO: mercado crypto en general",
  ].join("\n");
}

export function classifyInput(items: NewsToClassify[]) {
  return JSON.stringify(
    items.map((n) => ({
      id: n.id,
      mercado: n.market,
      titular: n.title,
      entradilla: n.snippet.slice(0, 400) || undefined,
      medio: n.publisher ?? undefined,
      hints: n.hints.length ? n.hints : undefined,
    })),
  );
}

/** Ajusta la respuesta del modelo a valores válidos; las noticias sin respuesta se devuelven aparte. */
export function normalizeClassification(raw: unknown, items: NewsToClassify[], validSymbols: Set<string>) {
  const byId = new Map<string, Classification>();
  const list = (raw as { items?: unknown })?.items;
  if (Array.isArray(list)) {
    for (const r of list as Record<string, unknown>[]) {
      const id = typeof r?.id === "string" ? r.id : "";
      if (!items.some((n) => n.id === id)) continue;
      const symbols = Array.isArray(r.symbols)
        ? [...new Set((r.symbols as unknown[]).filter((s): s is string => typeof s === "string").map((s) => s.trim().toUpperCase()))].filter((s) =>
            validSymbols.has(s),
          )
        : [];
      const category = (NEWS_CATEGORIES as readonly string[]).includes(String(r.category)) ? (r.category as NewsCategory) : "otro";
      const sentiment = Math.max(-2, Math.min(2, Math.round(Number(r.sentiment) || 0)));
      const impact = Math.max(0, Math.min(3, Math.round(Number(r.impact) || 0)));
      const relevant = r.relevant === true && symbols.length > 0;
      const summary = typeof r.summary === "string" ? r.summary.replace(/\s+/g, " ").trim().slice(0, 240) : "";
      byId.set(id, { id, relevant, symbols: relevant ? symbols : [], category, sentiment, impact: relevant ? impact : 0, summary });
    }
  }
  const missing = items.filter((n) => !byId.has(n.id)).map((n) => n.id);
  return { results: [...byId.values()], missing };
}
