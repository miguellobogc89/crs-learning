// lib/trading/service.ts
// Lo que consume la pantalla: panorama del mercado, recomendaciones, ficha de un valor
// y el proceso diario completo (datos → backtest → carteras → modo automático).
import "server-only";
import { KAMIKAZES } from "./kamikaze/roster";
import { prisma } from "@/lib/prisma";
import { accountState, costOf, ensureAccount, OPEN_STATUSES, placeOrder, processAccount } from "./accounts";
import { getPortfolio } from "./agents/copy";
import { analyze, backtestSeries } from "./backtest";
import { DEFAULT_COSTS } from "./risk";
import { newsForSymbol, syncNews, type NewsSyncSummary } from "./news/service";
import { simulatePortfolio, type SimSeries, type SimSettings } from "./simulate";
import { chooseTrendParams, prepareTrend, PROFILES, simulateTrend, trendGrid, trendPicks, type RiskProfile } from "./strategy";
import { indicatorBundle, trendAt } from "./indicators";
import { PATTERN_LIBRARY } from "./library";
import { CRYPTO_BENCHMARK, fetchDailyCandles, INDEX_SYMBOL, isCryptoMarket, lotStepOf, newsSymbolOf } from "./market-data";
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
  market: "bolsa" | "crypto";
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
    // Para calcular tamaños cuenta el efectivo libre (sin lo reservado por órdenes pendientes).
    cash: state.summary.available,
    riskPct: state.account.risk_per_trade_pct,
    maxPositionPct: state.account.max_position_pct,
    allowShort: state.account.allow_short,
    minScore: state.account.min_score,
    cost: costOf(state.account),
    holdings,
  };
}

