// lib/trading/committee/service.ts
// El coordinador en marcha: reúne los datos, consulta a la IA, aplica las reglas duras,
// guarda todo (para auditar y medir) y deja ejecutar las propuestas en la cartera virtual.
import "server-only";
import type { trading_proposals } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aiJson, aiModelInfo } from "../ai";
import { accountState, closePosition, costOf, ensureAccount, madridDay, OPEN_STATUSES, placeOrder } from "../accounts";
import { replicate } from "../agents/copy";
import { agentByKey, agentInstructions } from "../agents/roster";
import { atrAt, indicatorBundle } from "../indicators";
import { PATTERN_NAMES } from "../library";
import { CRYPTO_BENCHMARK, INDEX_SYMBOL, isCryptoMarket, lotStepOf, newsSymbolOf } from "../market-data";
import { computeRecommendations, getTrendPicks } from "../service";
import { dayDate, dayKey, loadSeries } from "../sync";
import {
  COMMITTEE_INSTRUCTIONS,
  COMMITTEE_SCHEMA,
  committeeInput,
  validateCommittee,
  type CommitteeAsset,
  type CommitteeContext,
  type CommitteeNews,
} from "./prompt";
import { evaluateProposal } from "./outcome";
import { brokerStatus, executeProtectedBuy } from "../broker/service";

/** Activos como máximo en el contexto (para que la llamada quepa y no sea cara). */
const MAX_ASSETS = 24;
const NEWS_HOURS = 72;

export type Evidence = {
  id: string;
  kind: "noticia" | "figura" | "tecnico" | "posicion";
  label: string;
  url?: string | null;
  sentiment?: number;
  impact?: number;
};

const when = (d: Date) =>
  new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(d);

