// lib/trading/kamikaze/engine.ts
// Motor de los kamikazes. Cada pocos minutos (cuando alguien usa el módulo o lo pide el cron):
//   1) vigilancia sin IA: precio al momento de Binance, stop y objetivo, protección del stop;
//   2) rondas: termina la ronda al llegar a la meta o quedarse sin dinero, y empieza otra;
//   3) sin posición, toma la mejor idea viva de su estilo del tablón de FARO (sin IA propia: el
//      análisis lo hace FARO una vez para todos). Las salidas son reglas: stop, objetivo y stop
//      protegido a partir de +30 %.
// Opera en su cartera virtual de siempre (accounts.ts): mismas órdenes, mismos costes.
import "server-only";
import { Prisma, type trading_kamikaze_rounds } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accountState, closePosition, costOf, ensureAccount, madridDay, placeOrder } from "../accounts";
import { AGENTS_WORKSPACE } from "../agents/roster";
import { dayDate } from "../sync";
import { boardIdeas, faroTick, lastMarketView, setLive } from "../faro/engine";
import { pickIdea, type BoardIdea } from "../faro/logic";
import { allInQuantity, exitNow, protectedStop, roundOutcome, type Ticker } from "./logic";
import { eurPairs, priceEur, tickers } from "./market";
import { KAMIKAZES, kamikazeByKey, type KamikazeDef } from "./roster";

const WS = AGENTS_WORKSPACE;
const DAY = 86_400_000;
/** Mínimo para una orden en un exchange (Binance pide ~5 € por orden en los pares en euros). */
const MIN_ORDER = 5;
const env = (k: string, d: number) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const COOLDOWN_MIN = () => env("TRADING_KAMIKAZE_COOLDOWN_MINUTES", 30);
const TICK_GAP_MS = 2 * 60_000;

const ensureKamikaze = (def: KamikazeDef) => ensureAccount(WS, def.key, { name: def.name, capital: def.capital, settings: def.settings });
/** Par de Binance de un valor de CRS: el de euros si existe; si no, el de USDC. */
const pairFor = (symbol: string, rules: Map<string, unknown>) => {
  const base = symbol.replace(/-EUR$/, "");
  return rules.has(`${base}EUR`) ? `${base}EUR` : `${base}USDC`;
};

// ---------------------------------------------------------------------------
// Rondas
// ---------------------------------------------------------------------------
async function startRound(def: KamikazeDef) {
  const account = await ensureKamikaze(def);
  const last = await prisma.trading_kamikaze_rounds.findFirst({ where: { agent: def.key }, orderBy: { number: "desc" } });
  const number = (last?.number ?? 0) + 1;
  // Cada ronda empieza con el mismo capital: se repone lo perdido o se retira lo ganado.
  const delta = def.capital - account.cash;
  await prisma.$transaction([
    prisma.trading_accounts.update({ where: { id: account.id }, data: { cash: def.capital, initial_capital: def.capital, updated_at: new Date() } }),
    ...(Math.abs(delta) > 0.005
      ? [
          prisma.trading_transactions.create({
            data: {
              account_id: account.id,
              kind: delta > 0 ? "aportación" : "retirada",
              amount: delta,
              description: `Ronda ${number}: empieza con ${def.capital} € (${delta > 0 ? "se reponen" : "se retiran"} ${Math.abs(delta).toFixed(2)} €)`,
              day: dayDate(madridDay()),
            },
          }),
        ]
      : []),
  ]);
  return prisma.trading_kamikaze_rounds.create({
    data: { agent: def.key, number, start_capital: def.capital, goal: def.capital * def.multiple, deadline: new Date(Date.now() + def.days * DAY), best_equity: def.capital },
  });
}

async function activeRound(def: KamikazeDef) {
  return (await prisma.trading_kamikaze_rounds.findFirst({ where: { agent: def.key, status: "en_curso" } })) ?? startRound(def);
}

