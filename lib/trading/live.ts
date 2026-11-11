// lib/trading/live.ts
// Precio en directo durante la sesión: cada ~10 minutos (cuando alguien usa el módulo o lo pide el
// cron) se descarga la vela provisional de hoy de los valores que importan — los que hay en carteras
// y los que han comprado los agentes — y se ejecutan las órdenes pendientes con la apertura.
// Las velas de cierre siguen llegando en el proceso diario; esto no las sustituye.
import "server-only";
import { prisma } from "@/lib/prisma";
import { fillPendingLive, OPEN_STATUSES } from "./accounts";
import { fetchDailyCandles, isCryptoMarket } from "./market-data";
import { todayBar } from "./live-logic";

/** Cada valor se consulta como mucho cada 10 minutos (el proveedor no es una API oficial). */
const STALE_MS = 10 * 60_000;
/** Y la revisión entera, como mucho cada 3 minutos por instancia. */
const MIN_GAP_MS = 3 * 60_000;
const RECENT_PROPOSALS_DAYS = 4;

export type LiveSummary = { checked: number; updated: number; filled: number; cancelled: number; skipped?: string };

let running: Promise<LiveSummary> | null = null;
let lastRun = 0;

/** Lanza la revisión si toca; si ya hay una en marcha, espera a esa. */
export function refreshLive(budgetMs = 8_000, force = false): Promise<LiveSummary> {
  if (running) return running;
  if (!force && Date.now() - lastRun < MIN_GAP_MS) return Promise.resolve({ checked: 0, updated: 0, filled: 0, cancelled: 0, skipped: "reciente" });
  lastRun = Date.now();
  running = run(budgetMs).finally(() => {
    running = null;
  });
  return running;
}

async function run(budgetMs: number): Promise<LiveSummary> {
  const started = Date.now();
  const out: LiveSummary = { checked: 0, updated: 0, filled: 0, cancelled: 0 };
  const since = new Date(Date.now() - RECENT_PROPOSALS_DAYS * 86_400_000);
  const [held, proposed] = await Promise.all([
    prisma.trading_positions.findMany({ where: { status: { in: [...OPEN_STATUSES] } }, select: { instrument_id: true }, distinct: ["instrument_id"] }),
    prisma.trading_proposals.findMany({ where: { action: "comprar", created_at: { gte: since } }, select: { symbol: true }, distinct: ["symbol"] }),
  ]);
  const stale = new Date(Date.now() - STALE_MS);
  const instruments = await prisma.market_instruments.findMany({
    where: {
      active: true,
      OR: [{ id: { in: held.map((h) => h.instrument_id) } }, { symbol: { in: proposed.map((p) => p.symbol) } }],
      AND: [{ OR: [{ live_at: null }, { live_at: { lt: stale } }] }],
    },
    select: { id: true, symbol: true, market: true },
    orderBy: { live_at: { sort: "asc", nulls: "first" } },
  });

  // Descargas en paralelo (de 4 en 4) mientras quede tiempo.
  const queue = [...instruments];
  const worker = async () => {
    for (let inst = queue.shift(); inst; inst = queue.shift()) {
      if (Date.now() - started > budgetMs) return;
      out.checked++;
      try {
        const r = await fetchDailyCandles(inst.symbol, { since: new Date(Date.now() - 6 * 86_400_000), timeoutMs: 5_000 });
        const bar = todayBar(r.candles, isCryptoMarket(inst.market));
        await prisma.market_instruments.update({
          where: { id: inst.id },
          data: bar
            ? { live_day: new Date(bar.t), live_open: bar.o, live_high: bar.h, live_low: bar.l, live_price: bar.c, live_at: new Date() }
            : // Sin vela de hoy (noche, fin de semana o el proveedor aún no la tiene: la bolsa española
              // llega con ~15 min de retraso): se vuelve a mirar en un par de minutos, no en diez.
              { live_at: new Date(Date.now() - STALE_MS + 2 * 60_000) },
        });
        if (bar) out.updated++;
      } catch {
        // Un valor sin datos no frena al resto; se reintenta en la siguiente revisión.
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  // Órdenes pendientes que ya se pueden ejecutar con la apertura de hoy.
  const accounts = await prisma.trading_positions.findMany({ where: { status: "pendiente" }, select: { account_id: true }, distinct: ["account_id"] });
  for (const { account_id } of accounts) {
    const r = await fillPendingLive(account_id);
    out.filled += r.filled;
    out.cancelled += r.cancelled;
  }
  return out;
}
