// lib/trading/agents/opportunities.ts
// Oportunidades para el usuario: lo que han comprado o vendido los agentes en su última reunión,
// agrupado por valor y con el tamaño calculado para la cartera del usuario.
import "server-only";
import { prisma } from "@/lib/prisma";
import { accountState, costOf, latestCloses, OPEN_STATUSES, type PositionView } from "../accounts";
import type { Evidence } from "../committee/service";
import { isCryptoMarket, lotStepOf } from "../market-data";
import { positionSize } from "../risk";
import { AGENTS, agentByKey } from "./roster";

/** Solo cuentan las reuniones recientes. */
const MAX_AGE_DAYS = 4;

export type AgentVote = {
  agent: string;
  name: string;
  color: string;
  conviction: number;
  rationale: string;
  risks: string | null;
  evidence: Evidence[];
  price: number;
  stop: number | null;
  target: number | null;
  horizonDays: number;
  at: string;
  status: string;
};

export type OpportunityBuy = {
  symbol: string;
  name: string;
  market: "bolsa" | "crypto";
  price: number;
  stop: number | null;
  target: number | null;
  horizonDays: number;
  quantity: number | null;
  status: "ok" | "tienes" | "stop_superado" | "objetivo_alcanzado";
  lead: string;
  agents: AgentVote[];
};
export type OpportunitySell = {
  symbol: string;
  name: string;
  market: "bolsa" | "crypto";
  price: number;
  positionId: string;
  positionStatus: string;
  agents: AgentVote[];
};

export async function getOpportunities(workspaceId: string) {
  const since = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000);
  const runs = await Promise.all(
    AGENTS.map((a) =>
      prisma.trading_committee_runs.findFirst({
        where: { workspace_id: workspaceId, agent: a.key, status: "ok", created_at: { gte: since } },
        orderBy: { created_at: "desc" },
        include: { proposals: true },
      }),
    ),
  );
  const state = await accountState(workspaceId);
  const held = new Map<string, PositionView>(
    state.positions.filter((p) => (OPEN_STATUSES as readonly string[]).includes(p.status)).map((p) => [p.symbol, p] as const),
  );

  const votes = new Map<string, { name: string; market: "bolsa" | "crypto"; buy: AgentVote[]; sell: AgentVote[] }>();
  for (const run of runs) {
    if (!run) continue;
    const def = agentByKey(run.agent);
    if (!def) continue;
    for (const p of run.proposals) {
      const isBuy = p.action === "comprar" && (p.status === "ejecutada" || p.status === "propuesta");
      const isSell = p.action === "vender" && p.status === "ejecutada";
      if (!isBuy && !isSell) continue;
      const entry = votes.get(p.symbol) ?? { name: p.name, market: p.market as "bolsa" | "crypto", buy: [], sell: [] };
      (isBuy ? entry.buy : entry.sell).push({
        agent: def.key,
        name: def.name,
        color: def.color,
        conviction: p.conviction,
        rationale: p.rationale,
        risks: p.risks,
        evidence: p.evidence as Evidence[],
        price: p.price,
        stop: p.stop,
        target: p.target,
        horizonDays: p.horizon_days,
        at: p.created_at.toISOString(),
        status: p.status,
      });
      votes.set(p.symbol, entry);
    }
  }

  const instruments = await prisma.market_instruments.findMany({ where: { symbol: { in: [...votes.keys()] } } });
  const closes = await latestCloses(instruments.map((i) => i.id));
  const a = state.account;
  const cost = costOf(a);

  const buys: OpportunityBuy[] = [];
  const sells: OpportunitySell[] = [];
  for (const [symbol, v] of votes) {
    const inst = instruments.find((i) => i.symbol === symbol);
    const price = inst ? closes.get(inst.id)?.close ?? null : null;
    if (!inst || price === null) continue;
    const position = held.get(symbol) ?? null;
    if (v.sell.length && position) {
      sells.push({ symbol, name: v.name, market: v.market, price, positionId: position.id, positionStatus: position.status, agents: v.sell });
    }
    if (!v.buy.length) continue;
    // Plan de referencia: el del agente más convencido (a igualdad, el más prudente: el primero de la lista).
    const order = AGENTS.map((x) => x.key);
    const lead = [...v.buy].sort((x, y) => y.conviction - x.conviction || order.indexOf(x.agent as never) - order.indexOf(y.agent as never))[0];
    let status: OpportunityBuy["status"] = "ok";
    if (position) status = "tienes";
    else if (lead.stop !== null && price <= lead.stop) status = "stop_superado";
    else if (lead.target !== null && price >= lead.target) status = "objetivo_alcanzado";
    const sizing =
      status === "ok" && lead.stop !== null
        ? positionSize({
            equity: state.summary.equity,
            cash: a.cash,
            riskPct: a.risk_per_trade_pct,
            maxPositionPct: a.max_position_pct,
            entry: price,
            stop: lead.stop,
            cost,
            step: lotStepOf(inst.market),
          })
        : null;
    buys.push({
      symbol,
      name: v.name,
      market: isCryptoMarket(inst.market) ? ("crypto" as const) : ("bolsa" as const),
      price,
      stop: lead.stop,
      target: lead.target,
      horizonDays: lead.horizonDays,
      quantity: sizing && sizing.quantity > 0 ? sizing.quantity : null,
      status,
      lead: lead.agent,
      agents: v.buy.sort((x, y) => y.conviction - x.conviction),
    });
  }
  buys.sort((x, y) => y.agents.length - x.agents.length || Math.max(...y.agents.map((g) => g.conviction)) - Math.max(...x.agents.map((g) => g.conviction)));
  return {
    buys,
    sells,
    account: { equity: state.summary.equity, cash: a.cash, riskPct: a.risk_per_trade_pct },
    lastRuns: runs.map((r, k) => ({ agent: AGENTS[k].key, name: AGENTS[k].name, at: r?.created_at.toISOString() ?? null })),
  };
}