async function snapshotEquity(accountId: string, equity: number, cash: number, invested: number) {
  const day = dayDate(madridDay());
  await prisma.trading_equity.upsert({
    where: { account_id_day: { account_id: accountId, day } },
    create: { account_id: accountId, day, equity, cash, invested },
    update: { equity, cash, invested },
  });
}

// ---------------------------------------------------------------------------
// Ciclo
// ---------------------------------------------------------------------------
let running: Promise<KamikazeTickSummary> | null = null;
let lastTick = 0;

export type KamikazeTickSummary = { agents: { key: string; actions: string[] }[]; skipped?: string };

/** Revisión de FARO y de los kamikazes. `force`: análisis de FARO ya y ese kamikaze busca idea sin pausa. */
export function kamikazeTick(opts: { force?: string } = {}): Promise<KamikazeTickSummary> {
  if (running) return running;
  if (!opts.force && Date.now() - lastTick < TICK_GAP_MS) return Promise.resolve({ agents: [], skipped: "reciente" });
  lastTick = Date.now();
  running = tick(opts.force ?? null).finally(() => {
    running = null;
  });
  return running;
}

async function tick(force: string | null): Promise<KamikazeTickSummary> {
  const out: KamikazeTickSummary = { agents: KAMIKAZES.map((k) => ({ key: k.key, actions: [] as string[] })) };
  const rules = await eurPairs();
  const market: Ticker[] = await tickers();
  // FARO primero: puntúa sus ideas y, si toca, publica nuevas (una sola llamada a la IA para todos).
  const faro = await faroTick(market, rules, { force: !!force });
  if (faro.ran) out.agents.forEach((a) => a.actions.push(`FARO: ${faro.ran}`));
  const board = await boardIdeas();
  const priceOf = (pair: string) => market.find((t) => t.pair === pair)?.price ?? null;
  await Promise.all(KAMIKAZES.map((def, i) => one(def, out.agents[i].actions)));
  return out;

  async function one(def: KamikazeDef, actions: string[]) {
    const account = await ensureKamikaze(def);
    // Turno: evita que dos servidores muevan al mismo kamikaze a la vez.
    const got = await prisma.$executeRaw(Prisma.sql`UPDATE public.trading_accounts SET meeting_lease_until = now() + interval '3 minutes'
      WHERE id = ${account.id}::uuid AND (meeting_lease_until IS NULL OR meeting_lease_until < now())`);
    if (got !== 1) {
      actions.push("ocupado");
      return;
    }
    try {
      // Las posiciones anteriores también dejan de caducar por el plazo de la ronda.
      await prisma.trading_positions.updateMany({
        where: { account_id: account.id, status: { in: ["abierta", "pendiente"] }, max_hold_until: { not: null } },
        data: { max_hold_until: null },
      });
      let round = await activeRound(def);

      // 1) Vigilancia sin IA.
      let state = await accountState(WS, def.key);
      let pos = state.positions.find((p) => p.status === "abierta") ?? null;
      let price: number | null = null;
      if (pos) {
        price = await priceEur(pairFor(pos.symbol, rules));
        if (price) {
          const inst = await prisma.market_instruments.findUnique({ where: { symbol: pos.symbol }, select: { id: true } });
          if (inst) await setLive(inst.id, price);
          const hit = exitNow({ stop: pos.stop, target: pos.target }, price);
          if (hit) {
            await closePosition(WS, pos.id, def.key, hit === "stop" ? "stop" : "objetivo");
            const lost = (price - (pos.entryPrice ?? price)) < 0;
            round = await prisma.trading_kamikaze_rounds.update({
              where: { id: round.id },
              data: { trades: { increment: 1 }, ...(lost ? { cooldown_until: new Date(Date.now() + COOLDOWN_MIN() * 60_000) } : {}) },
            });
            actions.push(`${pos.symbol}: ${hit}`);
          } else {
            const stop = protectedStop({ entry: pos.entryPrice ?? price, stop: pos.stop }, price);
            if (stop !== pos.stop) {
              await prisma.trading_positions.update({ where: { id: pos.id }, data: { stop, updated_at: new Date() } });
              actions.push(`${pos.symbol}: stop a la entrada`);
            }
          }
        }
        state = await accountState(WS, def.key);
        pos = state.positions.find((p) => p.status === "abierta") ?? null;
      }
      const s = state.summary;
      await snapshotEquity(account.id, s.equity, s.cash, s.invested);
      if (s.equity > (round.best_equity ?? 0)) round = await prisma.trading_kamikaze_rounds.update({ where: { id: round.id }, data: { best_equity: s.equity } });

      // 2) ¿Termina la ronda?
      const end = roundOutcome({ equity: s.equity, goal: round.goal, holding: !!pos, cash: s.available, minOrder: MIN_ORDER });
      if (end) {
        if (pos) await closePosition(WS, pos.id, def.key, end === "meta" ? "meta de la ronda" : "sin capital");
        const after = (await accountState(WS, def.key)).summary.equity;
        await prisma.trading_kamikaze_rounds.update({ where: { id: round.id }, data: { status: end, end_equity: after, ended_at: new Date() } });
        actions.push(`ronda ${round.number}: ${end} con ${after.toFixed(2)} €`);
        await startRound(def);
        return;
      }

      // 3) Sin posición: la mejor idea viva de su estilo en el tablón de FARO.
      if (pos) return;
      if (force !== def.key && round.cooldown_until && round.cooldown_until.getTime() > Date.now()) return;
      // Una idea solo se toma una vez por ronda.
      const mine = await prisma.trading_positions.findMany({ where: { account_id: account.id, signal_key: { startsWith: "faro:", endsWith: `:${round.id}` } }, select: { signal_key: true } });
      const taken = new Set(mine.map((p) => p.signal_key?.split(":")[1] ?? ""));
      const pick = pickIdea(def.style, board, priceOf, Date.now(), taken);
      if (!pick) return;
      actions.push(await takeIdea(def, round, pick));
    } catch (e) {
      actions.push(`error: ${e instanceof Error ? e.message.slice(0, 160) : "desconocido"}`);
      console.error("[kamikaze]", def.key, e);
    } finally {
      await prisma.trading_accounts.update({ where: { id: account.id }, data: { meeting_lease_until: null } }).catch(() => undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// Tomar una idea de FARO
// ---------------------------------------------------------------------------
type Pick = { idea: BoardIdea & { symbol: string; rationale: string; runId: string | null }; price: number; stop: number; target: number };

async function takeIdea(def: KamikazeDef, round: trading_kamikaze_rounds, pick: Pick) {
  const state = await accountState(WS, def.key);
  const { idea } = pick;
  const px = (await priceEur(idea.pair)) ?? pick.price;
  const inst = await prisma.market_instruments.findUnique({ where: { symbol: idea.symbol }, select: { id: true } });
  if (inst) await setLive(inst.id, px);
  const quantity = allInQuantity(state.summary.available, px, costOf(state.account));
  const view = await lastMarketView();
  const run = await prisma.trading_committee_runs.create({
    data: { workspace_id: WS, agent: def.key, as_of: dayDate(madridDay()), status: "ok", market_view: view?.marketView ?? null, context: { faro: idea.id } as Prisma.InputJsonValue },
  });
  let status = "ejecutada";
  let rejection: string | null = null;
  let positionId: string | null = null;
  try {
    const placed = await placeOrder(
      WS,
      null,
      {
        symbol: idea.symbol,
        direction: "long",
        quantity,
        stop: pick.stop,
        target: pick.target,
        execution: "now",
        maxHoldDays: null,
        notes: `${def.name} toma una idea de ${idea.kind}: ${idea.rationale}`,
        source: "agente",
        signalKey: `faro:${idea.id}:${def.key}:${round.id}`,
      },
      def.key,
    );
    positionId = placed.id;
    await prisma.trading_kamikaze_rounds.update({ where: { id: round.id }, data: { trades: { increment: 1 }, last_decision_at: new Date(), last_decision_price: px } });
  } catch (e) {
    status = "descartada";
    rejection = `No se pudo ejecutar: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`;
  }
  await prisma.trading_proposals.create({
    data: {
      run_id: run.id,
      workspace_id: WS,
      agent: def.key,
      symbol: idea.symbol,
      name: idea.symbol.replace(/-EUR$/, ""),
      market: "crypto",
      action: "comprar",
      conviction: idea.conviction,
      horizon_days: 1,
      price: px,
      stop: pick.stop,
      target: pick.target,
      quantity,
      rationale: idea.rationale,
      risks: null,
      status,
      rejection,
      position_id: positionId,
      decided_at: new Date(),
    },
  });
  return `compra ${idea.symbol} (idea de ${idea.kind})${rejection ? ` (${rejection})` : ""}`;
}

// ---------------------------------------------------------------------------
// Para la interfaz y las acciones manuales
// ---------------------------------------------------------------------------
export async function kamikazeView(key: string) {
  const def = kamikazeByKey(key);
  if (!def) return null;
  const rounds = await prisma.trading_kamikaze_rounds.findMany({ where: { agent: key }, orderBy: { number: "desc" }, take: 30 });
  const current = rounds.find((r) => r.status === "en_curso") ?? null;
  const done = rounds.filter((r) => r.status !== "en_curso");
  const view = (r: trading_kamikaze_rounds) => ({
    number: r.number,
    status: r.status as "en_curso" | "meta" | "plazo" | "arruinado",
    startCapital: r.start_capital,
    goal: r.goal,
    startedAt: r.started_at.toISOString(),
    deadline: r.deadline.toISOString(),
    endedAt: r.ended_at?.toISOString() ?? null,
    endEquity: r.end_equity,
    bestEquity: r.best_equity,
    trades: r.trades,
    lastDecisionAt: r.last_decision_at?.toISOString() ?? null,
    cooldownUntil: r.cooldown_until?.toISOString() ?? null,
  });
  const invested = done.reduce((s, r) => s + r.start_capital, 0);
  const returned = done.reduce((s, r) => s + (r.end_equity ?? 0), 0);
  return {
    multiple: def.multiple,
    days: def.days,
    style: def.style,
    capital: def.capital,
    current: current ? view(current) : null,
    history: done.map(view),
    stats: { rounds: done.length, goals: done.filter((r) => r.status === "meta").length, busted: done.filter((r) => r.status === "arruinado").length, net: returned - invested },
  };
}

/** «Reunir ahora» de un kamikaze: análisis de FARO ya y, si hay idea de su estilo, entra. */
export async function runKamikazeNow(key: string) {
  const r = await kamikazeTick({ force: key });
  const a = r.agents.find((x) => x.key === key);
  return { id: key, auto: (a?.actions ?? []).map((detail) => ({ symbol: key, ok: !detail.startsWith("error") && !detail.startsWith("IA:"), detail })) };
}

/** Reinicia un kamikaze: borra sus rondas y su cartera; la siguiente revisión empieza la ronda 1. */
export async function resetKamikaze(key: string) {
  const def = kamikazeByKey(key);
  if (!def) throw new Error("Agente desconocido");
  const account = await ensureKamikaze(def);
  await prisma.$transaction([
    prisma.trading_positions.deleteMany({ where: { account_id: account.id } }),
    prisma.trading_transactions.deleteMany({ where: { account_id: account.id } }),
    prisma.trading_equity.deleteMany({ where: { account_id: account.id } }),
    prisma.trading_kamikaze_rounds.deleteMany({ where: { agent: key } }),
    prisma.trading_accounts.update({ where: { id: account.id }, data: { cash: def.capital, initial_capital: def.capital, ...def.settings, created_at: new Date(), updated_at: new Date() } }),
  ]);
}
