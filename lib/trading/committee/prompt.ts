// lib/trading/committee/prompt.ts
// El coordinador («comité de inversión»): qué ve, qué tiene que devolver y las reglas duras
// que se aplican después, en código, a todo lo que proponga. Puro: sin base de datos ni IA.
import { positionSize, type CostModel, type Sizing } from "../risk";
import type { Direction } from "../types";

export type CommitteeSignal = {
  id: string;
  pattern: string;
  status: string;
  direction: Direction;
  entry: number;
  stop: number;
  target: number;
  score: number;
  vetoed: boolean;
  history: string | null;
};

export type CommitteeNews = { id: string; when: string; summary: string; sentiment: number; impact: number; category: string | null };

export type CommitteeAsset = {
  symbol: string;
  name: string;
  market: "bolsa" | "crypto";
  price: number;
  change1d: number | null;
  change20d: number | null;
  trend: "up" | "down" | "flat";
  rsi: number | null;
  distSma200: number | null;
  /** ATR de 14 sesiones en % del precio (volatilidad diaria típica). */
  atrPct: number | null;
  lotStep: number;
  signals: CommitteeSignal[];
  /** Fuerza relativa (estrategia de tendencia): puesto en el ranking de su mercado. */
  strength: { id: string; rank: number; of: number; momPct: number; lookback: number; inTop: boolean; aboveSma200: boolean } | null;
  news: CommitteeNews[];
  position: { direction: Direction; quantity: number; entry: number; stop: number; target: number; unrealizedPct: number; pending?: boolean } | null;
};

export type CommitteeContext = {
  date: string;
  regimes: { bolsa: string; crypto: string | null };
  account: {
    equity: number;
    cash: number;
    riskPct: number;
    maxPositionPct: number;
    maxOpen: number;
    openCount: number;
    allowShort: boolean;
    cost: CostModel;
  };
  marketNews: CommitteeNews[];
  assets: CommitteeAsset[];
};

export const COMMITTEE_ACTIONS = ["comprar", "vender", "mantener", "vigilar"] as const;
export type CommitteeAction = (typeof COMMITTEE_ACTIONS)[number];

export const COMMITTEE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["market_view", "proposals", "watchlist"],
  properties: {
    market_view: { type: "string" },
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["symbol", "action", "conviction", "horizon_days", "stop", "target", "rationale", "evidence", "risks"],
        properties: {
          symbol: { type: "string" },
          action: { type: "string", enum: [...COMMITTEE_ACTIONS] },
          conviction: { type: "integer" },
          horizon_days: { type: "integer" },
          stop: { type: ["number", "null"] },
          target: { type: ["number", "null"] },
          rationale: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          risks: { type: "string" },
        },
      },
    },
    watchlist: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["symbol", "reason"],
        properties: { symbol: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
} as const;