async function buildContext(workspaceId: string, agent = "") {
  const [{ ranked, market, regime, cryptoRegime, state, view, instruments, series }, trend] = await Promise.all([
    computeRecommendations(workspaceId, agent),
    getTrendPicks(),
  ]);
  const strengthOf = (symbol: string) => {
    for (const m of [trend.bolsa, trend.crypto]) {
      const k = m.ranked.findIndex((r) => r.symbol === symbol);
      if (k >= 0) {
        const r = m.ranked[k];
        return { id: `F:${symbol}`, rank: k + 1, of: m.ranked.length, momPct: r.momPct, lookback: m.lookback, inTop: m.marketOk && m.picks.some((p) => p.symbol === symbol), aboveSma200: r.aboveSma200 };
      }
    }
    return null;
  };
  const since = new Date(Date.now() - NEWS_HOURS * 3_600_000);
  const news = await prisma.news_items.findMany({
    where: { status: "clasificada", relevant: true, published_at: { gte: since }, impact: { gte: 1 } },
    orderBy: [{ impact: "desc" }, { published_at: "desc" }],
    take: 400,
  });

  // Instrumento de cada etiqueta de noticia (BTC → BTC-EUR).
  const bySymbolTag = new Map<string, (typeof instruments)[number]>();
  for (const i of instruments) bySymbolTag.set(newsSymbolOf(i.symbol, i.market), i);

  const evidence = new Map<string, Evidence>();
  const newsFor = new Map<string, CommitteeNews[]>();
  const marketNews: CommitteeNews[] = [];
  for (const n of news) {
    const id = `N:${n.id.slice(0, 8)}`;
    const item: CommitteeNews = { id, when: when(n.published_at), summary: n.summary || n.title, sentiment: n.sentiment ?? 0, impact: n.impact ?? 0, category: n.category };
    evidence.set(id, { id, kind: "noticia", label: item.summary, url: n.url, sentiment: item.sentiment, impact: item.impact });
    for (const tag of n.symbols) {
      if (tag === "MERCADO_ES" || tag === "CRYPTO") {
        if (marketNews.length < 8 && !marketNews.some((m) => m.id === id)) marketNews.push(item);
        continue;
      }
      const inst = bySymbolTag.get(tag);
      if (!inst) continue;
      const list = newsFor.get(inst.symbol) ?? [];
      if (list.length < 4) list.push(item);
      newsFor.set(inst.symbol, list);
    }
  }

  // Candidatos: lo que tienes, lo que tiene señal, lo que sale en noticias importantes y las crypto principales.
  const held = new Set(state.positions.filter((p) => (OPEN_STATUSES as readonly string[]).includes(p.status)).map((p) => p.symbol));
  const score = new Map<string, number>();
  const bump = (s: string, v: number) => score.set(s, (score.get(s) ?? 0) + v);
  for (const s of held) bump(s, 1000);
  for (const r of ranked) if (r.action !== "vigilar" || r.score >= 50) bump(r.symbol, r.score + (r.strong ? 50 : 0));
  for (const [s, list] of newsFor) bump(s, list.reduce((acc, n) => acc + n.impact * 25, 0));
  for (const s of [CRYPTO_BENCHMARK, "ETH-EUR"]) bump(s, 30);
  // Los que la estrategia de tendencia tendría hoy en cartera.
  for (const m of [trend.bolsa, trend.crypto]) if (m.marketOk) m.picks.forEach((p, k) => bump(p.symbol, 120 - k * 10));
  const candidates = [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
    .filter((s) => s !== INDEX_SYMBOL)
    .slice(0, MAX_ASSETS);

  const assets: CommitteeAsset[] = [];
  for (const symbol of candidates) {
    const inst = instruments.find((i) => i.symbol === symbol);
    const row = market.find((m) => m.symbol === symbol);
    const c = inst ? series.get(inst.id) ?? [] : [];
    if (!inst || !row || row.close === null || c.length < 30) continue;
    const ind = indicatorBundle(c);
    const atr = atrAt(ind.atr14, c, c.length - 1);
    evidence.set(`T:${symbol}`, {
      id: `T:${symbol}`,
      kind: "tecnico",
      label: `${inst.name}: tendencia ${row.trend === "up" ? "alcista" : row.trend === "down" ? "bajista" : "lateral"}${row.rsi !== null ? `, RSI ${row.rsi.toFixed(0)}` : ""}${row.change20d !== null ? `, ${row.change20d > 0 ? "+" : ""}${row.change20d.toFixed(1)} % en 20 sesiones` : ""}`,
    });
    const signals = ranked
      .filter((r) => r.symbol === symbol)
      .slice(0, 3)
      .map((r) => {
        const id = `S:${symbol}:${r.pattern}`;
        evidence.set(id, {
          id,
          kind: "figura",
          label: `${PATTERN_NAMES[r.pattern]} en ${inst.name} (${r.status === "confirmed" ? "confirmada" : "pendiente de ruptura"}${r.vetoed ? ", vetada por historial" : ""}${r.history ? `; historial ${r.history.trades} op., ${(r.history.winRate * 100).toFixed(0)} % acierto, ${r.history.avgR.toFixed(2)} R` : ""})`,
        });
        return {
          id,
          pattern: PATTERN_NAMES[r.pattern],
          status: r.status === "confirmed" ? "confirmada" : "pendiente de ruptura",
          direction: r.direction,
          entry: r.entry,
          stop: r.stop,
          target: r.target,
          score: r.score,
          vetoed: r.vetoed,
          history: r.history ? `${r.history.trades} op., ${(r.history.winRate * 100).toFixed(0)} % acierto, ${r.history.avgR.toFixed(2)} R medio` : null,
        };
      });
    const strength = strengthOf(symbol);
    if (strength)
      evidence.set(strength.id, {
        id: strength.id,
        kind: "figura",
        label: `Fuerza: puesto ${strength.rank} de ${strength.of} (${strength.momPct >= 0 ? "+" : ""}${strength.momPct.toFixed(0)} % en ${strength.lookback} sesiones)${strength.inTop ? ", entre los que compraría la estrategia de tendencia" : ""}`,
      });
    // Las órdenes pendientes cuentan como posición: no se vuelve a proponer comprarlas.
    const pos = state.positions.find((p) => p.symbol === symbol && (p.status === "abierta" || p.status === "pendiente"));
    if (pos)
      evidence.set(`P:${symbol}`, {
        id: `P:${symbol}`,
        kind: "posicion",
        label: `Tu posición en ${inst.name}: ${pos.quantity} a ${pos.entryPrice?.toFixed(3)} € (${pos.unrealized !== null && pos.unrealized >= 0 ? "+" : ""}${pos.unrealized?.toFixed(0) ?? "—"} €)`,
      });
    assets.push({
      symbol,
      name: inst.name,
      market: isCryptoMarket(inst.market) ? "crypto" : "bolsa",
      price: row.close,
      change1d: row.change1d,
      change20d: row.change20d,
      trend: row.trend,
      rsi: row.rsi,
      distSma200: row.distSma200,
      atrPct: (atr / row.close) * 100,
      lotStep: lotStepOf(inst.market),
      signals,
      strength,
      news: newsFor.get(symbol) ?? [],
      position: pos
        ? {
            direction: pos.direction,
            quantity: pos.quantity,
            entry: pos.entryPrice ?? pos.plannedEntry,
            stop: pos.stop,
            target: pos.target,
            unrealizedPct: pos.entryPrice && pos.lastPrice ? ((pos.lastPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.direction === "long" ? 1 : -1) : 0,
            pending: pos.status === "pendiente",
          }
        : null,
    });
  }

  const ctx: CommitteeContext = {
    date: madridDay(),
    regimes: { bolsa: regime, crypto: cryptoRegime },
    account: {
      equity: view.equity,
      cash: view.cash,
      riskPct: view.riskPct,
      maxPositionPct: view.maxPositionPct,
      maxOpen: state.account.max_open_positions,
      openCount: state.positions.filter((p) => (OPEN_STATUSES as readonly string[]).includes(p.status)).length,
      allowShort: state.account.allow_short,
      cost: costOf(state.account),
    },
    marketNews,
    assets,
  };
  return { ctx, evidence };
}

/** Reunión del comité. Con `agentKey`, es la reunión de ese agente: su carácter, sus límites y su cartera. */
export async function runCommittee(workspaceId: string, userId: string | null, agentKey = "") {
  const agentDef = agentKey ? agentByKey(agentKey) : null;
  if (agentKey && !agentDef) throw new Error("Agente desconocido");
  const agent = agentDef?.key ?? "";
  if (agentDef) await ensureAccount(workspaceId, agent, { name: agentDef.name, capital: agentDef.capital, settings: agentDef.settings });
  const { ctx, evidence } = await buildContext(workspaceId, agent);
  if (agentDef) ctx.rules = agentDef.rules;
  const model = aiModelInfo().smart;
  if (!ctx.assets.length) throw new Error("No hay datos suficientes: actualiza primero cotizaciones y noticias");
  let raw: unknown;
  try {
    raw = await aiJson<unknown>({
      tier: "smart",
      purpose: agentDef ? `agente:${agent}` : "comite",
      instructions: agentDef ? COMMITTEE_INSTRUCTIONS + "\n" + agentInstructions(agentDef) : COMMITTEE_INSTRUCTIONS,
      input: `Datos del día. Devuelve solo JSON según el contrato.\n${committeeInput(ctx)}`,
      schemaName: "investment_committee",
      schema: COMMITTEE_SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: 7000,
      timeoutMs: 52_000,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 500) : "La IA no respondió";
    await prisma.trading_committee_runs.create({
      data: { workspace_id: workspaceId, agent, as_of: dayDate(ctx.date), status: "error", error, model, created_by: userId, context: JSON.parse(JSON.stringify(ctx)) },
    });
    throw new Error(error);
  }
  const v = validateCommittee(raw, ctx);
  const run = await prisma.trading_committee_runs.create({
    data: {
      workspace_id: workspaceId,
      agent,
      as_of: dayDate(ctx.date),
      market_view: v.marketView || null,
      watchlist: JSON.parse(JSON.stringify(v.watchlist)),
      context: JSON.parse(JSON.stringify(ctx)),
      raw: JSON.parse(JSON.stringify(raw)),
      model,
      created_by: userId,
      proposals: {
        create: v.proposals.map((p) => ({
          workspace_id: workspaceId,
          agent,
          symbol: p.symbol,
          name: p.name,
          market: p.market,
          action: p.action,
          conviction: p.conviction,
          horizon_days: p.horizonDays,
          price: p.price,
          stop: p.stop,
          target: p.target,
          quantity: p.sizing?.quantity ?? null,
          rationale: p.rationale,
          evidence: JSON.parse(JSON.stringify(p.evidence.map((id) => evidence.get(id)).filter(Boolean))),
          risks: p.risks || null,
          status: p.status,
          rejection: p.rejection,
        })),
      },
    },
  });
  if (agentDef) return { id: run.id, auto: await executeAgentRun(workspaceId, run.id, agent) };
  // Autonomía «automático»: las compras de bolsa aprobadas por las reglas se ejecutan solas en Trading 212 Demo.
  const auto: { symbol: string; ok: boolean; detail: string }[] = [];
  const broker = await brokerStatus(workspaceId);
  if (broker.available && broker.autonomy === "automatico") {
    const created = await prisma.trading_proposals.findMany({ where: { run_id: run.id, status: "propuesta", action: "comprar", market: "bolsa" } });
    for (const p of created) {
      try {
        const r = await executeProposalOnBroker(workspaceId, p.id, "auto");
        auto.push({ symbol: p.symbol, ok: true, detail: `${r.quantity} acciones (orden ${r.orderId})` });
      } catch (e) {
        auto.push({ symbol: p.symbol, ok: false, detail: e instanceof Error ? e.message : "error" });
      }
    }
  }
  return { id: run.id, auto };
}

/** Un agente tiene autonomía total: ejecuta en su cartera todo lo que su reunión aprobó. */
async function executeAgentRun(workspaceId: string, runId: string, agent: string) {
  const out: { symbol: string; ok: boolean; detail: string }[] = [];
  // Patrimonio del agente antes de operar: las copias replican en la misma proporción.
  const equity = (await accountState(workspaceId, agent)).summary.equity;
  const list = await prisma.trading_proposals.findMany({ where: { run_id: runId, status: "propuesta" }, orderBy: { conviction: "desc" } });
  // Primero ventas (liberan efectivo), luego protecciones y por último compras.
  const order = { vender: 0, mantener: 1, comprar: 2, vigilar: 3 } as Record<string, number>;
  list.sort((a, b) => (order[a.action] ?? 9) - (order[b.action] ?? 9));
  for (const p of list) {
    if (p.action === "vigilar" || (p.action === "mantener" && !p.stop)) continue;
    try {
      await decideProposal(workspaceId, null, p.id, "ejecutar");
      const c = await replicate(agent, p, equity);
      out.push({ symbol: p.symbol, ok: true, detail: c.copies ? `${p.action} (copiado en ${c.copies} ${c.copies === 1 ? "cartera" : "carteras"})` : p.action });
    } catch (e) {
      const why = e instanceof Error ? e.message.slice(0, 300) : "error";
      await prisma.trading_proposals.update({ where: { id: p.id }, data: { status: "descartada", rejection: `No se pudo ejecutar: ${why}`, decided_at: new Date() } });
      out.push({ symbol: p.symbol, ok: false, detail: why });
    }
  }
  return out;
}

/** Ejecuta una propuesta de compra del comité en Trading 212 Demo, con stop y objetivo protegidos. */
export async function executeProposalOnBroker(workspaceId: string, proposalId: string, source: "comite" | "auto" = "comite") {
  if (!/^[0-9a-f-]{36}$/i.test(proposalId)) throw new Error("Propuesta no válida");
  const p = await prisma.trading_proposals.findFirst({ where: { id: proposalId, workspace_id: workspaceId, agent: "" } });
  if (!p) throw new Error("La propuesta no existe");
  if (p.status !== "propuesta") throw new Error("Esta propuesta ya se decidió");
  if (p.action !== "comprar" || p.market !== "bolsa" || !p.stop || !p.target) throw new Error("Solo se pueden enviar al bróker compras de bolsa con stop y objetivo");
  const r = await executeProtectedBuy(workspaceId, { symbol: p.symbol, stop: p.stop, target: p.target, source, proposalId: p.id });
  await prisma.trading_proposals.update({ where: { id: p.id }, data: { status: "ejecutada", decided_at: new Date() } });
  return r;
}

// ---------------------------------------------------------------------------
// Consulta, resultados y marcador
// ---------------------------------------------------------------------------
export async function getCommittee(workspaceId: string) {
  const [latest, proposals] = await Promise.all([
    prisma.trading_committee_runs.findFirst({
      where: { workspace_id: workspaceId, agent: "" },
      orderBy: { created_at: "desc" },
      include: { proposals: { orderBy: [{ status: "asc" }, { conviction: "desc" }] } },
    }),
    prisma.trading_proposals.findMany({ where: { workspace_id: workspaceId, agent: "" }, orderBy: { created_at: "desc" }, take: 200 }),
  ]);
  const symbols = [...new Set([...proposals.map((p) => p.symbol), INDEX_SYMBOL, CRYPTO_BENCHMARK])];
  const instruments = await prisma.market_instruments.findMany({ where: { symbol: { in: symbols } } });
  const oldest = proposals.length ? proposals[proposals.length - 1].created_at : new Date();
  const series = await loadSeries(instruments.map((i) => i.id), new Date(oldest.getTime() - 3 * 86_400_000));
  const candlesOf = (s: string) => {
    const i = instruments.find((x) => x.symbol === s);
    return i ? series.get(i.id) ?? [] : [];
  };

  const history = proposals.map((p) => {
    const bench = candlesOf(p.market === "crypto" ? CRYPTO_BENCHMARK : INDEX_SYMBOL);
    return { ...view(p), outcome: p.status === "rechazada" ? null : evaluateProposal(p, candlesOf(p.symbol), bench) };
  });
  const buys = history.filter((h) => h.action === "comprar" && h.status !== "rechazada" && h.outcome && h.outcome.r !== null);
  const closed = buys.filter((h) => h.outcome!.state === "objetivo" || h.outcome!.state === "stop" || h.outcome!.state === "tiempo");
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const scoreboard = {
    proposals: buys.length,
    closed: closed.length,
    wins: closed.filter((h) => (h.outcome!.r ?? 0) > 0).length,
    avgR: avg(closed.map((h) => h.outcome!.r ?? 0)),
    avgReturnPct: avg(buys.map((h) => h.outcome!.returnPct ?? 0)),
    avgBenchmarkPct: avg(buys.map((h) => h.outcome!.benchmarkPct ?? 0)),
    executed: history.filter((h) => h.status === "ejecutada").length,
  };

  const today = madridDay();
  return {
    latest: latest
      ? {
          id: latest.id,
          createdAt: latest.created_at.toISOString(),
          asOf: dayKey(latest.as_of),
          status: latest.status,
          error: latest.error,
          marketView: latest.market_view,
          watchlist: latest.watchlist as { symbol: string; name: string; reason: string }[],
          model: latest.model,
          proposals: latest.proposals.map((p) => ({ ...view(p), outcome: history.find((h) => h.id === p.id)?.outcome ?? null })),
        }
      : null,
    stale: !latest || madridDay(latest.created_at) !== today,
    broker: await brokerStatus(workspaceId),
    history,
    scoreboard,
  };
}

export function view(p: trading_proposals) {
  return {
    id: p.id,
    runId: p.run_id,
    createdAt: p.created_at.toISOString(),
    symbol: p.symbol,
    name: p.name,
    market: p.market as "bolsa" | "crypto",
    action: p.action as "comprar" | "vender" | "mantener" | "vigilar",
    conviction: p.conviction,
    horizonDays: p.horizon_days,
    price: p.price,
    stop: p.stop,
    target: p.target,
    quantity: p.quantity,
    rationale: p.rationale,
    evidence: p.evidence as Evidence[],
    risks: p.risks,
    status: p.status as "propuesta" | "ejecutada" | "descartada" | "rechazada",
    rejection: p.rejection,
    positionId: p.position_id,
  };
}

export type DecisionOverrides = { quantity?: number; stop?: number; target?: number; execution?: "next_open" | "now" };

export async function decideProposal(
  workspaceId: string,
  userId: string | null,
  proposalId: string,
  decision: "ejecutar" | "descartar",
  overrides: DecisionOverrides = {},
) {
  if (!/^[0-9a-f-]{36}$/i.test(proposalId)) throw new Error("Propuesta no válida");
  const p = await prisma.trading_proposals.findFirst({ where: { id: proposalId, workspace_id: workspaceId } });
  if (!p) throw new Error("La propuesta no existe");
  if (p.status !== "propuesta") throw new Error("Esta propuesta ya se decidió");
  const agent = p.agent;
  if (agent && userId !== null) throw new Error("Las propuestas de los agentes las ejecuta el propio agente");
  const account = await ensureAccount(workspaceId, agent);
  if (decision === "descartar") {
    await prisma.trading_proposals.update({ where: { id: p.id }, data: { status: "descartada", decided_at: new Date() } });
    return { status: "descartada" };
  }
  let positionId: string | null = null;
  if (p.action === "comprar") {
    const quantity = overrides.quantity && overrides.quantity > 0 ? overrides.quantity : p.quantity;
    const stop = overrides.stop && overrides.stop > 0 ? overrides.stop : p.stop;
    const target = overrides.target && overrides.target > 0 ? overrides.target : p.target;
    if (!stop || !target || !quantity) throw new Error("A la propuesta le faltan stop, objetivo o tamaño");
    const r = await placeOrder(workspaceId, userId, {
      symbol: p.symbol,
      direction: "long",
      quantity,
      stop,
      target,
      execution: overrides.execution === "now" ? "now" : "next_open",
      signalKey: `comite:${p.id}`,
      maxHoldDays: Math.round(p.horizon_days * 1.5),
      notes: `${agent ? agentByKey(agent)?.name ?? agent : "Comité de inversión"}: ${p.rationale}`,
      source: agent ? "agente" : "comite",
    }, agent);
    positionId = r.id;
  } else if (p.action === "vender") {
    const pos = await prisma.trading_positions.findFirst({
      where: { account_id: account.id, symbol: p.symbol, status: { in: [...OPEN_STATUSES] } },
      orderBy: { created_at: "desc" },
    });
    if (!pos) throw new Error("Ya no hay posición abierta en este valor");
    await closePosition(workspaceId, pos.id, agent, agent ? "decisión del agente" : "manual");
    positionId = pos.id;
  } else if (p.action === "mantener" && p.stop) {
    const pos = await prisma.trading_positions.findFirst({ where: { account_id: account.id, symbol: p.symbol, status: "abierta" } });
    if (pos && (pos.direction === "long" ? p.stop > pos.stop : p.stop < pos.stop))
      await prisma.trading_positions.update({ where: { id: pos.id }, data: { stop: p.stop, updated_at: new Date() } });
    positionId = pos?.id ?? null;
  } else throw new Error("Esta propuesta no tiene nada que ejecutar");
  await prisma.trading_proposals.update({ where: { id: p.id }, data: { status: "ejecutada", decided_at: new Date(), position_id: positionId } });
  return { status: "ejecutada", order: p.action === "comprar" ? (overrides.execution === "now" ? "abierta" : "pendiente") : null };
}
