// lib/trading/news/service.ts
// Agentes de noticias: leen los feeds, guardan lo nuevo y lo clasifican con IA.
import "server-only";
import type { Prisma, news_items } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AiBudgetError, aiJson, aiModelInfo, usageToday } from "../ai";
import { CLASSIFY_SCHEMA, classifyInput, classifyInstructions, normalizeClassification, type AssetRef, type NewsToClassify } from "./classify";
import { parseFeed, titleKey } from "./feed";
import { isCryptoMarket } from "../market-data";
import { CRYPTO_ASSETS, MARKET_TAGS, buildSources, type FeedSource, type NewsMarket } from "./sources";

/** Cada feed se vuelve a leer como mucho cada media hora. */
const FEED_COOLDOWN_MS = 30 * 60_000;
/** Solo se guardan noticias de los últimos días. */
const MAX_AGE_DAYS = 3;
/** Se borran las noticias con más de dos meses. */
const RETENTION_DAYS = 60;
const BATCH = 20;
const PARALLEL_FEEDS = 8;
const PARALLEL_AI = 3;
const MAX_ATTEMPTS = 3;

async function universe() {
  // Solo bolsa: las criptomonedas tienen su propia lista (CRYPTO_ASSETS) con símbolos cortos (BTC, ETH…).
  const instruments = (await prisma.market_instruments.findMany({ where: { active: true }, orderBy: { name: "asc" } })).filter(
    (i) => !isCryptoMarket(i.market),
  );
  const assets: AssetRef[] = [
    ...instruments.filter((i) => !i.is_index).map((i) => ({ symbol: i.symbol, name: i.name })),
    ...CRYPTO_ASSETS,
  ];
  const names: Record<string, string> = Object.fromEntries(assets.map((a) => [a.symbol, a.name]));
  Object.assign(names, MARKET_TAGS);
  return { instruments, assets, names, valid: new Set(Object.keys(names)) };
}

async function fetchFeed(src: FeedSource) {
  const res = await fetch(src.url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Crussader/1.0; lector de noticias)", Accept: "application/rss+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`respondió ${res.status}`);
  return parseFeed(await res.text());
}

async function saveItems(src: FeedSource, items: ReturnType<typeof parseFeed>) {
  const now = Date.now();
  const fresh = items.filter((i) => {
    const t = i.publishedAt?.getTime() ?? now;
    return t > now - MAX_AGE_DAYS * 86_400_000 && t < now + 3_600_000;
  });
  if (!fresh.length) return 0;
  const res = await prisma.news_items.createMany({
    data: fresh.map((i) => ({
      url: i.url,
      title_key: titleKey(i.title),
      market: src.market,
      feed: src.key,
      publisher: i.publisher ?? src.label,
      title: i.title,
      snippet: i.snippet || null,
      published_at: i.publishedAt ?? new Date(),
      hints: src.hint ? [src.hint] : [],
    })),
    skipDuplicates: true,
  });
  // La misma noticia puede salir en la búsqueda de otro valor: se añade la pista.
  if (src.hint) {
    await prisma.$executeRaw`
      UPDATE news_items SET hints = array_append(hints, ${src.hint})
      WHERE url = ANY(${fresh.map((i) => i.url)}::text[]) AND NOT (${src.hint} = ANY(hints)) AND status = 'pendiente'`;
  }
  return res.count;
}

export type NewsSyncSummary = {
  feedsRead: number;
  feedsFailed: { feed: string; error: string }[];
  feedsPending: number;
  newItems: number;
  classified: number;
  discarded: number;
  pending: number;
  budgetReached: boolean;
  error: string | null;
};

