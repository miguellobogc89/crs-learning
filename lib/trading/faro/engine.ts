// lib/trading/faro/engine.ts
// FARO: el analista común del mercado cripto. Cada ~30 min hace UNA llamada a la IA con los
// candidatos de todos los estilos (impulso, rupturas, rebotes) y las noticias, y publica ideas en
// un tablón. Los kamikazes y el usuario toman de ahí. En cada revisión (sin IA) se puntúa cada
// idea con las velas de 5 min: acierto, fallo o caducada, y cuánto habría ganado o perdido.
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aiJson } from "../ai";
import { accountState } from "../accounts";
import { agentByKey, AGENTS_WORKSPACE } from "../agents/roster";
import { CRYPTO, CRYPTO_MARKET } from "../market-data";
import { metricsOf, prefilter, rank, type Metrics, type Ticker } from "../kamikaze/logic";
import { barsSince, eurPairs, hourly, symbolOf } from "../kamikaze/market";
import { kamikazeByKey, type KamikazeStyle } from "../kamikaze/roster";
import { checkIdeas, KINDS, scoreIdea, type AiIdea, type BoardIdea } from "./logic";

const env = (k: string, d: number) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const RUN_MIN = () => env("TRADING_FARO_MINUTES", 30);
/** Cada idea viva se vuelve a puntuar como mucho cada estos minutos (una petición de velas). */
const CHECK_MIN = 4;
const DAY = 86_400_000;
const STYLES: KamikazeStyle[] = ["impulso", "rupturas", "rebotes"];

// ---------------------------------------------------------------------------
// Precio en directo de un valor de CRS (lo usan FARO, los kamikazes y las órdenes del usuario)
// ---------------------------------------------------------------------------
export async function ensureInstrument(symbol: string, base: string) {
  const known = CRYPTO.find((c) => c.symbol === symbol);
  return prisma.market_instruments.upsert({
    where: { symbol },
    create: { symbol, name: known?.name ?? base, sector: "Crypto", market: CRYPTO_MARKET, currency: "EUR", active: false },
    update: {},
  });
}

export async function setLive(instrumentId: string, price: number) {
  const day = new Date(new Date().toISOString().slice(0, 10));
  await prisma.$executeRaw(Prisma.sql`UPDATE public.market_instruments SET
      live_open = CASE WHEN live_day = ${day}::date THEN COALESCE(live_open, ${price}) ELSE ${price} END,
      live_high = CASE WHEN live_day = ${day}::date THEN GREATEST(COALESCE(live_high, ${price}), ${price}) ELSE ${price} END,
      live_low = CASE WHEN live_day = ${day}::date THEN LEAST(COALESCE(live_low, ${price}), ${price}) ELSE ${price} END,
      live_price = ${price}, live_day = ${day}::date, live_at = now()
    WHERE id = ${instrumentId}::uuid`);
}

// ---------------------------------------------------------------------------
// Revisión: puntuar lo vivo y, si toca, un análisis nuevo
// ---------------------------------------------------------------------------
type Rules = Awaited<ReturnType<typeof eurPairs>>;

export async function faroTick(market: Ticker[], rules: Rules, opts: { force?: boolean } = {}) {
  const scored = await scoreLive(market).catch((e) => {
    console.error("[faro] puntuar", e);
    return 0;
  });
  const ran = await maybeRun(market, rules, !!opts.force).catch((e) => {
    console.error("[faro] análisis", e);
    return `error: ${e instanceof Error ? e.message.slice(0, 160) : "desconocido"}`;
  });
  return { scored, ran };
}

