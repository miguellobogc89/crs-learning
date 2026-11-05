// lib/tenders/sync.ts
import "server-only";
import { prisma } from "@/lib/prisma";
import {
  PLACSP_AGGREGATED_FEED_URL,
  PLACSP_FEED_URL,
  PLACSP_MINOR_FEED_URL,
  isOpenOpportunity,
  parseFeedPage,
  type ParsedFeedPage,
  type ParsedTender,
} from "./placsp";
import { walkFeed, type WalkState } from "./walker";

const FEEDS = [
  { key: "licitaciones", url: PLACSP_FEED_URL },
  { key: "agregadas", url: PLACSP_AGGREGATED_FEED_URL },
  { key: "menores", url: PLACSP_MINOR_FEED_URL },
] as const;
/**
 * La carga inicial baja hasta aquí. Los simplificados abren plazo de 10 a 20 días hábiles,
 * así que lo publicado hace más de 45 días casi nunca sigue en plazo.
 */
const BACKFILL_DAYS = 45;
/** Espera máxima por página: PLACSP a veces tarda bastante en servir sus ficheros de 500 entradas. */
const REQUEST_TIMEOUT_MS = 40_000;
/** Estimación inicial de lo que tarda una página (descarga + lectura + guardado) hasta medirlo. */
const FIRST_PAGE_ESTIMATE_MS = 15_000;

export type SyncSummary = {
  feeds: {
    feed: string;
    pages: number;
    tenders: number;
    backfillDone: boolean;
    /** Hasta qué fecha ha bajado la carga inicial. */
    reached: string | null;
    skipped?: boolean;
    error?: string;
  }[];
  open: number;
  /** Fecha hasta la que baja la carga inicial. */
  target: string;
};

async function fetchPage(url: string, timeoutMs: number): Promise<ParsedFeedPage> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Crussader/1.0 (lector del feed abierto de licitaciones)" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))
      throw new Error(`la Plataforma tardó más de ${Math.round(timeoutMs / 1000)} s en responder`);
    throw e;
  }
  if (!res.ok) throw new Error(`PLACSP respondió ${res.status}`);
  return parseFeedPage(await res.text());
}

function row(t: ParsedTender) {
  return {
    folder_id: t.folderId,
    title: t.title.slice(0, 2000),
    url: t.url,
    status: t.status,
    kind: t.kind ?? "otro",
    is_software: t.isSoftware,
    contracting_body: t.contractingBody,
    contract_type: t.contractType,
    procedure_code: t.procedureCode,
    estimated_amount: t.estimatedAmount,
    budget_without_tax: t.budgetWithoutTax,
    budget_with_tax: t.budgetWithTax,
    cpv_codes: t.cpvCodes,
    province: t.province,
    city: t.city,
    deadline: t.deadline,
    source_updated_at: t.updatedAt,
    summary: t.summary?.slice(0, 4000) ?? null,
  };
}

/**
 * Guarda una página: añade las oportunidades en plazo y actualiza el estado de las que ya
 * teníamos (adjudicadas, anuladas, borradas). Nunca pisa datos con una versión más antigua,
 * porque la carga inicial lee el feed hacia atrás.
 */
export async function applyPage(page: ParsedFeedPage, now = new Date()) {
  const ids = [...new Set([...page.tenders.map((t) => t.externalId), ...page.deletedIds])];
  if (!ids.length) return;
  const known = new Map(
    (
      await prisma.public_tenders.findMany({
        where: { external_id: { in: ids } },
        select: { external_id: true, source_updated_at: true },
      })
    ).map((r) => [r.external_id, r.source_updated_at]),
  );
  const isNewer = (t: ParsedTender) => {
    const current = known.get(t.externalId);
    return !current || !t.updatedAt || t.updatedAt.getTime() >= current.getTime();
  };
  // Si una licitación aparece varias veces en la página, nos quedamos con su versión más reciente.
  const latest = new Map<string, ParsedTender>();
  for (const t of page.tenders) {
    const prev = latest.get(t.externalId);
    if (!prev || (t.updatedAt?.getTime() ?? 0) > (prev.updatedAt?.getTime() ?? 0))
      latest.set(t.externalId, t);
  }
  const fresh = [...latest.values()].filter(isNewer);
  const toCreate = fresh.filter((t) => !known.has(t.externalId) && isOpenOpportunity(t, now));
  const toUpdate = fresh.filter((t) => known.has(t.externalId));
  const deleted = page.deletedIds.filter((id) => known.has(id));

  await prisma.$transaction([
    ...(toCreate.length
      ? [
          prisma.public_tenders.createMany({
            data: toCreate.map((t) => ({ external_id: t.externalId, ...row(t) })),
            skipDuplicates: true,
          }),
        ]
      : []),
    ...toUpdate.map((t) =>
      prisma.public_tenders.update({
        where: { external_id: t.externalId },
        data: { ...row(t), updated_at: now },
      }),
    ),
    ...(deleted.length
      ? [
          prisma.public_tenders.updateMany({
            where: { external_id: { in: deleted } },
            data: { status: "BORRADA", updated_at: now },
          }),
        ]
      : []),
  ]);
}

