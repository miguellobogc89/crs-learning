// lib/trading/summary.ts
// Resumen de Inicio (17/11/2026): lo justo para verlo en un segundo. Tu saldo real, cómo va cada familia
// de agentes, el mercado en cuatro datos, lo que gasta la IA y si todo funciona.
import "server-only";
import { prisma } from "@/lib/prisma";
import { accountState } from "./accounts";
import { AGENTS_WORKSPACE } from "./agents/roster";
import { KAMIKAZES } from "./kamikaze/roster";
import { CHIP_AGENTS } from "./chip/roster";
import { getPulse } from "./pulse/service";
import { dailyCallLimit } from "./ai";
import { agentGroups, aiCostEur, type AgentRow } from "./summary-logic";
import { listNotifications } from "./notifications";

const DAY = 86_400_000;

function aiPrice() {
  const i = Number(process.env.TRADING_AI_PRICE_IN_EUR);
  const o = Number(process.env.TRADING_AI_PRICE_OUT_EUR);
  return Number.isFinite(i) && i > 0 && Number.isFinite(o) && o > 0 ? { input: i, output: o } : null;
}

async function aiUsage() {
  const rows = await prisma.trading_ai_usage.findMany({ where: { day: { gte: new Date(Date.now() - 30 * DAY) } } });
  const byDay = new Map<string, { calls: number; input: number; output: number }>();
  for (const r of rows) {
    const k = r.day.toISOString().slice(0, 10);
    const d = byDay.get(k) ?? { calls: 0, input: 0, output: 0 };
    d.calls += r.calls;
    d.input += r.input_tokens;
    d.output += r.output_tokens;
    byDay.set(k, d);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const sum = (from: number) => {
    const cut = new Date(Date.now() - from * DAY).toISOString().slice(0, 10);
    const pick = days.filter(([k]) => k > cut).map(([, v]) => v);
    const t = { calls: pick.reduce((s, v) => s + v.calls, 0), input: pick.reduce((s, v) => s + v.input, 0), output: pick.reduce((s, v) => s + v.output, 0) };
    return { ...t, tokens: t.input + t.output, costEur: aiCostEur(t, aiPrice()) };
  };
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = byDay.get(todayKey) ?? { calls: 0, input: 0, output: 0 };
  return {
    today: { ...today, tokens: today.input + today.output, costEur: aiCostEur(today, aiPrice()) },
    week: sum(7),
    month: sum(30),
    limit: dailyCallLimit(),
    /** Llamadas por día (últimos 14), para la barrita. */
    days: days.slice(-14).map(([day, v]) => ({ day, calls: v.calls })),
  };
}

async function balance(userId: string, workspaceId: string) {
  const [last, dayAgo] = await Promise.all([
    prisma.trading_wallet_intraday.findFirst({ where: { user_id: userId, workspace_id: workspaceId }, orderBy: { sampled_at: "desc" } }),
    prisma.trading_wallet_intraday.findFirst({ where: { user_id: userId, workspace_id: workspaceId, sampled_at: { lte: new Date(Date.now() - DAY) } }, orderBy: { sampled_at: "desc" } }),
  ]).catch(() => [null, null] as const);
  if (!last) return null;
  return {
    total: last.total,
    at: last.sampled_at.toISOString(),
    ch24h: dayAgo && dayAgo.total > 0 ? ((last.total - dayAgo.total) / dayAgo.total) * 100 : null,
  };
}

async function agents() {
  const defs = [...KAMIKAZES.map((k) => ({ key: k.key, name: k.name, color: k.color })), ...CHIP_AGENTS.map((c) => ({ key: c.key, name: c.name, color: c.color }))];
  const rows: AgentRow[] = await Promise.all(
    defs.map(async (d) => {
      const s = await accountState(AGENTS_WORKSPACE, d.key).catch(() => null);
      return {
        ...d,
        equity: s?.summary.equity ?? 0,
        returnPct: s?.summary.returnPct ?? 0,
        trades: s ? s.positions.filter((p) => p.status !== "cancelada").length : 0,
      };
    }),
  );
  return agentGroups(rows);
}

export async function getSummary(ctx: { userId: string; workspaceId: string }) {
  const [ai, pulse, bal, groups, notes] = await Promise.all([
    aiUsage().catch(() => null),
    getPulse().catch(() => null),
    balance(ctx.userId, ctx.workspaceId),
    agents().catch(() => []),
    listNotifications(5).catch(() => null),
  ]);
  return {
    asOf: new Date().toISOString(),
    balance: bal,
    groups,
    market: pulse
      ? {
          fearGreed: pulse.fearGreed ? { value: pulse.fearGreed.value, label: pulse.fearGreed.label } : null,
          btc: pulse.btc ? { price: pulse.btc.price, ch24h: pulse.btc.ch24h } : null,
          phase: pulse.phase ? { mode: pulse.phase.mode, days: pulse.phase.days } : null,
          btcDominance: pulse.global?.btcDominance ?? null,
        }
      : null,
    ai,
    health: notes
      ? { problems: notes.openProblems, latest: notes.items.filter((n) => !n.resolvedAt && n.level !== "ok").slice(0, 3).map((n) => n.title) }
      : null,
  };
}