export const COMMITTEE_INSTRUCTIONS = [
  "Eres el comité de inversión de una app para un inversor particular español. Operas con una cartera virtual en acciones del IBEX 35 y en las principales criptomonedas.",
  "Tu trabajo: leer los datos del día (técnico, figuras chartistas con su historial real, noticias clasificadas y la cartera) y proponer qué hacer en la próxima sesión.",
  "",
  "Principios:",
  "- Prudencia: no operar es una opción válida y a menudo la mejor. Propón como mucho 3 compras nuevas, y solo si varias pruebas apuntan en la misma dirección.",
  "- Una figura marcada como vetada (vetoed) ha perdido dinero históricamente: no la uses como argumento a favor.",
  "- Las noticias muy importantes (impact 3) pesan más que las figuras. Una noticia negativa importante descarta compras en ese activo.",
  "- Ve a favor de la tendencia de fondo salvo que haya una razón fuerte y documentada.",
  "- La fuerza relativa (F:…) es la señal más fiable que tienes: la estrategia de tendencia (comprar los activos que más han subido en los últimos meses y están por encima de su media de 200 sesiones, y salir si el mercado se gira) está validada con años de datos. Prioriza activos en el top de fuerza (inTop) y con buenas noticias; desconfía de comprar lo que está abajo del ranking.",
  "- Si el mercado de un activo está en fase bajista, no propongas compras en ese mercado salvo convicción 5 con pruebas muy claras.",
  "- Usa solo los datos que te doy. No inventes cifras, noticias ni hechos.",
  "",
  "Acciones:",
  "- comprar: abrir una posición nueva. Obligatorio dar stop y target en euros: el stop por debajo del precio actual (a una distancia razonable según su volatilidad, atrPct) y el target por encima, con al menos 1,5 veces lo que se arriesga. Si hay una figura activa, puedes usar su stop y su objetivo.",
  "- Una posición con pending=true es una orden de compra que se ejecutará en la próxima apertura: ya está decidida, no la vuelvas a proponer.",
  "- Sé coherente: no cambies de opinión sobre una posición recién abierta salvo que haya un hecho nuevo e importante (noticia de impacto 3, ruptura del stop técnico).",
  "- vender: cerrar una posición que la cartera ya tiene (por noticias en contra, ruptura del stop técnico, objetivo cumplido…). stop y target a null.",
  "- mantener: solo para posiciones abiertas, cuando conviene explicar que siguen bien. Puedes proponer un stop más alto (protección) en stop; target puede ser null.",
  "- vigilar: activo interesante sin entrada clara todavía. Explica qué tendría que pasar.",
  "",
  "Campos:",
  "- conviction: 1 (muy baja) a 5 (muy alta). Con menos de 3 no propongas comprar: usa vigilar.",
  "- horizon_days: sesiones orientativas que debería durar la operación.",
  "- rationale: 2 a 4 frases en español claro, para alguien que nunca ha invertido. Di qué ha pasado y por qué tiene sentido. Nada de jerga sin explicar. Marca en **negrita** (con dobles asteriscos) entre 1 y 3 ideas clave.",
  "- evidence: identificadores exactos de las pruebas que usas (N:… noticias, S:… figuras, F:… fuerza relativa, T:… datos técnicos de un activo, P:… posición). Al menos uno.",
  "- risks: una frase con lo que podría salir mal.",
  "- La fase de cada mercado (alcista, bajista o lateral) te la doy calculada: úsala tal cual al describirla. Si las noticias apuntan en otra dirección, dilo así («la tendencia es alcista, pero…»), sin cambiar la fase.",
  "- market_view: 2 o 3 frases con cómo ves hoy la bolsa española y el mercado crypto, para alguien que no sabe de bolsa. Marca en **negrita** lo más importante.",
  "- watchlist: hasta 5 activos a seguir de cerca con el motivo, en una frase.",
].join("\n");

const r2 = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

