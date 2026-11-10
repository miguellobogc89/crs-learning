// lib/trading/service.ts
// Lo que consume la pantalla: panorama del mercado, recomendaciones, ficha de un valor
// y el proceso diario completo (datos → backtest → carteras → modo automático).
import "server-only";
import { prisma } from "@/lib/prisma";
import { accountState, costOf, ensureAccount, OPEN_STATUSES, placeOrder, processAccount } from "./accounts";
import { analyze, backtestSeries } from "./backtest";
import { DEFAULT_COSTS } from "./risk";
import { newsForSymbol, syncNews, type NewsSyncSummary } from "./news/service";
import { simulatePortfolio, type SimSeries, type SimSettings } from "./simulate";
import { indicatorBundle, trendAt } from "./indicators";
import { PATTERN_LIBRARY } from "./library";
import { fetchDailyCandles, INDEX_SYMBOL } from "./market-data";
import { rankRecommendations, recommendForInstrument, regimeFrom, type AccountView, type Recommendation, type Regime } from "./recommend";
import { dayKey, ensureUniverse, latestBacktest, loadRecent, loadSeries, runBacktest, syncMarket } from "./sync";
import type { Candle, Detection, Direction, PatternKey } from "./types";

/** Sesiones que se cargan para detectar figuras vivas (los pivotes necesitan algo de historia). */
const LIVE_WINDOW = 420;
/** Solo se evalúan figuras formadas en las últimas sesiones. */
const LIVE_LOOKBACK = 160;

export type MarketRow = {
  symbol: string;
  name: string;
  sector: string | null;
  isIndex: boolean;
  lastDay: string | null;
  close: number | null;
  change1d: number | null;
  change20d: number | null;
  trend: "up" | "down" | "flat";
  rsi: number | null;
  distSma200: number | null;
  signals: number;
  lastError: string | null;
};

async function universe() {
  await ensureUniverse();
  const instruments = await prisma.market_instruments.findMany({ where: { active: true }, orderBy: [{ is_index: "desc" }, { name: "asc" }] });
  const since = new Date(Date.now() - Math.round(LIVE_WINDOW * 1.5) * 86_400_000);
  const series = await loadSeries(instruments.map((i) => i.id), since);
  return { instruments, series };
}

function pct(a: number, b: number) {
  return b ? ((a - b) / b) * 100 : null;
}

function accountView(state: Awaited<ReturnType<typeof accountState>>): AccountView {
  const holdings: Record<string, Direction> = {};
  for (const p of state.positions) if ((OPEN_STATUSES as readonly string[]).includes(p.status)) holdings[p.symbol] = p.direction;
  return {
    equity: state.summary.equity,
    cash: state.summary.cash,
    riskPct: state.account.risk_per_trade_pct,
    maxPositionPct: state.account.max_position_pct,
    allowShort: state.account.allow_short,
    minScore: state.account.min_score,
    cost: costOf(state.account),
    holdings,
  };
}

/** Analiza todo el universo y genera las recomendaciones para la cartera de un espacio. */
async function computeRecommendations(workspaceId: string) {
  const [{ instruments, series }, backtest, state] = await Promise.all([universe(), latestBacktest(), accountState(workspaceId)]);
  const view = accountView(state);
  const index = instruments.find((i) => i.is_index);
  const idxCandles = index ? series.get(index.id) ?? [] : [];
  const regime: Regime = idxCandles.length ? regimeFrom(idxCandles, indicatorBundle(idxCandles)) : "lateral";
  const stats = backtest?.byPattern ?? {};
  const filter = state.account.patterns.length ? new Set(state.account.patterns) : null;

  const recs: Recommendation[] = [];
  const market: MarketRow[] = [];
  for (const inst of instruments) {
    const c = series.get(inst.id) ?? [];
    const last = c.length - 1;
    let detections: Detection[] = [];
    let ind = null as ReturnType<typeof indicatorBundle> | null;
    if (c.length >= 60) {
      const a = analyze(c, Math.max(0, c.length - LIVE_LOOKBACK));
      ind = a.ind;
      detections = a.detections.filter((d) => !filter || filter.has(d.pattern));
      if (!inst.is_index)
        recs.push(...recommendForInstrument({ symbol: inst.symbol, name: inst.name, candles: c, ind: a.ind, detections }, stats, regime, view));
    }
    const s200 = ind?.sma200[last] ?? null;
    market.push({
      symbol: inst.symbol,
      name: inst.name,
      sector: inst.sector,
      isIndex: inst.is_index,
      lastDay: last >= 0 ? dayKey(new Date(c[last].t)) : null,
      close: last >= 0 ? c[last].c : null,
      change1d: last >= 1 ? pct(c[last].c, c[last - 1].c) : null,
      change20d: last >= 20 ? pct(c[last].c, c[last - 20].c) : null,
      trend: ind && last >= 0 ? trendAt(ind, c, last) : "flat",
      rsi: ind?.rsi14[last] ?? null,
      distSma200: s200 && last >= 0 ? pct(c[last].c, s200) : null,
      signals: 0,
      lastError: inst.last_error,
    });
  }
  const ranked = rankRecommendations(recs);
  for (const m of market) m.signals = ranked.filter((r) => r.symbol === m.symbol && r.action !== "vigilar").length;
  return { ranked, market, regime, backtest, state, view };
}

