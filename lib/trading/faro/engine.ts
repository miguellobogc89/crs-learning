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
import { barsSince, eurPairs, hourly, hourlyUntil, symbolOf } from "../kamikaze/market";
import { kamikazeByKey, type KamikazeStyle } from "../kamikaze/roster";
import { atrPct, checkIdeas, controlIdeas, ENABLED_KINDS, faro2Verdict, simulateLevels, ideaFeatures, KINDS, pastTicker, scoreIdea, type AiIdea, type BoardIdea, type IdeaFeatures } from "./logic";
import { getMarketPhase, marketPhaseAt } from "../chip/phase-service";
import { analyze, type ResolvedIdea } from "./analysis";

const env = (k: string, d: number) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const RUN_MIN = () => env("TRADING_FARO_MINUTES", 30);
/** Cada idea viva se vuelve a puntuar como mucho cada estos minutos (una petición de velas). */
const CHECK_MIN = 4;
const DAY = 86_400_000;
const STYLES: KamikazeStyle[] = ["impulso", "rupturas", "rebotes"];
const KIND_TEXT: Record<string, string> = {
  impulso: "«impulso» (sube con fuerza y volumen y no parece agotado)",
  ruptura: "«ruptura» (rompe máximos recientes con volumen)",
  rebote: "«rebote» (ha caído fuerte y empieza a girarse)",
  noticia: "«noticia» (una noticia concreta puede moverla)",
};

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
  // Contexto de las ideas antiguas, poco a poco (no frena la revisión si falla).
  await backfillFeatures(10).catch(() => 0);
  await scoreControls(market).catch(() => 0);
  await enrichFeatures(10).catch(() => 0);
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
          kind: { type: "string", enum: ENABLED_KINDS },
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

// ---------------------------------------------------------------------------
// Lo que veía FARO en cada idea (columna «features», fuera del esquema de Prisma a propósito: si la
// migración 20261114160000_trading_faro_features aún no se ha pasado, todo lo demás sigue funcionando).
// ---------------------------------------------------------------------------
async function saveFeatures(id: string, features: IdeaFeatures) {
  await prisma
    .$executeRaw(Prisma.sql`UPDATE public.trading_faro_ideas SET features = ${JSON.stringify(features)}::jsonb WHERE id = ${id}::uuid`)
    .catch((e) => console.error("[faro] guardar contexto (¿falta la migración trading_faro_features?)", e instanceof Error ? e.message.slice(0, 200) : e));
}

async function loadFeatures(ids?: string[]): Promise<Map<string, IdeaFeatures>> {
  if (ids && !ids.length) return new Map();
  try {
    const rows = await prisma.$queryRaw<{ id: string; features: IdeaFeatures }[]>(
      ids
        ? Prisma.sql`SELECT id::text AS id, features FROM public.trading_faro_ideas WHERE features IS NOT NULL AND id IN (${Prisma.join(ids.map((x) => Prisma.sql`${x}::uuid`))})`
        : Prisma.sql`SELECT id::text AS id, features FROM public.trading_faro_ideas WHERE features IS NOT NULL`,
    );
    // Las que no se pudieron reconstruir (sin velas) se guardan marcadas y no cuentan como contexto.
    return new Map(rows.filter((r) => r.features && !(r.features as { noData?: boolean }).noData).map((r) => [r.id, r.features]));
  } catch {
    return new Map();
  }
}

/**
 * Reconstruye lo que veía FARO en ideas antiguas (sin contexto guardado) con velas horarias públicas de
 * Binance de antes de publicarlas, la fase del mercado de ese día y las noticias de entonces. Unas pocas
 * en cada revisión del cron. Sin la migración de «features», no hace nada.
 */
