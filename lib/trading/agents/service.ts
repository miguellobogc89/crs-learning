// lib/trading/agents/service.ts
// Los agentes en marcha: cada uno con su cartera virtual, sus reuniones y su marcador.
import "server-only";
import { prisma } from "@/lib/prisma";
import { accountState, ensureAccount, processAccount, resetAccount } from "../accounts";
import { runCommittee, view as proposalView } from "../committee/service";
import { CRYPTO_BENCHMARK, INDEX_SYMBOL } from "../market-data";
import { dayKey, loadSeries } from "../sync";
import { AGENTS, agentByKey, type AgentDef } from "./roster";

async function ensureAgent(workspaceId: string, a: AgentDef) {
  return ensureAccount(workspaceId, a.key, { name: a.name, capital: a.capital, settings: a.settings });
}

/** Rentabilidad de un índice desde un día (para comparar). */
function changeSince(candles: { t: number; c: number }[], since: number) {
  if (!candles.length) return null;
  const start = candles.find((c) => c.t >= since) ?? null;
  const last = candles[candles.length - 1];
  if (!start || start === last) return 0;
  return ((last.c - start.c) / start.c) * 100;
}

export async function getAgents(workspaceId: string) {
  const accounts = await Promise.all(AGENTS.map((a) => ensureAgent(workspaceId, a)));
  const started = Math.min(...accounts.map((a) => a.created_at.getTime()));
  const benchInst = await prisma.market_instruments.findMany({ where: { symbol: { in: [INDEX_SYMBOL, CRYPTO_BENCHMARK] } } });
  const benchSeries = await loadSeries(benchInst.map((i) => i.id), new Date(started - 5 * 86_400_000));
  const bench = (s: string) => {
    const i = benchInst.find((x) => x.symbol === s);
    return i ? benchSeries.get(i.id) ?? [] : [];
  };

  const agents = await Promise.all(
    AGENTS.map(async (def, k) => {
      const account = accounts[k];
      const [state, equity, runs, proposals] = await Promise.all([
        accountState(workspaceId, def.key),
        prisma.trading_equity.findMany({ where: { account_id: account.id }, orderBy: { day: "asc" }, take: 1000 }),
        prisma.trading_committee_runs.findMany({ where: { workspace_id: workspaceId, agent: def.key }, orderBy: { created_at: "desc" }, take: 1 }),
        prisma.trading_proposals.findMany({ where: { workspace_id: workspaceId, agent: def.key }, orderBy: { created_at: "desc" }, take: 40 }),
      ]);
      const last = runs[0] ?? null;
      const since = account.created_at.getTime();
      return {
        key: def.key,
        name: def.name,
        profile: def.profile,
        tagline: def.tagline,
        color: def.color,
        rules: def.rules,
        settings: {
          riskPerTradePct: def.settings.risk_per_trade_pct,
          maxPositionPct: def.settings.max_position_pct,
          maxOpenPositions: def.settings.max_open_positions,
        },
        startedAt: account.created_at.toISOString(),
        summary: state.summary,
        positions: state.positions.filter((p) => p.status === "abierta" || p.status === "pendiente"),
        closed: state.positions.filter((p) => p.status === "cerrada").slice(0, 20),
        equity: equity.map((e) => ({ day: dayKey(e.day), equity: e.equity })),
        lastRun: last
          ? { id: last.id, at: last.created_at.toISOString(), status: last.status, error: last.error, marketView: last.market_view }
          : null,
        proposals: proposals.map(proposalView),
        benchmark: { ibexPct: changeSince(bench(INDEX_SYMBOL), since), btcPct: changeSince(bench(CRYPTO_BENCHMARK), since) },
      };
    }),
  );
  return { agents, moves: movesOf(agents) };
}

export type AgentMove = {
  id: string;
  agent: string;
  name: string;
  color: string;
  at: string;
  kind: "compra" | "venta" | "protege" | "stop" | "objetivo" | "tiempo";
  asset: string;
  text: string | null;
  pnl: number | null;
};

/** Últimos movimientos de los agentes: decisiones ejecutadas y cierres por stop, objetivo o tiempo. */
function movesOf(
  agents: {
    key: string;
    name: string;
    color: string;
    proposals: ReturnType<typeof proposalView>[];
    closed: { id: string; name: string; exitDay: string | null; exitReason: string | null; pnl: number | null }[];
  }[],
): AgentMove[] {
  const out: AgentMove[] = [];
  for (const a of agents) {
    for (const p of a.proposals) {
      if (p.status !== "ejecutada") continue;
      const kind = p.action === "comprar" ? "compra" : p.action === "vender" ? "venta" : p.action === "mantener" ? "protege" : null;
      if (!kind) continue;
      out.push({ id: p.id, agent: a.key, name: a.name, color: a.color, at: p.createdAt, kind, asset: p.name, text: p.rationale, pnl: null });
    }
    for (const c of a.closed) {
      const r = (c.exitReason ?? "").toLowerCase();
      const kind = r.includes("stop") || r.includes("break") ? "stop" : r.includes("objetivo") ? "objetivo" : r.includes("tiempo") ? "tiempo" : null;
      if (!kind || !c.exitDay) continue;
      out.push({ id: c.id, agent: a.key, name: a.name, color: a.color, at: `${c.exitDay}T17:30:00.000Z`, kind, asset: c.name, text: null, pnl: c.pnl });
    }
  }
  return out.sort((x, y) => y.at.localeCompare(x.at)).slice(0, 20);
}

/** Reunión de un agente: pone al día su cartera, decide y ejecuta. */
export async function runAgent(workspaceId: string, key: string, userId: string | null) {
  const def = agentByKey(key);
  if (!def) throw new Error("Agente desconocido");
  const account = await ensureAgent(workspaceId, def);
  await processAccount(account.id);
  return runCommittee(workspaceId, userId, def.key);
}

/** Vuelve a empezar con el capital inicial y los ajustes de su perfil. */
export async function resetAgent(workspaceId: string, key: string) {
  const def = agentByKey(key);
  if (!def) throw new Error("Agente desconocido");
  const account = await ensureAgent(workspaceId, def);
  await resetAccount(workspaceId, def.capital, def.key);
  await prisma.trading_accounts.update({ where: { id: account.id }, data: { ...def.settings, name: def.name, created_at: new Date(), updated_at: new Date() } });
}

/** Cron: reunión diaria de los agentes de cada espacio que los tenga, en paralelo. */
export async function runAgentsDaily(budgetMs = 55_000) {
  const started = Date.now();
  const spaces = await prisma.trading_accounts.findMany({ where: { agent: { not: "" } }, select: { workspace_id: true }, distinct: ["workspace_id"] });
  const results: { workspaceId: string; agent: string; ok: boolean; detail: string }[] = [];
  for (const { workspace_id } of spaces) {
    if (Date.now() - started > budgetMs / 3) break;
    const runs = await Promise.allSettled(AGENTS.map((a) => runAgent(workspace_id, a.key, null)));
    runs.forEach((r, k) =>
      results.push({
        workspaceId: workspace_id,
        agent: AGENTS[k].key,
        ok: r.status === "fulfilled",
        detail: r.status === "fulfilled" ? `${r.value.auto.filter((x) => x.ok).length} órdenes` : r.reason instanceof Error ? r.reason.message : "error",
      }),
    );
  }
  return { results };
}