export async function syncNews(budgetMs = 40_000): Promise<NewsSyncSummary> {
  const started = Date.now();
  const left = () => budgetMs - (Date.now() - started);
  const { instruments, assets, valid } = await universe();
  const out: NewsSyncSummary = { feedsRead: 0, feedsFailed: [], feedsPending: 0, newItems: 0, classified: 0, discarded: 0, pending: 0, budgetReached: false, error: null };

  // 1) Leer los feeds que toca.
  const sources = buildSources(instruments.map((i) => ({ symbol: i.symbol, name: i.name, isIndex: i.is_index })));
  const states = new Map((await prisma.news_feed_state.findMany()).map((s) => [s.feed, s]));
  const due = sources
    .filter((s) => {
      const st = states.get(s.key);
      return !st?.last_run_at || Date.now() - st.last_run_at.getTime() > FEED_COOLDOWN_MS;
    })
    .sort((a, b) => (states.get(a.key)?.last_run_at?.getTime() ?? 0) - (states.get(b.key)?.last_run_at?.getTime() ?? 0));
  let k = 0;
  while (k < due.length && left() > budgetMs * 0.55) {
    const batch = due.slice(k, k + PARALLEL_FEEDS);
    k += batch.length;
    await Promise.all(
      batch.map(async (src) => {
        const now = new Date();
        try {
          const items = await fetchFeed(src);
          const n = await saveItems(src, items);
          out.feedsRead++;
          out.newItems += n;
          await prisma.news_feed_state.upsert({
            where: { feed: src.key },
            create: { feed: src.key, last_run_at: now, last_ok_at: now, last_count: n },
            update: { last_run_at: now, last_ok_at: now, last_error: null, last_count: n },
          });
        } catch (e) {
          const error = e instanceof Error ? (e.name === "TimeoutError" ? "no respondió a tiempo" : e.message.slice(0, 200)) : "error";
          out.feedsFailed.push({ feed: src.label, error });
          await prisma.news_feed_state.upsert({
            where: { feed: src.key },
            create: { feed: src.key, last_run_at: now, last_error: error },
            update: { last_run_at: now, last_error: error },
          });
        }
      }),
    );
  }
  out.feedsPending = due.length - k;

  // 2) Clasificar lo pendiente, lo más reciente primero.
  const instructions = classifyInstructions([...assets]);
  const model = aiModelInfo().fast;
  while (left() > 12_000) {
    const pending = await prisma.news_items.findMany({
      where: { status: "pendiente" },
      orderBy: { published_at: "desc" },
      take: BATCH * PARALLEL_AI,
    });
    if (!pending.length) break;
    const batches: typeof pending[] = [];
    for (let i = 0; i < pending.length; i += BATCH) batches.push(pending.slice(i, i + BATCH));
    let stop = false;
    await Promise.all(
      batches.map(async (rows) => {
        const items: NewsToClassify[] = rows.map((r) => ({
          id: r.id,
          market: r.market as NewsMarket,
          title: r.title,
          snippet: r.snippet ?? "",
          publisher: r.publisher,
          hints: r.hints,
        }));
        try {
          const raw = await aiJson<unknown>({
            tier: "fast",
            purpose: "noticias",
            instructions,
            input: `Clasifica estas ${items.length} noticias. Devuelve solo JSON según el contrato.\n${classifyInput(items)}`,
            schemaName: "news_classification",
            schema: CLASSIFY_SCHEMA as unknown as Record<string, unknown>,
            maxOutputTokens: 8000,
          });
          const { results, missing } = normalizeClassification(raw, items, valid);
          const now = new Date();
          await prisma.$transaction(
            results.map((r) =>
              prisma.news_items.update({
                where: { id: r.id },
                data: {
                  status: r.relevant ? "clasificada" : "descartada",
                  relevant: r.relevant,
                  symbols: r.symbols,
                  category: r.category,
                  sentiment: r.sentiment,
                  impact: r.impact,
                  summary: r.summary || null,
                  model,
                  classified_at: now,
                  attempts: { increment: 1 },
                },
              }),
            ),
          );
          out.classified += results.filter((r) => r.relevant).length;
          out.discarded += results.filter((r) => !r.relevant).length;
          if (missing.length) await markFailed(missing);
        } catch (e) {
          if (e instanceof AiBudgetError) {
            out.budgetReached = true;
            out.error = e.message;
            stop = true;
            return;
          }
          out.error = e instanceof Error ? e.message.slice(0, 300) : "Falló la clasificación";
          await markFailed(rows.map((r) => r.id));
          stop = true;
        }
      }),
    );
    if (stop) break;
  }

  await prisma.news_items.deleteMany({ where: { published_at: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) } } });
  out.pending = await prisma.news_items.count({ where: { status: "pendiente" } });
  return out;
}

