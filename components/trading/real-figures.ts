// Cifras de tu dinero real, iguales en Inicio y en Mi cartera (un solo cálculo para que nunca se contradigan).
//  - Saldo: lo que dicen tus exchanges (en euros).
//  - Invertido: lo que tienen tus agentes (lo que les diste + lo que llevan) y tus operaciones abiertas.
//  - Disponible: el resto del saldo.
//  - Ganancia o pérdida: operaciones cerradas desde «Cuenta desde» más lo abierto a precio de ahora. Los ingresos y
//    las retiradas no cuentan.
import type { getWallets } from "@/lib/trading/wallets";
import type { manualView } from "@/lib/trading/manual/service";
import type { mirrorView } from "@/lib/trading/mirror/service";
import type { pnlView } from "@/lib/trading/pnl";

export type Wallets = Awaited<ReturnType<typeof getWallets>>;
export type ManualView = Awaited<ReturnType<typeof manualView>>;
export type MirrorsView = Awaited<ReturnType<typeof mirrorView>>;
export type PnlView = Awaited<ReturnType<typeof pnlView>>;

export function realFigures({ wallets, mirrors, manual, pnl }: { wallets: Wallets | null; mirrors: MirrorsView | null; manual: ManualView | null; pnl: PnlView | null }) {
  const real = (wallets?.items ?? []).filter((w) => w.environment === "real" && w.total !== null && w.currency === "EUR");
  const total = real.reduce((s, w) => s + (w.total ?? 0), 0);
  const realMirrors = (mirrors?.mirrors ?? []).filter((m) => m.active && m.mode === "real");
  const agentsNow = realMirrors.reduce((s, m) => s + m.budget + m.result + (m.unrealized ?? 0), 0);
  const own = manual?.working ?? 0;
  const invested = Math.min(total, agentsNow + own);
  const available = Math.max(0, total - invested);
  const openAgents = realMirrors.reduce((s, m) => s + (m.unrealized ?? 0), 0);
  const openOwn = (manual?.trades ?? []).filter((t) => t.status === "abierta").reduce((s, t) => s + (t.result ?? 0), 0);
  const events = pnl?.events ?? [];
  const earnedAgents = events.filter((e) => e.kind === "agente").reduce((s, e) => s + e.result, 0) + openAgents;
  const earnedOwn = events.filter((e) => e.kind === "tuya").reduce((s, e) => s + e.result, 0) + openOwn;
  const earned = earnedAgents + earnedOwn;
  const base = pnl?.base ?? 0;
  return {
    total, invested, available, agents: Math.min(agentsNow, invested), own: Math.min(own, invested),
    earned, earnedAgents, earnedOwn, open: openAgents + openOwn,
    pct: base > 0 ? (earned / base) * 100 : null,
    since: pnl?.since ?? null,
    exchanges: real.filter((w) => (w.total ?? 0) >= 0.01).length,
  };
}

/** Ganancia acumulada (sin ingresos) para la gráfica: empieza en 0 al principio del periodo y acaba con lo abierto. */
export function pnlSeries(events: PnlView["events"], open: number, from: number) {
  const now = Date.now();
  const inPeriod = events.filter((e) => new Date(e.at).getTime() >= from);
  let acc = 0;
  const points = [{ day: new Date(from).toISOString(), equity: 0 }];
  for (const e of inPeriod) {
    acc += e.result;
    points.push({ day: e.at, equity: Math.round(acc * 100) / 100 });
  }
  points.push({ day: new Date(now).toISOString(), equity: Math.round((acc + open) * 100) / 100 });
  return { points, total: acc + open };
}