/** Contexto compacto para el modelo. */
export function committeeInput(ctx: CommitteeContext) {
  return JSON.stringify({
    fecha: ctx.date,
    mercado: { bolsa_ibex: ctx.regimes.bolsa, crypto_bitcoin: ctx.regimes.crypto },
    cartera: {
      patrimonio: Math.round(ctx.account.equity),
      efectivo: Math.round(ctx.account.cash),
      riesgo_por_operacion_pct: ctx.account.riskPct,
      posiciones_abiertas: ctx.account.openCount,
      maximo_posiciones: ctx.account.maxOpen,
      cortos_permitidos: ctx.account.allowShort,
    },
    noticias_de_mercado: ctx.marketNews.map((n) => ({ id: n.id, cuando: n.when, resumen: n.summary, tono: n.sentiment, importancia: n.impact })),
    activos: ctx.assets.map((a) => ({
      id: `T:${a.symbol}`,
      simbolo: a.symbol,
      nombre: a.name,
      mercado: a.market,
      precio: r2(a.price, a.price < 20 ? 4 : 2),
      var_1d_pct: r2(a.change1d),
      var_20d_pct: r2(a.change20d),
      tendencia: a.trend,
      rsi: r2(a.rsi, 0),
      dist_media200_pct: r2(a.distSma200, 1),
      atr_pct: r2(a.atrPct),
      posicion: a.position ? { id: `P:${a.symbol}`, ...a.position, unrealizedPct: r2(a.position.unrealizedPct) } : null,
      fuerza: a.strength
        ? { id: a.strength.id, puesto: a.strength.rank, de: a.strength.of, subida_pct: r2(a.strength.momPct, 1), sesiones: a.strength.lookback, en_top: a.strength.inTop, sobre_media200: a.strength.aboveSma200 }
        : null,
      figuras: a.signals.map((s) => ({
        id: s.id,
        figura: s.pattern,
        estado: s.status,
        direccion: s.direction,
        entrada: r2(s.entry, 4),
        stop: r2(s.stop, 4),
        objetivo: r2(s.target, 4),
        nota: s.score,
        vetada: s.vetoed,
        historial: s.history,
      })),
      noticias: a.news.map((n) => ({ id: n.id, cuando: n.when, resumen: n.summary, tono: n.sentiment, importancia: n.impact, tipo: n.category })),
    })),
  });
}

export type ValidatedProposal = {
  symbol: string;
  name: string;
  market: "bolsa" | "crypto";
  action: CommitteeAction;
  conviction: number;
  horizonDays: number;
  price: number;
  stop: number | null;
  target: number | null;
  rationale: string;
  evidence: string[];
  risks: string;
  status: "propuesta" | "rechazada";
  rejection: string | null;
  sizing: Sizing | null;
};

/**
 * Reglas duras sobre lo que proponga la IA. Lo que no cumple se guarda como «rechazada»
 * con el motivo, para que se vea y se pueda auditar.
 */