/** Analiza todo el universo y genera las recomendaciones para la cartera de un espacio. */
export async function computeRecommendations(workspaceId: string, agent = "") {
  const [{ instruments, series }, backtest, state] = await Promise.all([universe(), latestBacktest(), accountState(workspaceId, agent)]);
  const view = accountView(state);
  const index = instruments.find((i) => i.is_index);
  const idxCandles = index ? series.get(index.id) ?? [] : [];
  const regime: Regime = idxCandles.length ? regimeFrom(idxCandles, indicatorBundle(idxCandles)) : "lateral";
  const btc = instruments.find((i) => i.symbol === CRYPTO_BENCHMARK);
  const btcCandles = btc ? series.get(btc.id) ?? [] : [];
  const cryptoRegime: Regime = btcCandles.length ? regimeFrom(btcCandles, indicatorBundle(btcCandles)) : "lateral";
  const stats = backtest?.byPattern ?? {};
  const cryptoStats = backtest?.crypto?.byPattern ?? {};
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
      if (!inst.is_index) {
        const crypto = isCryptoMarket(inst.market);
        recs.push(
          ...recommendForInstrument(
            {
              symbol: inst.symbol,
              name: inst.name,
              candles: c,
              ind: a.ind,
              detections,
              lotStep: lotStepOf(inst.market),
              unit: crypto ? newsSymbolOf(inst.symbol, inst.market) : "acciones",
              where: crypto ? "las crypto" : "el IBEX",
              benchmark: crypto ? "Bitcoin" : "IBEX 35",
            },
            crypto ? cryptoStats : stats,
            crypto ? cryptoRegime : regime,
            view,
          ),
        );
      }
    }
    const s200 = ind?.sma200[last] ?? null;
    market.push({
      symbol: inst.symbol,
      name: inst.name,
      sector: inst.sector,
      market: isCryptoMarket(inst.market) ? "crypto" : "bolsa",
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
  return { ranked, market, regime, cryptoRegime, backtest, state, view, instruments, series };
}

export async function getOverview(workspaceId: string) {
  const [{ ranked, market, regime, cryptoRegime, backtest, state }, trend] = await Promise.all([
    computeRecommendations(workspaceId),
    getTrendPicks().catch(() => null),
  ]);
  const syncInfo = await prisma.market_instruments.aggregate({
    _max: { last_candle_at: true, last_sync_at: true },
    _count: { _all: true },
    where: { active: true },
  });
  const withData = await prisma.market_instruments.count({ where: { active: true, last_candle_at: { not: null } } });
  return {
    regime,
    cryptoRegime,
    trend: trend
      ? {
          bolsa: { marketOk: trend.bolsa.marketOk, lookback: trend.bolsa.lookback, top: trend.bolsa.ranked.slice(0, 6), picks: trend.bolsa.picks.map((p) => p.symbol) },
          crypto: { marketOk: trend.crypto.marketOk, lookback: trend.crypto.lookback, top: trend.crypto.ranked.slice(0, 6), picks: trend.crypto.picks.map((p) => p.symbol) },
        }
      : null,
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

export async function getLibrary(market: "bolsa" | "crypto" = "bolsa") {
  const bt = await latestBacktest();
  const m = market === "crypto" ? bt?.crypto ?? null : bt;
  return {
    market,
    patterns: PATTERN_LIBRARY.map((p) => ({ ...p, stats: m?.byPattern?.[p.key] ?? null })),
    backtest:
      bt && m
        ? {
            asOf: bt.asOf,
            trades: m.trades,
            instruments: m.instruments,
            overall: m.overall,
            recent: bt.recent.filter((t) => (market === "crypto") === isCryptoMarket(t.market)).slice(0, 30),
            createdAt: bt.createdAt,
          }
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
    market: isCryptoMarket(inst.market) ? ("crypto" as const) : ("bolsa" as const),
    lotStep: lotStepOf(inst.market),
    news: await newsForSymbol(newsSymbolOf(inst.symbol, inst.market)).catch(() => []),
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
    // Los kamikazes llevan su propia vigilancia intradía (lib/trading/kamikaze): el cierre diario no los toca.
    const list = await prisma.trading_accounts.findMany({
      where: { ...(workspaceId ? { workspace_id: workspaceId } : {}), agent: { notIn: KAMIKAZES.map((k) => k.key) } },
      select: { id: true, workspace_id: true, agent: true },
    });
    for (const a of list) {
      if (Date.now() - started > budgetMs) break;
      const r = await processAccount(a.id);
      accounts.processed++;
      accounts.filled += r.filled;
      accounts.closed += r.closed;
      accounts.cancelled += r.cancelled;
      // El modo automático de señales es solo de la cartera del usuario; los agentes deciden en su reunión.
      if (!a.agent) accounts.autoOpened += (await autoTrade(a.workspace_id)).opened;
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
  const [portfolio, index, info, withData] = await Promise.all([
    getPortfolio(workspaceId),
    prisma.market_instruments.findFirst({ where: { is_index: true, active: true } }),
    prisma.market_instruments.aggregate({ _max: { last_candle_at: true }, _count: { _all: true }, where: { active: true } }),
    prisma.market_instruments.count({ where: { active: true, last_candle_at: { not: null } } }),
  ]);
  let regime: Regime = "lateral";
  if (index) {
    const c = await loadRecent(index.id, 320);
    if (c.length) regime = regimeFrom(c, indicatorBundle(c));
  }
  let cryptoRegime: Regime | null = null;
  const btc = await prisma.market_instruments.findFirst({ where: { symbol: CRYPTO_BENCHMARK, active: true } });
  if (btc) {
    const c = await loadRecent(btc.id, 320);
    if (c.length) cryptoRegime = regimeFrom(c, indicatorBundle(c));
  }
  const s = portfolio.main.summary;
  const all = [...portfolio.main.positions, ...portfolio.copies.flatMap((c) => c.positions)];
  return {
    regime,
    cryptoRegime,
    asOf: info._max.last_candle_at ? dayKey(info._max.last_candle_at) : null,
    instruments: info._count._all,
    instrumentsWithData: withData,
    equity: portfolio.total.equity,
    cash: portfolio.total.available,
    returnPct: portfolio.total.returnPct,
    openPositions: all.filter((p) => p.status === "abierta").length,
    pendingOrders: all.filter((p) => p.status === "pendiente").length,
    autoTrade: s.settings.autoTrade,
    opened: s.opened,
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
  const market: "bolsa" | "crypto" = body.market === "crypto" ? "crypto" : "bolsa";
  const strategy: "tendencia" | "figuras" = body.strategy === "figuras" ? "figuras" : "tendencia";
  const profile: RiskProfile = body.profile === "prudente" || body.profile === "agresivo" ? body.profile : "equilibrado";
  const prof = PROFILES[profile];
  const capital = Math.round(n(body.capital, 500, 10_000_000, 10_000));
  const cost = costOf(account);
  // El perfil marca el riesgo; en «Más opciones» se puede afinar a mano.
  const settings: SimSettings = {
    capital,
    riskPct: n(body.riskPct, 0.1, 5, prof.patternRiskPct),
    maxPositionPct: n(body.maxPositionPct, 1, 100, prof.patternMaxPositionPct),
    maxOpen: Math.round(n(body.maxOpen, 1, 40, prof.patternMaxOpen)),
    minScore: Math.round(n(body.minScore, 0, 100, account.min_score)),
    allowShort: typeof body.allowShort === "boolean" ? body.allowShort : account.allow_short,
    breakeven: typeof body.breakeven === "boolean" ? body.breakeven : account.breakeven,
    patterns: Array.isArray(body.patterns)
      ? (body.patterns.filter((p) => typeof p === "string" && PATTERN_LIBRARY.some((x) => x.key === p)) as PatternKey[])
      : (account.patterns as PatternKey[]),
    cost,
  };

  const instruments = (await prisma.market_instruments.findMany({ where: { active: true } })).filter((i) =>
    market === "crypto" ? isCryptoMarket(i.market) : !isCryptoMarket(i.market),
  );
  const all = await loadSeries(instruments.map((i) => i.id));
  // Referencia: el IBEX en bolsa; Bitcoin en crypto.
  const index = market === "crypto" ? instruments.find((i) => i.symbol === CRYPTO_BENCHMARK) : instruments.find((i) => i.is_index);
  const lastT = Math.max(0, ...[...all.values()].map((c) => (c.length ? c[c.length - 1].t : 0)));
  if (!lastT) throw new Error("Todavía no hay cotizaciones: actualiza primero");
  const start = new Date(lastT);
  start.setUTCMonth(start.getUTCMonth() - months);
  const idx = index ? all.get(index.id) ?? [] : [];
  const tradable = instruments.filter((i) => !i.is_index && (all.get(i.id)?.length ?? 0) >= 250);

  if (strategy === "tendencia") {
    const prepared = prepareTrend(
      tradable.map((inst) => ({ symbol: inst.symbol, name: inst.name, candles: all.get(inst.id)!, lotStep: lotStepOf(inst.market) })),
    );
    const bench = idx.length ? { candles: idx } : null;
    const chosen = chooseTrendParams({ series: prepared, bench, market, exposure: prof.exposure, startT: start.getTime(), cost });
    const result = simulateTrend({ series: prepared, bench, startT: start.getTime(), capital, params: chosen.params, cost });
    return {
      months,
      market,
      strategy,
      profile,
      method: { params: chosen.params, trained: chosen.trained, trainFrom: chosen.trainFrom, trainTo: dayKey(start) },
      settings: { ...settings, cost: undefined },
      result,
    };
  }

  const series: SimSeries[] = [];
  for (const inst of tradable) {
    const c = all.get(inst.id)!;
    const analysis = analyze(c);
    series.push({
      symbol: inst.symbol,
      name: inst.name,
      candles: c,
      analysis,
      trades: backtestSeries(c, DEFAULT_COSTS, analysis),
      lotStep: lotStepOf(inst.market),
      unit: market === "crypto" ? newsSymbolOf(inst.symbol, inst.market) : "acciones",
    });
  }
  const result = simulatePortfolio({
    series,
    index: idx.length ? { candles: idx, ind: indicatorBundle(idx) } : null,
    startT: start.getTime(),
    settings,
  });
  return { months, market, strategy, profile, method: null, settings: { ...settings, cost: undefined }, result };
}

/** Lo que la estrategia de tendencia tendría hoy en cartera, en bolsa y en crypto. */
export async function getTrendPicks() {
  const instruments = await prisma.market_instruments.findMany({ where: { active: true } });
  const since = new Date(Date.now() - 520 * 86_400_000);
  const all = await loadSeries(instruments.map((i) => i.id), since);
  const pick = (market: "bolsa" | "crypto") => {
    const list = instruments.filter((i) => !i.is_index && (market === "crypto" ? isCryptoMarket(i.market) : !isCryptoMarket(i.market)));
    const prepared = prepareTrend(
      list.filter((i) => (all.get(i.id)?.length ?? 0) > 0).map((i) => ({ symbol: i.symbol, name: i.name, candles: all.get(i.id)!, lotStep: lotStepOf(i.market) })),
    );
    const benchInst = market === "crypto" ? instruments.find((i) => i.symbol === CRYPTO_BENCHMARK) : instruments.find((i) => i.is_index);
    const bench = benchInst ? { candles: all.get(benchInst.id) ?? [] } : null;
    const grid = trendGrid(market, 1);
    const p = grid[Math.floor(grid.length / 2)];
    return { ...trendPicks(prepared, bench, p), lookback: p.lookback, topN: p.topN };
  };
  return { bolsa: pick("bolsa"), crypto: pick("crypto") };
}
