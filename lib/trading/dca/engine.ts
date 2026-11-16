// lib/trading/dca/engine.ts
// Motor de los agentes de referencia (DCA): en cada revisión, si toca, compra su cantidad semanal al
// precio del momento y deja su foto del día. Sin stop ni objetivo reales (no vende nunca): la orden lleva
// un stop simbólico muy por debajo y un objetivo muy por encima, que nunca se tocan.
import "server-only";
import { prisma } from "@/lib/prisma";
import { accountState, costOf, ensureAccount, madridDay, placeOrder } from "../accounts";
import { AGENTS_WORKSPACE } from "../agents/roster";
import { dayDate } from "../sync";
import { setLive } from "../faro/engine";
import { allInQuantity } from "../kamikaze/logic";
import { priceEur } from "../kamikaze/market";
import { DCA_AGENTS, dcaDue, weekOf, type DcaDef } from "./roster";

const WS = AGENTS_WORKSPACE;
const GAP_MS = 10 * 60_000;
let lastTick = 0;
let running: Promise<{ agent: string; actions: string[] }[]> | null = null;

const ensureDca = (def: DcaDef) => ensureAccount(WS, def.key, { name: def.name, capital: def.capital, settings: def.settings });

async function one(def: DcaDef) {
  const actions: string[] = [];
  const account = await ensureDca(def);
  const bought = await prisma.trading_positions.findMany({ where: { account_id: account.id, signal_key: { startsWith: "dca:" } }, select: { signal_key: true } });
  const weeks = new Set<string>(bought.map((b) => String(b.signal_key).slice(4)));
  let state = await accountState(WS, def.key);
  const week = dcaDue({ now: Date.now(), weekday: def.weekday, boughtWeeks: weeks, firstWeek: weeks.size ? [...weeks].sort()[0] : null, cash: state.summary.available, amount: def.amount });
  if (week) {
    const px = await priceEur(def.pair);
    const inst = await prisma.market_instruments.findUnique({ where: { symbol: def.symbol }, select: { id: true } });
    if (px && inst) {
      await setLive(inst.id, px);
      const quantity = allInQuantity(Math.min(def.amount, state.summary.available), px, costOf(state.account));
      const placed = await placeOrder(
        WS,
        null,
        {
          symbol: def.symbol,
          direction: "long",
          quantity,
          stop: px * 0.01,
          target: px * 100,
          execution: "now",
          maxHoldDays: null,
          notes: `${def.name}: compra semanal de ${def.amount} € (semana del ${week}). No vende nunca.`,
          source: "agente",
          signalKey: `dca:${week}`,
        },
        def.key,
      );
      // Queda escrito como una decisión más (se ve en Actividad y en su página).
      const run = await prisma.trading_committee_runs.create({ data: { workspace_id: WS, agent: def.key, as_of: dayDate(madridDay()), status: "ok" } });
      await prisma.trading_proposals.create({
        data: {
          run_id: run.id,
          workspace_id: WS,
          agent: def.key,
          symbol: def.symbol,
          name: def.symbol.replace(/-EUR$/, ""),
          market: "crypto",
          action: "comprar",
          conviction: 1,
          horizon_days: 1,
          price: px,
          stop: null,
          target: null,
          quantity,
          rationale: `Compra semanal de ${def.amount} €, como cada lunes, sin mirar el mercado. No vende nunca: es la referencia con la que se compara al resto.`,
          risks: null,
          status: "ejecutada",
          rejection: null,
          position_id: placed.id,
          decided_at: new Date(),
        },
      });
      actions.push(`compra semanal: ${quantity} a ${px.toFixed(2)} €`);
      state = await accountState(WS, def.key);
    } else actions.push("sin precio: lo intenta en la próxima revisión");
  }
  const s = state.summary;
  const day = dayDate(madridDay());
  await prisma.trading_equity.upsert({
    where: { account_id_day: { account_id: account.id, day } },
    create: { account_id: account.id, day, equity: s.equity, cash: s.cash, invested: s.invested },
    update: { equity: s.equity, cash: s.cash, invested: s.invested },
  });
  return { agent: def.key, actions };
}

/** Revisión de los agentes de referencia (como mucho cada 10 minutos). */
export function dcaTick(force = false) {
  if (running) return running;
  if (!force && Date.now() - lastTick < GAP_MS) return Promise.resolve([]);
  lastTick = Date.now();
  running = Promise.all(
    DCA_AGENTS.map((d) =>
      one(d).catch((e) => {
        console.error("[dca]", d.key, e);
        return { agent: d.key, actions: [`error: ${e instanceof Error ? e.message.slice(0, 160) : "desconocido"}`] };
      }),
    ),
  ).finally(() => {
    running = null;
  });
  return running;
}