export async function getOverview(workspaceId: string) {
  const { ranked, market, regime, backtest, state } = await computeRecommendations(workspaceId);
  const syncInfo = await prisma.market_instruments.aggregate({
    _max: { last_candle_at: true, last_sync_at: true },
    _count: { _all: true },
    where: { active: true },
  });
  const withData = await prisma.market_instruments.count({ where: { active: true, last_candle_at: { not: null } } });
  return {
    regime,
    asOf: syncInfo._max.last_candle_at ? dayKey(syncInfo._max.last_candle_at) : null,
    lastSyncAt: syncInfo._max.last_sync_at?.toISOString() ?? null,
    instruments: syncInfo._count._all,
    instrumentsWithData: withData,
    recommendations: ranked,
    market,
    account: state.summary,
    openPositions: state.positions.filter((p) => (OPEN_STATUSES as readonly string[]).includes(p.status)),
    backtest: backtest
      ? { asOf: backtest.asOf, trades: backtest.trades, instruments: backtest.instruments, overall: backtest.overall, createdAt: backtest.createdAt }
      : null,
  };
}

export async function getLibrary() {
  const bt = await latestBacktest();
  return {
    patterns: PATTERN_LIBRARY.map((p) => ({ ...p, stats: bt?.byPattern?.[p.key] ?? null })),
    backtest: bt
      ? { asOf: bt.asOf, trades: bt.trades, instruments: bt.instruments, overall: bt.overall, recent: bt.recent.slice(0, 30), createdAt: bt.createdAt }
      : null,
  };
}

export type ChartDetection = Omit<Detection, "points" | "lines" | "trigger"> & {
  points: { day: string; price: number; label?: string }[];
  lines: { from: { day: string; price: number }; to: { day: string; price: number }; label: string; role: string }[];
  startDay: string;
  formedDay: string;
  confirmDay: string | null;
};

export async function getInstrument(workspaceId: string, symbol: string) {
  const inst = await prisma.market_instruments.findUnique({ where: { symbol } });
  if (!inst) throw new Error("Valor no encontrado");
  const c = await loadRecent(inst.id, 900);
  const { ind, detections } = analyze(c, Math.max(0, c.length - 520));
  // Fechas para el eje: las líneas pueden proyectarse más allá de la última vela.
  const dayAt = (i: number) => {
    if (i < c.length) return dayKey(new Date(c[Math.max(0, i)].t));
    const extra = i - (c.length - 1);
    let t = c[c.length - 1].t;
    for (let k = 0; k < extra; k++) {
      t += 86_400_000;
      while ([0, 6].includes(new Date(t).getUTCDay())) t += 86_400_000;
    }
    return dayKey(new Date(t));
  };
  const chartDetections: ChartDetection[] = detections
    .sort((a, b) => b.formedAt - a.formedAt)
    .slice(0, 40)
    .map((d) => {
      const { points, lines, trigger: _trigger, ...rest } = d;
      void _trigger;
      return {
        ...rest,
        points: points.map((p) => ({ day: dayAt(p.i), price: p.price, label: p.label })),
        lines: lines.map((l) => ({
          from: { day: dayAt(l.from.i), price: l.from.price },
          to: { day: dayAt(l.to.i), price: l.to.price },
          label: l.label,
          role: l.role,
        })),
        startDay: dayAt(d.startIndex),
        formedDay: dayAt(Math.min(d.formedAt, c.length - 1)),
        confirmDay: d.confirmIndex !== null ? dayAt(d.confirmIndex) : null,
      };
    });
  const bt = await latestBacktest();
  const state = await accountState(workspaceId);
  // El gráfico arranca antes si alguna figura empieza antes de la ventana.
  const from = Math.max(0, Math.min(c.length - 520, ...chartDetections.map((d) => c.findIndex((x) => dayKey(new Date(x.t)) === d.startDay))) - 10);
  const slice = c.slice(from);
  return {
    symbol: inst.symbol,
    name: inst.name,
    sector: inst.sector,
    isIndex: inst.is_index,
    currency: inst.currency ?? "EUR",
    candles: slice.map((x) => ({ day: dayKey(new Date(x.t)), o: x.o, h: x.h, l: x.l, c: x.c, v: x.v })),
    sma50: ind.sma50.slice(from),
    sma200: ind.sma200.slice(from),
    rsi: ind.rsi14.slice(from),
    detections: chartDetections,
    stats: bt?.perSymbol?.[inst.symbol] ?? {},
    positions: state.positions.filter((p) => p.symbol === inst.symbol),
    news: await newsForSymbol(inst.symbol).catch(() => []),
  };
}