function toWalkState(s: {
  head_seen_at: Date | null;
  gap_url: string | null;
  gap_until: Date | null;
  backfill_url: string | null;
  backfill_done: boolean;
} | null): WalkState {
  return {
    headSeenAt: s?.head_seen_at ?? null,
    gapUrl: s?.gap_url ?? null,
    gapUntil: s?.gap_until ?? null,
    backfillUrl: s?.backfill_url ?? null,
    backfillDone: s?.backfill_done ?? false,
  };
}

/** Lee novedades de los feeds dentro de un tiempo máximo. Se puede llamar tantas veces como haga falta. */
export async function syncTenders(budgetMs = 45_000): Promise<SyncSummary> {
  const started = Date.now();
  const deadline = started + budgetMs;
  const backfillUntil = new Date(started - BACKFILL_DAYS * 86_400_000);
  const summary: SyncSummary = { feeds: [], open: 0, target: backfillUntil.toISOString() };
  // Solo se pide otra página si, por lo que han tardado las anteriores, da tiempo a terminarla.
  const pageTimes: number[] = [];
  const expectedPageMs = () =>
    pageTimes.length ? Math.max(...pageTimes.slice(-3)) : FIRST_PAGE_ESTIMATE_MS;
  const hasTime = () => deadline - Date.now() > expectedPageMs() * 1.2 + 2_000;
  const timedFetch = async (url: string) => {
    const startedAt = Date.now();
    const timeout = Math.min(REQUEST_TIMEOUT_MS, Math.max(5_000, deadline - Date.now() - 1_000));
    const page = await fetchPage(url, timeout);
    pageTimes.push(Date.now() - startedAt);
    return page;
  };

  // Van en orden y cada uno usa todo el tiempo que necesite: primero las licitaciones de la
  // Plataforma, luego las autonómicas agregadas y, con lo que sobre, los contratos menores
  // (casi siempre ya adjudicados).
  for (const feed of FEEDS) {
    const stored = await prisma.tender_sync_state.findUnique({ where: { feed: feed.key } });
    const previous = (stored?.last_result ?? {}) as { reached?: string | null };
    if (!hasTime()) {
      summary.feeds.push({
        feed: feed.key,
        pages: 0,
        tenders: 0,
        backfillDone: stored?.backfill_done ?? false,
        reached: previous.reached ?? null,
        skipped: true,
      });
      continue;
    }
    const state = toWalkState(stored);
    const pendingBehind = !!state.gapUrl || (!state.backfillDone && !!state.backfillUrl);
    const readRecently =
      !!stored?.last_run_at && Date.now() - stored.last_run_at.getTime() < 20 * 60_000;
    const result = await walkFeed(state, {
      feedUrl: feed.url,
      fetchPage: timedFetch,
      applyPage: (page) => applyPage(page),
      hasTime,
      backfillUntil,
      // Mientras dura la carga inicial no hace falta releer la cabecera en cada pulsación.
      skipHead: pendingBehind && readRecently,
    });
    const s = result.state;
    const reached = result.reached?.toISOString() ?? previous.reached ?? null;
    const data = {
      head_seen_at: s.headSeenAt,
      gap_url: s.gapUrl,
      gap_until: s.gapUntil,
      backfill_url: s.backfillUrl,
      backfill_done: s.backfillDone,
      last_run_at: new Date(),
      last_result: { pages: result.pages, tenders: result.tenders, reached, error: result.error },
    };
    await prisma.tender_sync_state.upsert({
      where: { feed: feed.key },
      create: { feed: feed.key, ...data },
      update: data,
    });
    summary.feeds.push({
      feed: feed.key,
      pages: result.pages,
      tenders: result.tenders,
      backfillDone: s.backfillDone,
      reached,
      ...(result.error ? { error: result.error } : {}),
    });
  }

  summary.open = await prisma.public_tenders.count({
    where: { status: "PUB", OR: [{ deadline: null }, { deadline: { gt: new Date() } }] },
  });
  return summary;
}

export async function syncStatus() {
  const states = await prisma.tender_sync_state.findMany({ orderBy: { feed: "asc" } });
  return states.map((s) => ({
    feed: s.feed,
    lastRunAt: s.last_run_at,
    backfillDone: s.backfill_done,
    pending: !!s.gap_url || (!s.backfill_done && !!s.backfill_url),
    lastResult: s.last_result,
  }));
}