export async function backfillFeatures(limit = 10): Promise<number> {
  let rows: { id: string; pair: string; created_at: Date; price: number; invalidation: number; target: number; valid_until: Date }[];
  try {
    rows = await prisma.$queryRaw(Prisma.sql`SELECT id::text AS id, pair, created_at, price, invalidation, target, valid_until
      FROM public.trading_faro_ideas WHERE features IS NULL ORDER BY created_at DESC LIMIT ${limit}`);
  } catch {
    return 0;
  }
  const rules = await eurPairs().catch(() => null);
  const btcCache = new Map<number, number | null>();
  let n = 0;
  for (const r of rows) {
    const t = r.created_at.getTime();
    const base = rules?.get(r.pair)?.base ?? r.pair.replace(/(EUR|USDC)$/, "");
    try {
      const bars = await hourlyUntil(r.pair, t);
      if (bars.length < 6) {
        await saveFeatures(r.id, { backfilled: true, noData: true } as unknown as IdeaFeatures);
        continue;
      }
      const hourKey = Math.floor(t / 3_600_000);
      if (!btcCache.has(hourKey)) {
        const btc = await hourlyUntil("BTCEUR", t).catch(() => []);
        const from = btc.length >= 25 ? btc[btc.length - 25].c : null;
        const to = btc.length ? btc[btc.length - 1].c : null;
        btcCache.set(hourKey, from && to ? ((to - from) / from) * 100 : null);
      }
      const [phase, news] = await Promise.all([
        marketPhaseAt(t).catch(() => null),
        prisma.news_items.count({ where: { status: "clasificada", relevant: true, published_at: { gte: new Date(t - DAY), lte: new Date(t) }, symbols: { has: base } } }).catch(() => 0),
      ]);
      const m = metricsOf(pastTicker(r.pair, base, r.price, bars), bars);
      const validHours = Math.max(1, Math.round((r.valid_until.getTime() - t) / 3_600_000));
      const f = ideaFeatures(m, [], { price: r.price, invalidation: r.invalidation, target: r.target, validHours }, { now: t, phase: phase ? { mode: phase.mode, days: phase.days } : null, btc24h: btcCache.get(hourKey) ?? null, news, atrPct: atrPct(bars, r.price) });
      await saveFeatures(r.id, { ...f, backfilled: true });
      n++;
    } catch (e) {
      console.error("[faro] reconstruir contexto", r.pair, e instanceof Error ? e.message.slice(0, 160) : e);
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Ideas de control (al azar). Tabla trading_faro_controls, solo por SQL directo: sin su migración
// (20261114220000_trading_faro_controls) no se crean ni se puntúan y nada más se ve afectado.
// ---------------------------------------------------------------------------
type Candidate = { m: Metrics; styles: KamikazeStyle[] };

async function createControls(
  runId: string,
  candidates: Candidate[],
  ideas: { price: number; invalidation: number; target: number; validHours: number }[],
  rules: Rules,
  ctx: { phase: { mode: string; days: number } | null; btc24h: number | null; newsOf: (base: string) => number; atrOf: (pair: string) => number | null },
) {
  const now = Date.now();
  for (const c of controlIdeas(candidates.map((x) => ({ pair: x.m.pair, price: x.m.price })), ideas)) {
    const cand = candidates.find((x) => x.m.pair === c.pair)!;
    const symbol = symbolOf(c.pair, rules) ?? `${c.pair.replace(/(EUR|USDC)$/, "")}-EUR`;
    const f = ideaFeatures(cand.m, cand.styles, c, { now, phase: ctx.phase, btc24h: ctx.btc24h, news: ctx.newsOf(cand.m.base), atrPct: ctx.atrOf(c.pair) });
    await prisma.$executeRaw(Prisma.sql`INSERT INTO public.trading_faro_controls
      (run_id, pair, symbol, price, invalidation, target, valid_until, last_price, best_pct, worst_pct, features)
      VALUES (${runId}::uuid, ${c.pair}, ${symbol}, ${c.price}, ${c.invalidation}, ${c.target}, ${new Date(now + c.validHours * 3_600_000)}, ${c.price}, 0, 0, ${JSON.stringify(f)}::jsonb)`);
  }
}

type ControlRow = { id: string; pair: string; created_at: Date; price: number; invalidation: number; target: number; valid_until: Date; best_pct: number | null; worst_pct: number | null };

async function scoreControls(market: Ticker[]): Promise<number> {
  let live: ControlRow[];
  try {
    live = await prisma.$queryRaw(Prisma.sql`SELECT id::text AS id, pair, created_at, price, invalidation, target, valid_until, best_pct, worst_pct
      FROM public.trading_faro_controls
      WHERE status = 'viva' AND (checked_at IS NULL OR checked_at < now() - make_interval(mins => ${CHECK_MIN}::int))
      ORDER BY created_at ASC LIMIT 40`);
  } catch {
    return 0;
  }
  let n = 0;
  for (const i of live) {
    try {
      const livePrice = market.find((t) => t.pair === i.pair)?.price ?? null;
      const bars = await barsSince(i.pair, i.created_at.getTime());
      const sc = scoreIdea(
        { price: i.price, invalidation: i.invalidation, target: i.target, createdAt: i.created_at.getTime(), validUntil: i.valid_until.getTime(), best: i.best_pct, worst: i.worst_pct },
        bars,
        Date.now(),
        livePrice,
      );
      await prisma.$executeRaw(Prisma.sql`UPDATE public.trading_faro_controls SET status = ${sc.status}, best_pct = ${sc.best}, worst_pct = ${sc.worst},
        last_price = ${sc.lastPrice}, exit_price = ${sc.exitPrice}, result_pct = ${sc.resultPct},
        resolved_at = ${sc.resolvedAt ? new Date(sc.resolvedAt) : null}, checked_at = now() WHERE id = ${i.id}::uuid`);
      n++;
    } catch (e) {
      console.error("[faro] puntuar control", i.pair, e instanceof Error ? e.message.slice(0, 160) : e);
    }
  }
  return n;
}

async function loadControls(): Promise<ResolvedIdea[]> {
  try {
    const rows = await prisma.$queryRaw<(ControlRow & { status: string; result_pct: number; resolved_at: Date | null; features: IdeaFeatures | null })[]>(
      Prisma.sql`SELECT id::text AS id, pair, created_at, price, invalidation, target, valid_until, best_pct, worst_pct, status, result_pct, resolved_at, features
        FROM public.trading_faro_controls WHERE status IN ('acierto', 'fallo', 'caducada') AND result_pct IS NOT NULL ORDER BY created_at ASC LIMIT 5000`,
    );
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at.getTime(),
      resolvedAt: r.resolved_at?.getTime() ?? null,
      kind: "control",
      conviction: 0,
      status: r.status as ResolvedIdea["status"],
      resultPct: r.result_pct,
      bestPct: r.best_pct ?? 0,
      worstPct: r.worst_pct ?? 0,
      rewardPct: ((r.target - r.price) / r.price) * 100,
      riskPct: ((r.price - r.invalidation) / r.price) * 100,
      features: r.features,
    }));
  } catch {
    return [];
  }
}

