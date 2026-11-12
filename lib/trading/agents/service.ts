// lib/trading/agents/service.ts
// Los agentes en marcha: cada uno con su cartera virtual, sus reuniones y su marcador.
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accountState, ensureAccount, processAccount, resetAccount } from "../accounts";
import { runCommittee, view as proposalView } from "../committee/service";
import { CRYPTO_BENCHMARK, INDEX_SYMBOL } from "../market-data";
import { dayKey, loadSeries } from "../sync";
import { meetingDue, meetingIntervalMinutes } from "../live-logic";
import { AGENTS, AGENTS_WORKSPACE, agentByKey, copyKey, type AgentDef } from "./roster";
import { isKamikaze, KAMIKAZES, type KamikazeDef } from "../kamikaze/roster";
import { kamikazeView, resetKamikaze, runKamikazeNow } from "../kamikaze/engine";

const WS = AGENTS_WORKSPACE;

/** Todos los agentes del catálogo: los clásicos y los kamikazes. */
const CATALOG: (AgentDef | KamikazeDef)[] = [...AGENTS, ...KAMIKAZES];

async function ensureAgent(a: AgentDef | KamikazeDef) {
  return ensureAccount(WS, a.key, { name: a.name, capital: a.capital, settings: a.settings });
}

/** Rentabilidad de un índice desde un día (para comparar). */
function changeSince(candles: { t: number; c: number }[], since: number) {
  if (!candles.length) return null;
  const start = candles.find((c) => c.t >= since) ?? null;
  const last = candles[candles.length - 1];
  if (!start || start === last) return 0;
  return ((last.c - start.c) / start.c) * 100;
}

