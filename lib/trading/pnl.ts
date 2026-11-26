// lib/trading/pnl.ts
// Rentabilidad de tu dinero real sin contar ingresos ni retiradas: solo el resultado de las operaciones cerradas
// (copias de agentes y operaciones tuyas). Lo abierto lo suma la pantalla con su valor de ahora. Se cuenta desde la
// fecha que elijas («Cuenta desde»), para dejar fuera pruebas antiguas sin borrarlas.
import "server-only";
import { prisma } from "@/lib/prisma";

let ensured = false;
async function ensure() {
  if (ensured) return;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS trading_prefs (workspace_id uuid PRIMARY KEY, pnl_since timestamptz, updated_at timestamptz NOT NULL DEFAULT now())`;
  ensured = true;
}

export async function pnlSince(workspaceId: string): Promise<Date | null> {
  await ensure();
  const rows = await prisma.$queryRaw<{ pnl_since: Date | null }[]>`SELECT pnl_since FROM trading_prefs WHERE workspace_id = ${workspaceId}::uuid`;
  return rows[0]?.pnl_since ?? null;
}

/** Cambia (o quita, con null) desde cuándo cuenta la rentabilidad. */
export async function setPnlSince(workspaceId: string, input: unknown) {
  await ensure();
  const raw = input === null || input === "" ? null : String(input);
  const since = raw ? new Date(raw) : null;
  if (since && (!Number.isFinite(since.getTime()) || since.getTime() > Date.now())) throw new Error("Fecha no válida");
  await prisma.$executeRaw`
    INSERT INTO trading_prefs (workspace_id, pnl_since) VALUES (${workspaceId}::uuid, ${since})
    ON CONFLICT (workspace_id) DO UPDATE SET pnl_since = EXCLUDED.pnl_since, updated_at = now()`;
  return pnlView(workspaceId);
}

export type PnlEvent = { at: string; result: number; kind: "agente" | "tuya"; agent: string | null; symbol: string };

/** Operaciones cerradas con dinero real desde la fecha elegida, y el dinero que ha trabajado (para el %). */
export async function pnlView(workspaceId: string) {
  const since = await pnlSince(workspaceId);
  const after = since ? { gte: since } : undefined;
  const [legs, manual, mirrors, manualOpenedSince] = await Promise.all([
    prisma.trading_mirror_legs.findMany({
      where: { mode: "real", status: "cerrada", result: { not: null }, mirror: { workspace_id: workspaceId }, ...(after ? { closed_at: after } : {}) },
      select: { closed_at: true, result: true, symbol: true, mirror: { select: { agent: true } } },
    }),
    prisma.trading_manual_trades.findMany({
      where: { workspace_id: workspaceId, status: "cerrada", ...(after ? { closed_at: after } : {}) },
      select: { closed_at: true, result: true, symbol: true },
    }),
    prisma.trading_mirrors.findMany({ where: { workspace_id: workspaceId, mode: "real", active: true }, select: { budget: true } }),
    prisma.trading_manual_trades.findMany({
      where: { workspace_id: workspaceId, status: { in: ["abierta", "cerrada"] }, ...(after ? { opened_at: after } : {}) },
      select: { quantity: true, entry_price: true, amount: true },
    }),
  ]);
  const events: PnlEvent[] = [
    ...legs.filter((l) => l.closed_at).map((l) => ({ at: l.closed_at!.toISOString(), result: l.result ?? 0, kind: "agente" as const, agent: l.mirror.agent, symbol: l.symbol })),
    ...manual.filter((t) => t.closed_at && t.result !== null).map((t) => ({ at: t.closed_at!.toISOString(), result: t.result ?? 0, kind: "tuya" as const, agent: null, symbol: t.symbol })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  // Dinero que ha trabajado: lo que das a tus agentes más lo que metiste en tus operaciones del periodo.
  const base =
    mirrors.reduce((s, m) => s + m.budget, 0) +
    manualOpenedSince.reduce((s, t) => s + (t.quantity && t.entry_price ? t.quantity * t.entry_price : t.amount), 0);
  return { since: since?.toISOString() ?? null, events, base };
}