// ---------------------------------------------------------------------------
// Gestión del universo de valores
// ---------------------------------------------------------------------------
export async function listInstruments() {
  return prisma.market_instruments.findMany({ orderBy: [{ active: "desc" }, { is_index: "desc" }, { name: "asc" }] });
}

export async function addInstrument(symbolInput: unknown, nameInput: unknown) {
  const symbol = typeof symbolInput === "string" ? symbolInput.trim().toUpperCase().slice(0, 20) : "";
  if (!/^[\^A-Z0-9.\-=]{1,20}$/.test(symbol)) throw new Error("Símbolo no válido (formato de Yahoo Finance, p. ej. SAN.MC)");
  const existing = await prisma.market_instruments.findUnique({ where: { symbol } });
  if (existing) {
    await prisma.market_instruments.update({ where: { id: existing.id }, data: { active: true, last_sync_at: null } });
    return { symbol, reactivated: true };
  }
  // Comprueba que el proveedor lo conoce antes de darlo de alta.
  const probe = await fetchDailyCandles(symbol, { since: new Date(Date.now() - 20 * 86_400_000) });
  if (!probe.candles.length) throw new Error(`El proveedor no tiene cotizaciones de ${symbol}`);
  const name = typeof nameInput === "string" && nameInput.trim() ? nameInput.trim().slice(0, 80) : probe.name ?? symbol;
  await prisma.market_instruments.create({
    data: { symbol, name, market: symbol.endsWith(".MC") ? "Mercado continuo" : "Otro", currency: probe.currency },
  });
  return { symbol, reactivated: false };
}

export async function setInstrumentActive(symbol: string, active: boolean) {
  if (symbol === INDEX_SYMBOL && !active) throw new Error("El IBEX 35 se usa como referencia del mercado y no se puede quitar");
  await prisma.market_instruments.update({ where: { symbol }, data: { active } });
}

// ---------------------------------------------------------------------------
// Proceso diario
// ---------------------------------------------------------------------------
/** Abre en la cartera las señales fuertes, si el espacio tiene el modo automático activado. */
export async function autoTrade(workspaceId: string) {
  const account = await ensureAccount(workspaceId);
  if (!account.auto_trade) return { opened: 0 };
  const { ranked, view } = await computeRecommendations(workspaceId);
  let openCount = await prisma.trading_positions.count({ where: { account_id: account.id, status: { in: [...OPEN_STATUSES] } } });
  let opened = 0;
  for (const r of ranked) {
    if (openCount >= account.max_open_positions) break;
    if (!r.strong || !(r.action === "comprar" || r.action === "vender_corto")) continue;
    if (view.holdings[r.symbol]) continue;
    if (!r.sizing || r.sizing.quantity <= 0) continue;
    try {
      await placeOrder(workspaceId, null, {
        symbol: r.symbol,
        direction: r.direction,
        quantity: r.sizing.quantity,
        stop: r.stop,
        target: r.target,
        execution: "next_open",
        pattern: r.pattern,
        signalKey: r.key,
        score: r.score,
        maxHoldDays: r.maxHoldDays,
        notes: `Abierta por el modo automático. ${r.plan}`,
        source: "auto",
      });
      view.holdings[r.symbol] = r.direction;
      openCount++;
      opened++;
    } catch {
      // Señal duplicada o sin efectivo: se pasa a la siguiente.
    }
  }
  return { opened };
}

export type DailyRunSummary = {
  market: Awaited<ReturnType<typeof syncMarket>>;
  backtest: { asOf: string; trades: number } | null;
  accounts: { processed: number; filled: number; closed: number; cancelled: number; autoOpened: number };
  news: NewsSyncSummary | null;
  pending: boolean;
};