export function validateCommittee(raw: unknown, ctx: CommitteeContext) {
  const data = (raw ?? {}) as { market_view?: unknown; proposals?: unknown; watchlist?: unknown };
  const bySymbol = new Map(ctx.assets.map((a) => [a.symbol, a]));
  const evidenceIds = new Set<string>([
    ...ctx.marketNews.map((n) => n.id),
    ...ctx.assets.flatMap((a) => [
      `T:${a.symbol}`,
      ...(a.position ? [`P:${a.symbol}`] : []),
      ...(a.strength ? [a.strength.id] : []),
      ...a.signals.map((s) => s.id),
      ...a.news.map((n) => n.id),
    ]),
  ]);
  const out: ValidatedProposal[] = [];
  let openCount = ctx.account.openCount;
  let cash = ctx.account.cash;
  const seen = new Set<string>();
  const list = Array.isArray(data.proposals) ? (data.proposals as Record<string, unknown>[]) : [];

  for (const p of list) {
    const symbol = String(p?.symbol ?? "").trim().toUpperCase();
    const asset = bySymbol.get(symbol);
    if (!asset || seen.has(symbol)) continue;
    seen.add(symbol);
    const action = (COMMITTEE_ACTIONS as readonly string[]).includes(String(p.action)) ? (p.action as CommitteeAction) : "vigilar";
    const conviction = Math.max(1, Math.min(5, Math.round(Number(p.conviction) || 1)));
    const horizonDays = Math.max(1, Math.min(120, Math.round(Number(p.horizon_days) || 20)));
    const stop = Number.isFinite(Number(p.stop)) && Number(p.stop) > 0 ? Number(p.stop) : null;
    const target = Number.isFinite(Number(p.target)) && Number(p.target) > 0 ? Number(p.target) : null;
    const evidence = Array.isArray(p.evidence)
      ? [...new Set((p.evidence as unknown[]).map(String).filter((e) => evidenceIds.has(e)))]
      : [];
    const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
    const base: ValidatedProposal = {
      symbol,
      name: asset.name,
      market: asset.market,
      action,
      conviction,
      horizonDays,
      price: asset.price,
      stop,
      target,
      rationale: text(p.rationale, 900),
      evidence,
      risks: text(p.risks, 400),
      status: "propuesta",
      rejection: null,
      sizing: null,
    };
    const reject = (why: string) => out.push({ ...base, status: "rechazada", rejection: why });

    if (!evidence.length) {
      reject("No cita ninguna prueba de los datos del día");
      continue;
    }
    if (action === "vender" || action === "mantener") {
      if (!asset.position) {
        reject(action === "vender" ? "No hay posición abierta que vender" : "No hay posición abierta que mantener");
        continue;
      }
      if (action === "mantener" && stop !== null) {
        const long = asset.position.direction === "long";
        if (long ? stop >= asset.price : stop <= asset.price) {
          reject("El nuevo stop propuesto ya está superado por el precio actual");
          continue;
        }
      }
      out.push(base);
      continue;
    }
    if (action === "vigilar") {
      out.push({ ...base, stop: null, target: null });
      continue;
    }
    // comprar
    if (asset.position) {
      reject(asset.position.pending ? "Ya hay una orden de compra pendiente para este activo" : "Ya hay una posición abierta en este activo");
      continue;
    }
    if (conviction < 3) {
      out.push({ ...base, action: "vigilar", stop: null, target: null, rejection: "Convicción baja: se deja en vigilancia" });
      continue;
    }
    if (stop === null || target === null || !(stop < asset.price && target > asset.price)) {
      reject("Para comprar, el stop tiene que estar por debajo del precio y el objetivo por encima");
      continue;
    }
    const distPct = ((asset.price - stop) / asset.price) * 100;
    const maxDist = asset.market === "crypto" ? 25 : 15;
    const minDist = Math.max(0.5, (asset.atrPct ?? 1) * 0.5);
    if (distPct > maxDist) {
      reject(`Stop demasiado lejos (${distPct.toFixed(1)} %; máximo ${maxDist} %)`);
      continue;
    }
    if (distPct < minDist) {
      reject(`Stop demasiado pegado al precio (${distPct.toFixed(1)} %): lo saltaría el movimiento normal de un día`);
      continue;
    }
    const rr = (target - asset.price) / (asset.price - stop);
    if (rr < 1.5) {
      reject(`Beneficio/riesgo insuficiente (${rr.toFixed(2)} a 1; mínimo 1,5)`);
      continue;
    }
    if (openCount >= ctx.account.maxOpen) {
      reject(`Ya hay ${openCount} posiciones abiertas o propuestas (máximo ${ctx.account.maxOpen})`);
      continue;
    }
    const sizing = positionSize({
      equity: ctx.account.equity,
      cash,
      riskPct: ctx.account.riskPct,
      maxPositionPct: ctx.account.maxPositionPct,
      entry: asset.price,
      stop,
      cost: ctx.account.cost,
      step: asset.lotStep,
    });
    if (sizing.quantity <= 0) {
      reject("Con el efectivo y los límites de riesgo no sale un tamaño mínimo");
      continue;
    }
    openCount++;
    cash -= sizing.notional + sizing.commission;
    out.push({ ...base, sizing });
  }

  const watch = Array.isArray(data.watchlist)
    ? (data.watchlist as Record<string, unknown>[])
        .map((w) => ({ symbol: String(w?.symbol ?? "").toUpperCase(), reason: typeof w?.reason === "string" ? w.reason.trim().slice(0, 300) : "" }))
        .filter((w) => bySymbol.has(w.symbol) && w.reason)
        .slice(0, 5)
        .map((w) => ({ ...w, name: bySymbol.get(w.symbol)!.name }))
    : [];
  const marketView = typeof data.market_view === "string" ? data.market_view.replace(/\s+/g, " ").trim().slice(0, 900) : "";
  return { marketView, proposals: out, watchlist: watch };
}