async function scoreLive(market: Ticker[]) {
  const live = await prisma.trading_faro_ideas.findMany({
    where: { status: "viva", OR: [{ checked_at: null }, { checked_at: { lt: new Date(Date.now() - CHECK_MIN * 60_000) } }] },
  });
  let n = 0;
  for (const i of live) {
    try {
      const livePrice = market.find((t) => t.pair === i.pair)?.price ?? null;
      const bars = await barsSince(i.pair, i.created_at.getTime());
      const s = scoreIdea(
        { price: i.price, invalidation: i.invalidation, target: i.target, createdAt: i.created_at.getTime(), validUntil: i.valid_until.getTime(), best: i.best_pct, worst: i.worst_pct },
        bars,
        Date.now(),
        livePrice,
      );
      await prisma.trading_faro_ideas.update({
        where: { id: i.id },
        data: {
          status: s.status,
          best_pct: s.best,
          worst_pct: s.worst,
          last_price: s.lastPrice,
          exit_price: s.exitPrice,
          result_pct: s.resultPct,
          resolved_at: s.resolvedAt ? new Date(s.resolvedAt) : null,
          checked_at: new Date(),
        },
      });
      if (livePrice && s.status === "viva") {
        const inst = await prisma.market_instruments.findUnique({ where: { symbol: i.symbol }, select: { id: true } });
        if (inst) await setLive(inst.id, livePrice);
      }
      n++;
    } catch (e) {
      console.error("[faro] idea", i.pair, e);
    }
  }
  return n;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["market_view", "ideas"],
  properties: {
    market_view: { type: "string", description: "Cómo ves ahora el mercado cripto, en 1-2 frases." },
    ideas: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pair", "kind", "conviction", "invalidation", "target", "valid_hours", "rationale", "risks"],
        properties: {
          pair: { type: "string", description: "Par de la lista de candidatos (p. ej. SOLEUR)." },
          kind: { type: "string", enum: KINDS },
          conviction: { type: "integer", minimum: 1, maximum: 5 },
          invalidation: { type: "number", description: "Precio en euros por debajo del cual la idea deja de valer (mínimo reciente, soporte…)." },
          target: { type: "number", description: "Precio en euros hasta donde tiene recorrido razonable (máximo anterior, resistencia…)." },
          valid_hours: { type: "integer", minimum: 1, maximum: 24, description: "Horas que sigue valiendo la idea." },
          rationale: { type: "string", description: "Por qué, en 2-3 frases. Puedes marcar lo clave con **negritas**." },
          risks: { type: "string" },
        },
      },
    },
  },
} as const;