/** Datos → backtest → carteras. Con `workspaceId` solo procesa esa cartera. */
export async function runDaily(budgetMs = 45_000, workspaceId?: string): Promise<DailyRunSummary> {
  const started = Date.now();
  const market = await syncMarket(Math.max(5_000, budgetMs - 15_000));
  let backtest: DailyRunSummary["backtest"] = null;
  const accounts = { processed: 0, filled: 0, closed: 0, cancelled: 0, autoOpened: 0 };
  if (market.pending === 0) {
    const bt = await runBacktest();
    if (bt) backtest = { asOf: bt.asOf, trades: bt.trades };
    const list = await prisma.trading_accounts.findMany({ where: workspaceId ? { workspace_id: workspaceId } : {}, select: { id: true, workspace_id: true } });
    for (const a of list) {
      if (Date.now() - started > budgetMs) break;
      const r = await processAccount(a.id);
      accounts.processed++;
      accounts.filled += r.filled;
      accounts.closed += r.closed;
      accounts.cancelled += r.cancelled;
      accounts.autoOpened += (await autoTrade(a.workspace_id)).opened;
    }
  }
  // Con el tiempo que sobre, noticias (solo en el proceso diario completo).
  let news: NewsSyncSummary | null = null;
  const left = budgetMs - (Date.now() - started);
  if (!workspaceId && left > 15_000) news = await syncNews(left - 3_000).catch(() => null);
  return { market, backtest, accounts, news, pending: market.pending > 0 };
}

export type { Candle, PatternKey };

// ---------------------------------------------------------------------------
// Estado ligero para el panel lateral y simulador histórico
// ---------------------------------------------------------------------------
export async function getStatus(workspaceId: string) {
  await ensureUniverse();
  const [state, index, info, withData] = await Promise.all([
    accountState(workspaceId),
    prisma.market_instruments.findFirst({ where: { is_index: true, active: true } }),
    prisma.market_instruments.aggregate({ _max: { last_candle_at: true }, _count: { _all: true }, where: { active: true } }),
    prisma.market_instruments.count({ where: { active: true, last_candle_at: { not: null } } }),
  ]);
  let regime: Regime = "lateral";
  if (index) {
    const c = await loadRecent(index.id, 320);
    if (c.length) regime = regimeFrom(c, indicatorBundle(c));
  }
  const s = state.summary;
  return {
    regime,
    asOf: info._max.last_candle_at ? dayKey(info._max.last_candle_at) : null,
    instruments: info._count._all,
    instrumentsWithData: withData,
    equity: s.equity,
    cash: s.cash,
    returnPct: s.returnPct,
    openPositions: state.positions.filter((p) => p.status === "abierta").length,
    pendingOrders: state.positions.filter((p) => p.status === "pendiente").length,
    autoTrade: s.settings.autoTrade,
  };
}

export const SIM_MONTHS = [1, 3, 6, 12, 24, 36] as const;

export async function simulate(workspaceId: string, body: Record<string, unknown>) {
  const account = await ensureAccount(workspaceId);
  const n = (v: unknown, lo: number, hi: number, d: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
  };
  const months = Math.round(n(body.months, 1, 60, 12));
  const settings: SimSettings = {
    capital: Math.round(n(body.capital, 500, 10_000_000, 10_000)),
    riskPct: n(body.riskPct, 0.1, 5, account.risk_per_trade_pct),
    maxPositionPct: n(body.maxPositionPct, 1, 100, account.max_position_pct),
    maxOpen: Math.round(n(body.maxOpen, 1, 40, account.max_open_positions)),
    minScore: Math.round(n(body.minScore, 0, 100, account.min_score)),
    allowShort: typeof body.allowShort === "boolean" ? body.allowShort : account.allow_short,
    breakeven: typeof body.breakeven === "boolean" ? body.breakeven : account.breakeven,
    patterns: Array.isArray(body.patterns)
      ? (body.patterns.filter((p) => typeof p === "string" && PATTERN_LIBRARY.some((x) => x.key === p)) as PatternKey[])
      : (account.patterns as PatternKey[]),
    cost: costOf(account),
  };

  const instruments = await prisma.market_instruments.findMany({ where: { active: true } });
  const all = await loadSeries(instruments.map((i) => i.id));
  const index = instruments.find((i) => i.is_index);
  const lastT = Math.max(0, ...[...all.values()].map((c) => (c.length ? c[c.length - 1].t : 0)));
  if (!lastT) throw new Error("Todavía no hay cotizaciones: actualiza primero");
  const start = new Date(lastT);
  start.setUTCMonth(start.getUTCMonth() - months);

  const series: SimSeries[] = [];
  for (const inst of instruments) {
    if (inst.is_index) continue;
    const c = all.get(inst.id);
    if (!c || c.length < 250) continue;
    const analysis = analyze(c);
    series.push({ symbol: inst.symbol, name: inst.name, candles: c, analysis, trades: backtestSeries(c, DEFAULT_COSTS, analysis) });
  }
  const idx = index ? all.get(index.id) ?? [] : [];
  const result = simulatePortfolio({
    series,
    index: idx.length ? { candles: idx, ind: indicatorBundle(idx) } : null,
    startT: start.getTime(),
    settings,
  });
  return { months, settings: { ...settings, cost: undefined }, result };
}