/**
 * Completa el contexto para probar stop y objetivo según la volatilidad: añade el ATR a las ideas que no
 * lo tienen y, en las ya resueltas, simula la rejilla stop × objetivo con sus velas de 5 min.
 * Unas pocas por revisión del cron.
 */
export async function enrichFeatures(limit = 10): Promise<number> {
  let n = 0;
  try {
    const noAtr = await prisma.$queryRaw<{ id: string; pair: string; created_at: Date; price: number }[]>(Prisma.sql`
      SELECT id::text AS id, pair, created_at, price FROM public.trading_faro_ideas
      WHERE features IS NOT NULL AND features->'atrPct' IS NULL AND features->'noData' IS NULL
      ORDER BY created_at DESC LIMIT ${limit}`);
    for (const r of noAtr) {
      const bars = await hourlyUntil(r.pair, r.created_at.getTime()).catch(() => []);
      const atr = atrPct(bars, r.price);
      await prisma.$executeRaw(Prisma.sql`UPDATE public.trading_faro_ideas
        SET features = features || ${JSON.stringify(atr ? { atrPct: Math.round(atr * 100) / 100 } : { atrPct: 0 })}::jsonb WHERE id = ${r.id}::uuid`);
      n++;
    }
    const toSim = await prisma.$queryRaw<{ id: string; pair: string; created_at: Date; price: number; valid_until: Date; atr: number }[]>(Prisma.sql`
      SELECT id::text AS id, pair, created_at, price, valid_until, (features->>'atrPct')::float AS atr FROM public.trading_faro_ideas
      WHERE status IN ('acierto', 'fallo', 'caducada') AND (features->>'atrPct')::float > 0 AND features->'sim' IS NULL
      ORDER BY created_at DESC LIMIT ${limit}`);
    for (const r of toSim) {
      try {
        const bars = await barsSince(r.pair, r.created_at.getTime());
        const sim = simulateLevels({ price: r.price, createdAt: r.created_at.getTime(), validUntil: r.valid_until.getTime() }, r.atr, bars, Date.now());
        await prisma.$executeRaw(Prisma.sql`UPDATE public.trading_faro_ideas
          SET features = features || jsonb_build_object('sim', ${JSON.stringify(sim)}::jsonb) WHERE id = ${r.id}::uuid`);
        n++;
      } catch (e) {
        console.error("[faro] simular niveles", r.pair, e instanceof Error ? e.message.slice(0, 160) : e);
      }
    }
  } catch {
    // Sin la columna «features»: nada que hacer.
  }
  return n;
}

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
    const atrOf = new Map<string, number | null>();
    for (const t of pre.values()) {
      try {
        const hb = await hourly(t.pair);
        detailed.push(metricsOf(t, hb));
        atrOf.set(t.pair, atrPct(hb, t.price));
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
      `Tipos que puedes usar: ${ENABLED_KINDS.map((k) => KIND_TEXT[k]).join(", ")}. No propongas otros tipos.`,
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
    // Contexto para guardar con cada idea (fase del mercado y Bitcoin): si falla, se guarda sin él.
    const phase = await getMarketPhase().catch(() => null);
    const btc = market.find((t) => t.base === "BTC");
    for (const i of ok) {
      const symbol = symbolOf(i.pair, rules) ?? `${i.pair.replace(/(EUR|USDC)$/, "")}-EUR`;
      const inst = await ensureInstrument(symbol, rules.get(i.pair)?.base ?? symbol.replace(/-EUR$/, ""));
      await setLive(inst.id, i.price);
      const cand = candidates.find((c) => c.m.pair === i.pair);
      const features = cand
        ? ideaFeatures(cand.m, cand.styles, i, {
            now: Date.now(),
            phase: phase ? { mode: phase.mode, days: phase.days } : null,
            btc24h: btc ? btc.ch24h : null,
            news: news.filter((n) => n.symbols.includes(cand.m.base)).length,
            atrPct: atrOf.get(i.pair) ?? null,
          })
        : null;
      const created = await prisma.trading_faro_ideas.create({
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
      if (features) await saveFeatures(created.id, features);
    }
    // Control: las mismas veces, monedas al azar entre las candidatas, mismo riesgo y recorrido.
    await createControls(runId, candidates, ok, rules, {
      phase: phase ? { mode: phase.mode, days: phase.days } : null,
      btc24h: btc ? btc.ch24h : null,
      newsOf: (base) => news.filter((n) => n.symbols.includes(base)).length,
      atrOf: (pair) => atrOf.get(pair) ?? null,
    }).catch((e) => console.error("[faro] control", e instanceof Error ? e.message.slice(0, 200) : e));
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
export async function boardIdeas(): Promise<(BoardIdea & { symbol: string; rationale: string; runId: string | null; faro2: ReturnType<typeof faro2Verdict> })[]> {
  const rows = await prisma.trading_faro_ideas.findMany({ where: { status: "viva", valid_until: { gt: new Date() } }, orderBy: { created_at: "desc" } });
  const features = await loadFeatures(rows.map((r) => r.id));
  return rows.map((i) => ({
    /** FARO-2: si la deja pasar (null = sin contexto guardado). */
    faro2: faro2Verdict(i.kind, features.get(i.id) ?? null),
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
  const [live, past, last, state, groups, features] = await Promise.all([
    prisma.trading_faro_ideas.findMany({ where: { status: "viva" }, orderBy: { created_at: "desc" } }),
    prisma.trading_faro_ideas.findMany({ where: { status: { not: "viva" } }, orderBy: { created_at: "desc" }, take: 300 }),
    prisma.trading_faro_runs.findFirst({ where: { status: "ok" }, orderBy: { created_at: "desc" } }),
    accountState(workspaceId),
    prisma.trading_faro_ideas.groupBy({ by: ["kind", "status"], where: { status: { not: "viva" } }, _count: { _all: true }, _avg: { result_pct: true } }),
    loadFeatures(),
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
  // Tus compras con dinero real (Mis operaciones).
  const manual = await prisma.trading_manual_trades
    .findMany({ where: { workspace_id: workspaceId, idea_id: { not: null }, status: { in: ["abierta", "vendiendo", "cerrada", "error"] } } })
    .catch(() => []);
  for (const t of manual) {
    const idea = all.find((i) => i.id === t.idea_id);
    if (!idea || !t.idea_id) continue;
    const invested = (t.quantity ?? 0) * (t.entry_price ?? 0) || t.amount;
    const now = t.status === "cerrada" ? t.exit_price : (idea.last_price ?? null);
    const result = t.status === "cerrada" ? t.result : t.entry_price && now && t.quantity ? (now - t.entry_price) * t.quantity : null;
    const list = byIdea.get(t.idea_id) ?? [];
    list.push({
      who: "tu",
      name: "Tú (dinero real)",
      color: "slate",
      status: t.status,
      entry: t.entry_price,
      invested,
      result,
      resultPct: result !== null && invested > 0 ? (result / invested) * 100 : null,
    });
    byIdea.set(t.idea_id, list);
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
    /** FARO-2 (en pruebas): si la habría dejado pasar y por qué no. null = sin contexto guardado. */
    faro2: faro2Verdict(i.kind, features.get(i.id) ?? null),
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

export type AnalysisSegment = "todas" | "faro2" | "descartadas" | "azar";

/**
 * Análisis del rendimiento de FARO con sus ideas ya resueltas (pestaña «Análisis»). `segment` elige qué
 * ideas: todas, las que habría dejado pasar FARO-2 o las que habría descartado (solo las que tienen contexto).
 */
export async function faroAnalysis(segment: AnalysisSegment = "todas") {
  const [rows, features, controls] = await Promise.all([
    prisma.trading_faro_ideas.findMany({
      where: { status: { in: ["acierto", "fallo", "caducada"] }, result_pct: { not: null } },
      orderBy: { created_at: "asc" },
      take: 5000,
    }),
    loadFeatures(),
    loadControls(),
  ]);
  const ideas: (ResolvedIdea & { verdict: ReturnType<typeof faro2Verdict> })[] = rows.map((r) => {
    const f = features.get(r.id) ?? null;
    return {
      id: r.id,
      createdAt: r.created_at.getTime(),
      resolvedAt: r.resolved_at?.getTime() ?? null,
      kind: r.kind,
      conviction: r.conviction,
      status: r.status as ResolvedIdea["status"],
      resultPct: r.result_pct ?? 0,
      bestPct: r.best_pct ?? 0,
      worstPct: r.worst_pct ?? 0,
      rewardPct: ((r.target - r.price) / r.price) * 100,
      riskPct: ((r.price - r.invalidation) / r.price) * 100,
      features: f,
      verdict: faro2Verdict(r.kind, f),
    };
  });
  const judged = ideas.filter((i) => i.verdict);
  const pass = judged.filter((i) => i.verdict!.pass);
  const rejected = judged.filter((i) => !i.verdict!.pass);
  const reasons = new Map<string, { n: number; sum: number }>();
  for (const i of rejected)
    for (const why of i.verdict!.reasons) {
      // Agrupar por el motivo sin las cifras («ya había subido … en 24 h»).
      const key = why.replace(/[+−-]?\d+(,\d+)?\s?%/g, "…").replace(/\(.*\)/, "").trim();
      const e = reasons.get(key) ?? { n: 0, sum: 0 };
      reasons.set(key, { n: e.n + 1, sum: e.sum + i.resultPct });
    }
  const summary = (list: ResolvedIdea[]) => {
    const a = analyze(list);
    return { n: a.n, avgPct: a.total.avgPct, hitRate: a.total.hitRate, totalEur: a.total.totalEur, profitFactor: a.profitFactor };
  };
  // Control al azar: se compara con las ideas de FARO del mismo periodo (desde el primer control).
  const controlSince = controls.length ? Math.min(...controls.map((c) => c.createdAt)) : null;
  const sameWindow = controlSince === null ? [] : ideas.filter((i) => i.createdAt >= controlSince);
  const controlPass = controls.filter((c) => faro2Verdict("control", c.features)?.pass);
  const chosen = segment === "faro2" ? pass : segment === "descartadas" ? rejected : segment === "azar" ? controls : ideas;
  return {
    ...analyze(chosen),
    segment,
    totalIdeas: ideas.length,
    faro2: {
      judged: judged.length,
      all: summary(judged),
      pass: summary(pass),
      rejected: summary(rejected),
      /** Control al azar (mismas candidatas, mismo riesgo y recorrido) y FARO en el mismo periodo. */
      controlSince,
      control: summary(controls),
      controlPass: summary(controlPass),
      faroSameWindow: summary(sameWindow),
      faro2SameWindow: summary(sameWindow.filter((i) => i.verdict?.pass)),
      reasons: [...reasons.entries()].map(([reason, v]) => ({ reason, n: v.n, avgPct: Math.round((v.sum / v.n) * 100) / 100 })).sort((a, b) => b.n - a.n),
    },
  };
}