async function maybeRun(market: Ticker[], rules: Rules, force: boolean) {
  // Un solo análisis por intervalo aunque haya varias revisiones a la vez.
  const minutes = force ? 0 : RUN_MIN();
  const claimed = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`INSERT INTO public.trading_faro_runs (status)
    SELECT 'en_curso' WHERE NOT EXISTS (
      SELECT 1 FROM public.trading_faro_runs
      WHERE (status = 'en_curso' AND created_at > now() - interval '5 minutes')
         OR created_at > now() - make_interval(mins => ${minutes}::int))
    RETURNING id`);
  const runId = claimed[0]?.id;
  if (!runId) return null;

  try {
    // Candidatos de los tres estilos: criba con el resumen de 24 h y detalle con velas horarias.
    const pre = new Map<string, Ticker>();
    for (const st of STYLES) for (const t of prefilter(st, market, 12)) pre.set(t.pair, t);
    const detailed: Metrics[] = [];
    for (const t of pre.values()) {
      try {
        detailed.push(metricsOf(t, await hourly(t.pair)));
      } catch {
        // Sin velas de este par: se queda fuera.
      }
    }
    const tagged = new Map<string, { m: Metrics; styles: KamikazeStyle[] }>();
    for (const st of STYLES)
      for (const m of rank(st, detailed, 7)) {
        const e = tagged.get(m.pair) ?? { m, styles: [] };
        e.styles.push(st);
        tagged.set(m.pair, e);
      }
    const candidates = [...tagged.values()];
    const live = await prisma.trading_faro_ideas.findMany({ where: { status: "viva" }, select: { pair: true, kind: true, target: true, invalidation: true } });
    const bases = [...new Set(candidates.map((c) => c.m.base))];
    const news = await prisma.news_items.findMany({
      where: { status: "clasificada", relevant: true, published_at: { gte: new Date(Date.now() - DAY) }, symbols: { hasSome: [...bases, "CRYPTO"] } },
      orderBy: [{ impact: "desc" }, { published_at: "desc" }],
      take: 15,
      select: { title: true, summary: true, symbols: true, sentiment: true, impact: true, published_at: true },
    });
    const r = (x: number) => Math.round(x * 100) / 100;
    const input = {
      ahora: new Date().toISOString(),
      candidatos: candidates.map(({ m, styles }) => ({
        par: m.pair,
        encaja_en: styles,
        precio: m.price,
        cambio_1h: r(m.ch1h),
        cambio_4h: r(m.ch4h),
        cambio_24h: r(m.ch24h),
        max_3d: m.high3d,
        min_3d: m.low3d,
        fromHigh3d: r(m.fromHigh3d),
        volSurge: r(m.volSurge),
        volumen_24h_eur: Math.round(m.volume24h),
      })),
      ideas_ya_publicadas: live.map((i) => ({ par: i.pair, tipo: i.kind, invalidacion: i.invalidation, objetivo: i.target })),
      noticias: news.map((n) => ({ hace_h: Math.round((Date.now() - n.published_at.getTime()) / 3_600_000), monedas: n.symbols, resumen: n.summary || n.title, sentimiento: n.sentiment, impacto: n.impact })),
    };
    const instructions = [
      "Eres un analista de criptomonedas que publica ideas de compra a corto plazo (horas) en un tablón común. Otros agentes deciden si entran, cuánto y dónde salen: tú solo señalas qué hay, por qué y entre qué niveles.",
      "Tipos: «impulso» (sube con fuerza y volumen y no parece agotado), «ruptura» (rompe máximos recientes con volumen), «rebote» (ha caído fuerte y empieza a girarse) y «noticia» (una noticia concreta puede moverla).",
      "Para cada idea: invalidación = nivel real del gráfico por debajo del cual la idea deja de valer (no un % fijo); objetivo = nivel donde es razonable que se frene; valid_hours = cuánto sigue valiendo.",
      "Publica solo lo que de verdad veas (de 0 a 8 ideas, mejor pocas y buenas). No repitas pares de «ideas_ya_publicadas». Elige SOLO pares de la lista de candidatos.",
      "Precios y volúmenes en euros (los pares en USDC ya vienen convertidos). fromHigh3d = distancia al máximo de 3 días en %, volSurge = volumen de las últimas 4 h frente a la media (1 = normal).",
      "Responde en español, claro y breve.",
    ].join("\n");

    const ai = await aiJson<{ market_view: string; ideas: AiIdea[] }>({
      tier: "smart",
      purpose: "faro",
      instructions,
      input: JSON.stringify(input),
      schemaName: "faro_ideas",
      schema: SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: 4000,
      timeoutMs: 60_000,
    });
    const { ok, rejected } = checkIdeas(ai.ideas ?? [], { candidates: candidates.map((c) => ({ pair: c.m.pair, price: c.m.price })), livePairs: live.map((i) => i.pair) });
    for (const i of ok) {
      const symbol = symbolOf(i.pair, rules) ?? `${i.pair.replace(/(EUR|USDC)$/, "")}-EUR`;
      const inst = await ensureInstrument(symbol, rules.get(i.pair)?.base ?? symbol.replace(/-EUR$/, ""));
      await setLive(inst.id, i.price);
      await prisma.trading_faro_ideas.create({
        data: {
          run_id: runId,
          pair: i.pair,
          symbol,
          kind: i.kind,
          conviction: i.conviction,
          price: i.price,
          invalidation: i.invalidation,
          target: i.target,
          valid_until: new Date(Date.now() + i.validHours * 3_600_000),
          rationale: i.rationale,
          risks: i.risks,
          last_price: i.price,
          best_pct: 0,
          worst_pct: 0,
        },
      });
    }
    await prisma.trading_faro_runs.update({
      where: { id: runId },
      data: { status: "ok", market_view: ai.market_view, ideas: ok.length, error: rejected.length ? `Descartadas: ${rejected.map((x) => `${x.pair} (${x.reason})`).join("; ").slice(0, 900)}` : null },
    });
    return `${ok.length} ideas`;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "error";
    await prisma.trading_faro_runs.update({ where: { id: runId }, data: { status: "error", error: msg } });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Para los agentes y la interfaz
// ---------------------------------------------------------------------------
export async function boardIdeas(): Promise<(BoardIdea & { symbol: string; rationale: string; runId: string | null })[]> {
  const rows = await prisma.trading_faro_ideas.findMany({ where: { status: "viva", valid_until: { gt: new Date() } }, orderBy: { created_at: "desc" } });
  return rows.map((i) => ({
    id: i.id,
    pair: i.pair,
    symbol: i.symbol,
    kind: i.kind,
    conviction: i.conviction,
    price: i.price,
    invalidation: i.invalidation,
    target: i.target,
    validUntil: i.valid_until.getTime(),
    createdAt: i.created_at.getTime(),
    rationale: i.rationale,
    runId: i.run_id,
  }));
}

export async function lastMarketView() {
  const run = await prisma.trading_faro_runs.findFirst({ where: { status: "ok" }, orderBy: { created_at: "desc" } });
  return run ? { at: run.created_at.toISOString(), marketView: run.market_view } : null;
}

export type FaroParticipant = {
  who: string;
  name: string;
  color: string;
  status: string;
  entry: number | null;
  invested: number;
  result: number | null;
  resultPct: number | null;
};

/** Tablón para la interfaz: ideas vivas, historial con resultado, quién entró en cada una y aciertos por tipo. */
export async function faroView(workspaceId: string) {
  const [live, past, last, state, groups] = await Promise.all([
    prisma.trading_faro_ideas.findMany({ where: { status: "viva" }, orderBy: { created_at: "desc" } }),
    prisma.trading_faro_ideas.findMany({ where: { status: { not: "viva" } }, orderBy: { created_at: "desc" }, take: 300 }),
    prisma.trading_faro_runs.findFirst({ where: { status: "ok" }, orderBy: { created_at: "desc" } }),
    accountState(workspaceId),
    prisma.trading_faro_ideas.groupBy({ by: ["kind", "status"], where: { status: { not: "viva" } }, _count: { _all: true }, _avg: { result_pct: true } }),
  ]);
  const all = [...live, ...past];
  const since = all.length ? new Date(Math.min(...all.map((i) => i.created_at.getTime()))) : new Date();
  const positions = await prisma.trading_positions.findMany({
    where: { signal_key: { startsWith: "faro:" }, created_at: { gte: since }, status: { not: "cancelada" } },
    include: { account: { select: { agent: true, workspace_id: true } } },
  });
  const byIdea = new Map<string, FaroParticipant[]>();
  for (const p of positions) {
    const ideaId = p.signal_key?.split(":")[1];
    if (!ideaId) continue;
    const mine = p.account.workspace_id === workspaceId && p.account.agent === "";
    const agent = p.account.workspace_id === AGENTS_WORKSPACE && !p.account.agent.startsWith("copia:") ? p.account.agent : null;
    if (!mine && !agent) continue;
    const def = agent ? (kamikazeByKey(agent) ?? agentByKey(agent)) : null;
    const idea = all.find((i) => i.id === ideaId);
    const entry = p.entry_price;
    const invested = p.quantity * (entry ?? p.planned_entry);
    const closed = p.status === "cerrada";
    const now = closed ? p.exit_price : (idea?.last_price ?? null);
    const result = closed ? p.pnl : entry && now ? (now - entry) * p.quantity : null;
    const list = byIdea.get(ideaId) ?? [];
    list.push({
      who: mine ? "tu" : agent!,
      name: mine ? "Tú" : (def?.name ?? agent!),
      color: mine ? "slate" : (def?.color ?? "slate"),
      status: p.status,
      entry,
      invested,
      result,
      resultPct: result !== null && invested > 0 ? (result / invested) * 100 : null,
    });
    byIdea.set(ideaId, list);
  }
  const view = (i: (typeof all)[number]) => ({
    id: i.id,
    pair: i.pair,
    symbol: i.symbol,
    kind: i.kind,
    conviction: i.conviction,
    price: i.price,
    invalidation: i.invalidation,
    target: i.target,
    createdAt: i.created_at.toISOString(),
    validUntil: i.valid_until.toISOString(),
    rationale: i.rationale,
    risks: i.risks,
    status: i.status as "viva" | "acierto" | "fallo" | "caducada",
    lastPrice: i.last_price,
    bestPct: i.best_pct,
    worstPct: i.worst_pct,
    resultPct: i.result_pct,
    resolvedAt: i.resolved_at?.toISOString() ?? null,
    participants: byIdea.get(i.id) ?? [],
  });
  const stats = KINDS.map((kind) => {
    const rows = groups.filter((g) => g.kind === kind);
    const n = rows.reduce((s, g) => s + g._count._all, 0);
    const hits = rows.find((g) => g.status === "acierto")?._count._all ?? 0;
    const avg = n ? rows.reduce((s, g) => s + (g._avg.result_pct ?? 0) * g._count._all, 0) / n : null;
    return { kind, n, hits, avgPct: avg };
  }).filter((s) => s.n > 0);
  return {
    lastRun: last ? { at: last.created_at.toISOString(), marketView: last.market_view } : null,
    everyMinutes: RUN_MIN(),
    live: live.map(view),
    past: past.map(view),
    stats,
    account: { opened: state.summary.opened, equity: state.summary.equity, cash: state.summary.available, riskPct: state.account.risk_per_trade_pct },
  };
}