/** Los agentes son iguales para todos; `workspaceId` solo sirve para saber a cuáles copias tú. */
export async function getAgents(workspaceId?: string) {
  const accounts = await Promise.all(CATALOG.map((a) => ensureAgent(a)));
  const copies = workspaceId
    ? await prisma.trading_accounts.findMany({ where: { workspace_id: workspaceId, agent: { in: AGENTS.map((a) => copyKey(a.key)) }, copy_weight_pct: { not: null } } })
    : [];
  // Tus copias: la virtual (subcartera con su peso) y la de dinero real/ensayo en tu exchange.
  const copyReturns = new Map<string, number>(
    await Promise.all(copies.map(async (c) => [c.agent, (await accountState(c.workspace_id, c.agent)).summary.returnPct] as const)),
  );
  const mirrors = workspaceId
    ? await prisma.trading_mirrors.findMany({ where: { workspace_id: workspaceId, active: true }, include: { legs: { select: { result: true, status: true } } } })
    : [];
  const started = Math.min(...accounts.map((a) => a.created_at.getTime()));
  const benchInst = await prisma.market_instruments.findMany({ where: { symbol: { in: [INDEX_SYMBOL, CRYPTO_BENCHMARK] } } });
  const benchSeries = await loadSeries(benchInst.map((i) => i.id), new Date(started - 5 * 86_400_000));
  const bench = (s: string) => {
    const i = benchInst.find((x) => x.symbol === s);
    return i ? benchSeries.get(i.id) ?? [] : [];
  };

  const agents = await Promise.all(
    CATALOG.map(async (def, k) => {
      const account = accounts[k];
      const kamikaze = isKamikaze(def.key) ? await kamikazeView(def.key) : null;
      const [state, equity, runs, proposals] = await Promise.all([
        accountState(WS, def.key),
        prisma.trading_equity.findMany({ where: { account_id: account.id }, orderBy: { day: "asc" }, take: 1000 }),
        prisma.trading_committee_runs.findMany({ where: { workspace_id: WS, agent: def.key }, orderBy: { created_at: "desc" }, take: 1 }),
        prisma.trading_proposals.findMany({ where: { workspace_id: WS, agent: def.key }, orderBy: { created_at: "desc" }, take: 40 }),
      ]);
      const last = runs[0] ?? null;
      const since = account.created_at.getTime();
      // Kamikazes: la curva y la rentabilidad son las de la ronda en curso.
      const roundStart = kamikaze?.current ? new Date(kamikaze.current.startedAt.slice(0, 10)).getTime() : null;
      return {
        kind: (kamikaze ? "kamikaze" : "agente") as "kamikaze" | "agente",
        kamikaze,
        key: def.key,
        name: def.name,
        profile: def.profile as AgentDef["profile"] | KamikazeDef["profile"],
        tagline: def.tagline,
        color: def.color,
        rules: def.rules,
        settings: {
          riskPerTradePct: def.settings.risk_per_trade_pct,
          maxPositionPct: def.settings.max_position_pct,
          maxOpenPositions: def.settings.max_open_positions,
        },
        startedAt: account.created_at.toISOString(),
        copyWeightPct: copies.find((c) => c.agent === copyKey(def.key))?.copy_weight_pct ?? null,
        /** Rentabilidad de tu copia virtual desde que la empezaste. */
        copyReturnPct: copyReturns.get(copyKey(def.key)) ?? null,
        /** Tu copia en el exchange (ensayo o dinero real): presupuesto y resultado cerrado. */
        mirror: (() => {
          const m = mirrors.find((x) => x.agent === def.key);
          if (!m) return null;
          const result = m.legs.reduce((s, l) => s + (l.status === "cerrada" ? l.result ?? 0 : 0), 0);
          return { mode: m.mode as "ensayo" | "real", budget: m.budget, result, resultPct: m.budget > 0 ? (result / m.budget) * 100 : 0, since: m.started_at.toISOString() };
        })(),
        summary: state.summary,
        positions: state.positions.filter((p) => p.status === "abierta" || p.status === "pendiente"),
        closed: state.positions.filter((p) => p.status === "cerrada").slice(0, 20),
        equity: equity.filter((e) => roundStart === null || e.day.getTime() >= roundStart).map((e) => ({ day: dayKey(e.day), equity: e.equity })),
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
  /** Símbolo del valor (para su icono). */
  symbol: string;
  text: string | null;
  /** Precio de stop propuesto, si se registró. */
  stop: number | null;
  /** Resultado realizado en cierre o resultado actual (latente) de la posición. */
  pnl: number | null;
  pnlType: "realizado" | "latente" | null;
};

/** Últimos movimientos de los agentes: decisiones ejecutadas y cierres por stop, objetivo o tiempo. */
function movesOf(
  agents: {
    key: string;
    name: string;
    color: string;
    proposals: ReturnType<typeof proposalView>[];
    positions: { id: string; unrealized: number | null }[];
    closed: { id: string; name: string; symbol: string; exitDay: string | null; exitReason: string | null; pnl: number | null }[];
  }[],
): AgentMove[] {
  const out: AgentMove[] = [];
  for (const a of agents) {
    for (const p of a.proposals) {
      if (p.status !== "ejecutada") continue;
      const kind = p.action === "comprar" ? "compra" : p.action === "vender" ? "venta" : p.action === "mantener" ? "protege" : null;
      if (!kind) continue;
      // P/L mostrado con su naturaleza: no atribuir ganancias realizadas a posiciones abiertas.
      const openPosition = p.positionId ? a.positions.find((pos) => pos.id === p.positionId) : null;
      const closedPosition = p.positionId ? a.closed.find((pos) => pos.id === p.positionId) : null;
      const pnl = openPosition?.unrealized ?? closedPosition?.pnl ?? null;
      const pnlType = openPosition?.unrealized != null ? "latente" : closedPosition?.pnl != null ? "realizado" : null;
      out.push({
        id: p.id, agent: a.key, name: a.name, color: a.color, at: p.createdAt, kind,
        asset: p.name, symbol: p.symbol, text: p.rationale, stop: p.stop, pnl, pnlType,
      });
    }
    for (const c of a.closed) {
      const r = (c.exitReason ?? "").toLowerCase();
      const kind = r.includes("stop") || r.includes("break") ? "stop" : r.includes("objetivo") ? "objetivo" : r.includes("tiempo") ? "tiempo" : null;
      if (!kind || !c.exitDay) continue;
      out.push({
        id: c.id, agent: a.key, name: a.name, color: a.color, at: `${c.exitDay}T17:30:00.000Z`,
        kind, asset: c.name, symbol: c.symbol, text: null, stop: null,
        pnl: c.pnl, pnlType: c.pnl === null ? null : "realizado",
      });
    }
  }
  return out.sort((x, y) => y.at.localeCompare(x.at)).slice(0, 20);
}

/** Reunión de un agente: pone al día su cartera, decide y ejecuta. */
export async function runAgent(key: string, userId: string | null) {
  if (isKamikaze(key)) return runKamikazeNow(key);
  const def = agentByKey(key);
  if (!def) throw new Error("Agente desconocido");
  const account = await ensureAgent(def);
  await processAccount(account.id);
  return runCommittee(WS, userId, def.key);
}

/** Los agentes son de toda la plataforma: solo los dirige quien la administra (o cualquiera en local). */
export function canDirectAgents(workspaceId: string) {
  if (process.env.NODE_ENV === "development") return true;
  const allowed = (process.env.TRADING_AGENTS_ADMIN_WORKSPACES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(workspaceId);
}

/** Vuelve a empezar con el capital inicial y los ajustes de su perfil. */
export async function resetAgent(key: string) {
  if (isKamikaze(key)) return resetKamikaze(key);
  const def = agentByKey(key);
  if (!def) throw new Error("Agente desconocido");
  const account = await ensureAgent(def);
  await resetAccount(WS, def.capital, def.key);
  await prisma.trading_accounts.update({ where: { id: account.id }, data: { ...def.settings, name: def.name, created_at: new Date(), updated_at: new Date() } });
}

/** Cron: reunión diaria de los tres agentes, en paralelo. */
export async function runAgentsDaily() {
  const runs = await Promise.allSettled(AGENTS.map((a) => runAgent(a.key, null)));
  return {
    results: runs.map((r, k) => ({
      agent: AGENTS[k].key,
      ok: r.status === "fulfilled",
      detail: r.status === "fulfilled" ? `${r.value.auto.filter((x) => x.ok).length} órdenes` : r.reason instanceof Error ? r.reason.message : "error",
    })),
  };
}

// ---------------------------------------------------------------------------
// Reuniones durante el día
// ---------------------------------------------------------------------------
let ticking = false;

/**
 * Si a algún agente le toca reunirse (cada hora con la bolsa abierta, cada 4 h fuera; configurable),
 * reúne al que lleve más tiempo sin hacerlo. Uno por llamada: cada reunión tarda hasta un minuto.
 * Un «turno» en la base de datos impide que dos servidores reúnan al mismo agente a la vez.
 */
export async function maybeRunAgents(userId: string | null = null) {
  if (ticking) return { ran: null as string | null, skipped: "en curso" };
  const interval = meetingIntervalMinutes();
  if (interval <= 0) return { ran: null, skipped: "reuniones durante el día desactivadas" };
  ticking = true;
  try {
    const last = await Promise.all(
      AGENTS.map(async (a) => {
        const run = await prisma.trading_committee_runs.findFirst({ where: { workspace_id: WS, agent: a.key }, orderBy: { created_at: "desc" }, select: { created_at: true } });
        return { key: a.key, at: run?.created_at.getTime() ?? null };
      }),
    );
    const due = last.filter((l) => meetingDue(l.at, interval)).sort((x, y) => (x.at ?? 0) - (y.at ?? 0));
    for (const d of due) {
      const def = agentByKey(d.key)!;
      const account = await ensureAgent(def);
      // Turno de 5 minutos: solo un servidor lo consigue.
      const got = await prisma.$executeRaw(Prisma.sql`UPDATE public.trading_accounts SET meeting_lease_until = now() + interval '5 minutes'
        WHERE id = ${account.id}::uuid AND (meeting_lease_until IS NULL OR meeting_lease_until < now())`);
      if (got !== 1) continue;
      try {
        await runAgent(def.key, userId);
      } finally {
        await prisma.trading_accounts.update({ where: { id: account.id }, data: { meeting_lease_until: null } }).catch(() => undefined);
      }
      return { ran: def.key, skipped: null };
    }
    return { ran: null, skipped: "a ningún agente le toca" };
  } finally {
    ticking = false;
  }
}