async function markFailed(ids: string[]) {
  if (!ids.length) return;
  await prisma.$executeRaw`
    UPDATE news_items
    SET attempts = attempts + 1, status = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'error' ELSE status END
    WHERE id = ANY(${ids}::uuid[])`;
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------
export type NewsRow = {
  id: string;
  url: string;
  market: NewsMarket;
  publisher: string | null;
  title: string;
  summary: string | null;
  publishedAt: string;
  symbols: string[];
  category: string | null;
  sentiment: number;
  impact: number;
};

const toRow = (r: news_items): NewsRow => ({
  id: r.id,
  url: r.url,
  market: r.market as NewsMarket,
  publisher: r.publisher,
  title: r.title,
  summary: r.summary,
  publishedAt: r.published_at.toISOString(),
  symbols: r.symbols,
  category: r.category,
  sentiment: r.sentiment ?? 0,
  impact: r.impact ?? 0,
});

export type NewsFilters = { market: "todo" | NewsMarket; important: boolean; symbol: string | null; days: number };

export function normalizeNewsFilters(p: URLSearchParams): NewsFilters {
  const market = p.get("market");
  return {
    market: market === "bolsa" || market === "crypto" ? market : "todo",
    important: p.get("important") !== "0",
    symbol: (p.get("symbol") || "").trim().toUpperCase().slice(0, 20) || null,
    days: Math.max(1, Math.min(30, Number(p.get("days")) || 7)),
  };
}

export async function listNews(f: NewsFilters) {
  const since = new Date(Date.now() - f.days * 86_400_000);
  const where: Prisma.news_itemsWhereInput = {
    status: "clasificada",
    relevant: true,
    published_at: { gte: since },
    ...(f.market !== "todo" ? { market: f.market } : {}),
    ...(f.important ? { impact: { gte: 2 } } : {}),
    ...(f.symbol ? { symbols: { has: f.symbol } } : {}),
  };
  const day = new Date(Date.now() - 86_400_000);
  const [rows, recent, pending, lastFeed, failing, usage, { names }] = await Promise.all([
    prisma.news_items.findMany({ where, orderBy: { published_at: "desc" }, take: 150 }),
    prisma.news_items.findMany({
      where: { status: "clasificada", relevant: true, published_at: { gte: day }, ...(f.market !== "todo" ? { market: f.market } : {}) },
      select: { symbols: true, sentiment: true, impact: true },
    }),
    prisma.news_items.count({ where: { status: "pendiente" } }),
    prisma.news_feed_state.aggregate({ _max: { last_ok_at: true } }),
    prisma.news_feed_state.count({ where: { last_error: { not: null } } }),
    usageToday(),
    universe(),
  ]);
  // Lo más comentado en 24 h, con el tono medio.
  const agg = new Map<string, { n: number; s: number; important: number }>();
  for (const r of recent)
    for (const s of r.symbols) {
      const a = agg.get(s) ?? { n: 0, s: 0, important: 0 };
      a.n++;
      a.s += r.sentiment ?? 0;
      if ((r.impact ?? 0) >= 2) a.important++;
      agg.set(s, a);
    }
  const trending = [...agg.entries()]
    .map(([symbol, a]) => ({ symbol, name: names[symbol] ?? symbol, count: a.n, important: a.important, tone: a.s / a.n }))
    .sort((a, b) => b.important - a.important || b.count - a.count)
    .slice(0, 8);
  return {
    items: rows.map(toRow),
    names,
    trending,
    today: {
      total: recent.length,
      important: recent.filter((r) => (r.impact ?? 0) >= 2).length,
      positive: recent.filter((r) => (r.sentiment ?? 0) > 0).length,
      negative: recent.filter((r) => (r.sentiment ?? 0) < 0).length,
    },
    pending,
    lastFetchAt: lastFeed._max.last_ok_at?.toISOString() ?? null,
    failingFeeds: failing,
    usage,
    ai: aiModelInfo(),
  };
}

export async function newsForSymbol(symbol: string, limit = 6) {
  const rows = await prisma.news_items.findMany({
    where: { status: "clasificada", relevant: true, symbols: { has: symbol }, impact: { gte: 1 } },
    orderBy: { published_at: "desc" },
    take: limit,
  });
  return rows.map(toRow);
}
