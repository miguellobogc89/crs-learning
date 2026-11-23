// lib/trading/kamikaze/engine.ts
// Motor de los agentes que toman las ideas de FARO. Cada pocos minutos (cuando alguien usa el módulo o
// lo pide el cron):
//   1) vigilancia sin IA: precio al momento de Binance, stop y objetivo, protección del stop;
//   2) con hueco libre (sus operaciones a la vez), toma la mejor idea publicada de su estilo (solo las
//      que deja pasar el filtro de FARO; ninguna IA propia). Las salidas son reglas: stop, objetivo y
//      stop protegido a partir de +30 %.
// Sin rondas ni metas: una fila de estado por agente (trading_kamikaze_rounds, número 1) guarda la pausa
// tras una pérdida y la última nota.
// Opera en su cartera virtual de siempre (accounts.ts): mismas órdenes, mismos costes.
import "server-only";
import { Prisma, type trading_kamikaze_rounds } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accountState, closePosition, costOf, ensureAccount, madridDay, placeOrder } from "../accounts";
import { AGENTS_WORKSPACE } from "../agents/roster";
import { ensureFresh } from "../agents/restart";
import { runMirrors } from "../mirror/service";
import { dayDate } from "../sync";
import { boardIdeas, faroTick, lastMarketView, noiseScan, setLive } from "../faro/engine";
import { chooseIdea, trailingStop, type BoardIdea } from "../faro/logic";
import { allInQuantity, exitNow, noiseLevels, noiseStop, positionBudget, protectedStop, type Ticker } from "./logic";
import { dailyCloses, eurPairs, hourly, hourlyN, priceEur, tickers } from "./market";
import { KAMIKAZES, kamikazeByKey, type KamikazeDef } from "./roster";
import { CARTA, isCartaKind, noiseIdea, refuerzoStop } from "../carta";
import { attackDays } from "../lab/swarm";
import { AVALANCHA, crashIdea } from "./avalancha";
import { REBOTE, bounceShortIdea } from "./rebote";
import { krakenCopyTurn } from "../kraken-copy";

const WS = AGENTS_WORKSPACE;
const DAY = 86_400_000;
const env = (k: string, d: number) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const COOLDOWN_MIN = () => env("TRADING_KAMIKAZE_COOLDOWN_MINUTES", 30);
const TICK_GAP_MS = 2 * 60_000;
const HOUR = 3_600_000;
/** Tras un stop, no vuelve a la misma moneda en estas horas. */
const NO_REENTRY_HOURS = () => env("TRADING_NO_REENTRY_HOURS", 12);
/** Un tipo se apaga solo si, con al menos estas ideas cerradas, pierde de media. */
const SHUTOFF_MIN_IDEAS = 50;
const REFUERZO_TAG = ":refuerzo";
/** Id de la idea de FARO de una posición (signal_key «faro:<idea>:<agente>:<fila>[:refuerzo]»). */
const ideaIdOf = (key: string | null) => (key?.startsWith("faro:") ? key.split(":")[1] : null);

const ensureKamikaze = (def: KamikazeDef) => ensureAccount(WS, def.key, { name: def.name, capital: def.capital, settings: def.settings });
/** Par de Binance de un valor de CRS: el de euros si existe; si no, el de USDC. */
const pairFor = (symbol: string, rules: Map<string, unknown>) => {
  const base = symbol.replace(/-EUR$/, "");
  return rules.has(`${base}EUR`) ? `${base}EUR` : `${base}USDC`;
};

// ---------------------------------------------------------------------------
// Estado (sin rondas)
// ---------------------------------------------------------------------------
/** Cuenta del agente; si cambió su capital, lo anterior se archiva y empieza de cero (agents/restart). */
const freshAccount = (def: KamikazeDef) => ensureFresh(def.key, { name: def.name, capital: def.capital, settings: def.settings });

/** Fila de estado del agente (pausa tras pérdida, última nota). Una sola, que no termina. */
async function stateRow(def: KamikazeDef) {
  const found = await prisma.trading_kamikaze_rounds.findFirst({ where: { agent: def.key, status: "en_curso" } });
  if (found) return found;
  return prisma.trading_kamikaze_rounds.create({
    data: { agent: def.key, number: 1, start_capital: def.capital, goal: def.capital * 1000, deadline: new Date(Date.now() + 3650 * DAY), best_equity: def.capital },
  });
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
  // Escáner de ruido en cada revisión (no espera al análisis de FARO): es de poco recorrido y rota rápido.
  const noise = await noiseScan(market, rules).catch((e) => {
    console.error("[agentes] escáner de ruido", e instanceof Error ? e.message.slice(0, 200) : e);
    return 0;
  });
  if (noise) out.agents.forEach((a) => a.actions.push(`Escáner de ruido: ${noise} nuevas`));
  // Solo lo que publica FARO (su filtro ya ha quitado las descartadas), y solo crypto: estos agentes
  // vigilan y operan con precios de Binance. Las ideas de acciones de EE. UU. aún no las toma ninguno.
  const off = await kindsOff();
  if (off.length) out.agents.forEach((a) => a.actions.push(`Tipos apagados por perder de media: ${off.join(", ")}`));
  const board = (await boardIdeas()).filter((i) => i.market === "crypto" && !off.includes(i.kind));
  const priceOf = (pair: string) => market.find((t) => t.pair === pair)?.price ?? null;
  await Promise.all(KAMIKAZES.map((def, i) => one(def, out.agents[i].actions)));
  // Copia con dinero real en Kraken Futures del agente de cortos elegido (si está habilitado el dinero real).
  const copied = await krakenCopyTurn().catch((e) => {
    console.error("[agentes] copia en Kraken", e instanceof Error ? e.message.slice(0, 200) : e);
    return [];
  });
  for (const c of copied) out.agents.find((a) => a.key === c.agent)?.actions.push(c.text);
  // Copia al instante: si un agente ha comprado o vendido, sus copias en tu exchange lo repiten ya,
  // sin esperar a la siguiente pasada del cron.
  const moved = out.agents.filter((a) => a.actions.some((x) => x.startsWith("Entró") || x.startsWith("Refuerza") || / (stop|objetivo)$/.test(x) || /: tiempo/.test(x))).map((a) => a.key);
  if (moved.length) {
    const r = await runMirrors({ agents: moved }).catch((e) => ({ mirrors: 0, actions: [`copias: error (${e instanceof Error ? e.message.slice(0, 120) : e})`] }));
    for (const a of out.agents) if (moved.includes(a.key)) a.actions.push(...r.actions.filter((x) => x.startsWith(`${a.key} `) || x.startsWith("copias")));
  }
  return out;

  async function one(def: KamikazeDef, actions: string[]) {
    const account = await freshAccount(def);
    // Turno: evita que dos servidores muevan al mismo agente a la vez.
    const got = await prisma.$executeRaw(Prisma.sql`UPDATE public.trading_accounts SET meeting_lease_until = now() + interval '3 minutes'
      WHERE id = ${account.id}::uuid AND (meeting_lease_until IS NULL OR meeting_lease_until < now())`);
    if (got !== 1) {
      actions.push("ocupado");
      return;
    }
    try {
      if (def.engine === "enjambre-corto" || def.engine === "avalancha" || def.engine === "rebote") {
        await shortSwarmTurn(def, account.id, market, rules, actions);
        return;
      }
      let row = await stateRow(def);
      const slots = def.slots ?? 1;

      // 1) Vigilancia sin IA de cada posición abierta.
      let state = await accountState(WS, def.key);
      const keys = await signalKeys(account.id);
      const kinds = await ideaKinds([...keys.values()].map(ideaIdOf).filter((x): x is string => !!x));
      const kindOf = (posId: string) => kinds.get(ideaIdOf(keys.get(posId) ?? null) ?? "") ?? null;
      for (const pos of state.positions.filter((p) => p.status === "abierta")) {
        const price = await priceEur(pairFor(pos.symbol, rules));
        if (!price) continue;
        const inst = await prisma.market_instruments.findUnique({ where: { symbol: pos.symbol }, select: { id: true } });
        if (inst) await setLive(inst.id, price);
        const hit = exitNow({ stop: pos.stop, target: pos.target }, price);
        if (hit) {
          await closePosition(WS, pos.id, def.key, hit === "stop" ? "stop" : "objetivo");
          const lost = price - (pos.entryPrice ?? price) < 0;
          row = await prisma.trading_kamikaze_rounds.update({
            where: { id: row.id },
            data: { trades: { increment: 1 }, ...(lost ? { cooldown_until: new Date(Date.now() + COOLDOWN_MIN() * 60_000) } : {}) },
          });
          actions.push(`${pos.symbol}: ${hit}`);
          continue;
        }
        const entry = pos.entryPrice ?? price;
        const kind = kindOf(pos.id);
        const card = kind && isCartaKind(kind) ? CARTA[kind] : null;
        const ageH = (Date.now() - new Date(pos.createdAt).getTime()) / HOUR;
        // Plazo máximo de su tipo (carta): el dinero parado también cuesta.
        if (card?.maxHoldHours && ageH >= card.maxHoldHours) {
          await closePosition(WS, pos.id, def.key, "tiempo");
          row = await prisma.trading_kamikaze_rounds.update({ where: { id: row.id }, data: { trades: { increment: 1 } } });
          actions.push(`${pos.symbol}: tiempo (${card.maxHoldHours} h)`);
          continue;
        }
        // Refuerzo: pronto y ganando, compra otra vez lo mismo y sube el stop para no arriesgar más que al principio.
        const isExtra = (keys.get(pos.id) ?? "").endsWith(REFUERZO_TAG);
        if (def.refuerzo && card?.refuerzo && !isExtra && ageH <= (card.refuerzoHours ?? 0) && ((price - entry) / entry) * 100 >= (card.refuerzoGainPct ?? Infinity)) {
          const done = await reinforce(def, account.id, pos, price, keys.get(pos.id) ?? null);
          if (done) {
            actions.push(done);
            continue;
          }
        }
        let stop = protectedStop({ entry, stop: pos.stop }, price);
        // Tendencia larga: deja correr con un stop que sube con el precio.
        if (def.exitMode === "trail" || kind === "tendencia") stop = Math.max(stop, trailingStop({ entry, initialStop: pos.initialStop, stop: pos.stop }, price));
        if (def.exitMode === "noise") stop = Math.max(stop, noiseStop({ entry, stop: pos.stop }, price));
        if (stop > pos.stop) {
          await prisma.trading_positions.update({ where: { id: pos.id }, data: { stop, updated_at: new Date() } });
          actions.push(`${pos.symbol}: stop sube a ${stop.toFixed(4)}`);
        }
      }
      state = await accountState(WS, def.key);
      const s = state.summary;
      await snapshotEquity(account.id, s.equity, s.cash, s.invested);
      if (s.equity > (row.best_equity ?? 0)) row = await prisma.trading_kamikaze_rounds.update({ where: { id: row.id }, data: { best_equity: s.equity } });

      // 2) Huecos libres: la mejor idea publicada de su estilo. Si no entra, deja dicho por qué.
      const note = (text: string | null) => prisma.trading_kamikaze_rounds.update({ where: { id: row.id }, data: { last_note: text, last_note_at: new Date() } });
      const keysNow = await signalKeys(account.id);
      const open = state.positions.filter((p) => (p.status === "abierta" || p.status === "pendiente") && !(keysNow.get(p.id) ?? "").endsWith(REFUERZO_TAG));
      if (open.length >= slots) {
        if (row.last_note) await note(null);
        return;
      }
      if (force !== def.key && row.cooldown_until && row.cooldown_until.getTime() > Date.now()) {
        const until = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(row.cooldown_until);
        await note(`En pausa tras una pérdida hasta las ${until}`);
        return;
      }
      // Una idea solo se toma una vez, y nunca dos operaciones en la misma moneda.
      const mine = await prisma.trading_positions.findMany({ where: { account_id: account.id, signal_key: { startsWith: "faro:" } }, select: { signal_key: true } });
      const taken = new Set<string>(mine.map((p) => p.signal_key?.split(":")[1] ?? ""));
      const held = new Set(open.map((p) => p.symbol));
      // Tras un stop, esa moneda descansa unas horas.
      const stopped = await prisma.trading_positions.findMany({
        where: { account_id: account.id, exit_reason: "stop", updated_at: { gte: new Date(Date.now() - NO_REENTRY_HOURS() * HOUR) } },
        select: { symbol: true },
      });
      for (const p of stopped) held.add(p.symbol);
      let free = slots - open.length;
      let last: string | null = null;
      while (free > 0) {
        const mineBoard = board.filter((i) => !held.has(i.symbol) && (!def.coins || def.coins.includes(i.symbol.replace(/-EUR$/, ""))));
        const choice = chooseIdea(def.style, mineBoard, priceOf, Date.now(), taken, {
          maxChasePct: def.maxChasePct,
          stopMode: def.stopMode,
          minConviction: def.minConviction,
          kinds: def.kinds,
          ideaLevels: !!def.kinds,
        });
        if ("reason" in choice) {
          // Si ya entró en algo en esta revisión, la nota es esa entrada; si no, por qué no entra.
          if (!last) last = choice.reason;
          break;
        }
        const done = await takeIdea(def, row, choice.pick, slots);
        taken.add(choice.pick.idea.id);
        held.add(choice.pick.idea.symbol);
        actions.push(done);
        last = done;
        free--;
      }
      await note(last);
    } catch (e) {
      actions.push(`error: ${e instanceof Error ? e.message.slice(0, 160) : "desconocido"}`);
      console.error("[agentes de FARO]", def.key, e);
    } finally {
      await prisma.trading_accounts.update({ where: { id: account.id }, data: { meeting_lease_until: null } }).catch(() => undefined);
    }
  }
}

/**
 * ENJAMBRE (cortos): la regla probada en el laboratorio (lib/trading/lab/swarm.ts, side «short»).
 *  - Cada revisión (5 min): stop de cada corto; si no salta, baja detrás del precio a medio rango.
 *  - Una vez por hora y solo en defensa (Detector B con Bitcoin diario): en las monedas grandes que llevan 24 h
 *    de lado en un rango estrecho y ya están en su parte baja, abre un corto con un 10 % del dinero (hasta 10).
 *    Stop inicial a mitad del rango; sin objetivo ni límite de tiempo.
 */
async function shortSwarmTurn(def: KamikazeDef, accountId: string, market: Ticker[], rules: Map<string, unknown>, actions: string[]) {
  await prisma.trading_accounts.updateMany({ where: { id: accountId, allow_short: false }, data: { allow_short: true } });
  let row = await stateRow(def);
  const note = (text: string | null) => prisma.trading_kamikaze_rounds.update({ where: { id: row.id }, data: { last_note: text, last_note_at: new Date() } });
  // 1) Vigilancia.
  let state = await accountState(WS, def.key);
  for (const pos of state.positions.filter((p) => p.status === "abierta" && p.direction === "short")) {
    const price = await priceEur(pairFor(pos.symbol, rules));
    if (!price) continue;
    const inst = await prisma.market_instruments.findUnique({ where: { symbol: pos.symbol }, select: { id: true } });
    if (inst) await setLive(inst.id, price);
    if (price >= pos.stop) {
      await closePosition(WS, pos.id, def.key, "stop");
      actions.push(`${pos.symbol}: stop`);
      continue;
    }
    const trail = Number((await prisma.trading_positions.findUnique({ where: { id: pos.id }, select: { signal_key: true } }))?.signal_key?.split(":")[2]);
    if (trail > 0 && price + trail < pos.stop) {
      await prisma.trading_positions.update({ where: { id: pos.id }, data: { stop: price + trail, updated_at: new Date() } });
      actions.push(`${pos.symbol}: stop baja a ${(price + trail).toFixed(4)}`);
    }
  }
  state = await accountState(WS, def.key);
  await snapshotEquity(accountId, state.summary.equity, state.summary.cash, state.summary.invested);
  // 2) Escaneo, una vez por hora.
  if (row.last_decision_at && Math.floor(row.last_decision_at.getTime() / HOUR) === Math.floor(Date.now() / HOUR)) return;
  row = await prisma.trading_kamikaze_rounds.update({ where: { id: row.id }, data: { last_decision_at: new Date() } });
  if (def.engine === "avalancha") return crashScan(def, state, market, rules, actions, note);
  const btcPair = market.find((t) => t.base === "BTC" && t.pair.endsWith("EUR"))?.pair ?? "BTCEUR";
  const phase = attackDays(await dailyCloses(btcPair, 240)).get(new Date().toISOString().slice(0, 10));
  if (phase !== false) {
    await note(phase ? "Mercado en ataque: no abre cortos (espera a que el mercado pase a defensa)" : "Sin datos de la fase del mercado");
    return;
  }
  if (def.engine === "rebote") return reboteScan(def, state, market, actions, note);
  const open = state.positions.filter((p) => p.status === "abierta" || p.status === "pendiente");
  let free = (def.slots ?? 10) - open.length;
  if (free <= 0) return note(null).then(() => undefined);
  const held = new Set(open.map((p) => p.symbol.replace(/-EUR$/, "")));
  const pool = market
    .filter((t) => def.coins?.includes(t.base) && !held.has(t.base) && t.price > 0)
    .filter((t, i, all) => all.findIndex((x) => x.base === t.base) === i)
    .sort((a, b) => b.volume24h - a.volume24h);
  const entered: string[] = [];
  for (const t of pool) {
    if (free <= 0) break;
    // Las 24 velas de 1 h ya cerradas.
    const bars = (await hourly(t.pair).catch(() => [])).slice(-25, -1);
    const px = (await priceEur(t.pair).catch(() => null)) ?? null;
    if (!px) continue;
    const r = noiseIdea(bars, px);
    if (!r || r.entry < px) continue; // no está en la parte baja de un rango
    const w = (r.target - r.invalidation) / 1.1;
    const lo = r.invalidation + 0.3 * w;
    const stop = lo + 0.5 * w;
    const st = await accountState(WS, def.key);
    const budget = Math.min(st.summary.available, st.summary.equity * ((def.sizeOfEquityPct ?? 10) / 100));
    if (budget < 10) break;
    const symbol = `${t.base}-EUR`;
    // Con apalancamiento, el corto es `leverage` veces el margen (el 10 % de su dinero).
    const quantity = allInQuantity(budget * (def.leverage ?? 1), px, costOf(st.account));
    const inst = await prisma.market_instruments.findUnique({ where: { symbol }, select: { id: true } });
    if (inst) await setLive(inst.id, px);
    try {
      await placeOrder(
        WS,
        null,
        {
          symbol,
          direction: "short",
          quantity,
          stop,
          target: px * 0.5,
          execution: "now",
          maxHoldDays: null,
          notes: `${def.name}: ${t.base} pierde el suelo de su rango de 24 h (${r.width.toFixed(1).replace(".", ",")} %) con el mercado en defensa. Corto${(def.leverage ?? 1) > 1 ? ` x${def.leverage}` : ""} con stop a mitad del rango que baja detrás del precio.`,
          source: "agente",
          // Distancia del stop que baja detrás del precio: medio rango (la lee la vigilancia).
          signalKey: `enjambre:${t.base}:${(0.5 * w).toPrecision(6)}:${Date.now()}`,
        },
        def.key,
      );
      entered.push(t.base);
      free--;
    } catch (e) {
      actions.push(`${t.base}: no pudo abrir (${e instanceof Error ? e.message.slice(0, 100) : "error"})`);
    }
  }
  if (entered.length) actions.push(`Entró en corto en ${entered.join(", ")}`);
  await note(entered.length ? `Abre cortos en ${entered.join(", ")}` : "En defensa, pero ninguna moneda grande está ahora en la parte baja de un rango");
}

/**
 * AVALANCHA: escaneo de cada hora (la vigilancia de los stops es la del ENJAMBRE). Regla en ./avalancha.ts, la misma
 * que simula el laboratorio. En cualquier fase del mercado.
 */
async function reboteScan(
  def: KamikazeDef,
  state: Awaited<ReturnType<typeof accountState>>,
  market: Ticker[],
  actions: string[],
  note: (text: string | null) => Promise<unknown>,
) {
  const open = state.positions.filter((p) => p.status === "abierta" || p.status === "pendiente");
  let free = (def.slots ?? 10) - open.length;
  if (free <= 0) return void (await note(null));
  const held = new Set(open.map((p) => p.symbol.replace(/-EUR$/, "")));
  // Pausa por moneda: no vuelve a una en la que acaba de cerrar un corto.
  const recent = await prisma.trading_positions.findMany({
    where: { account_id: state.account.id, status: "cerrada", updated_at: { gte: new Date(Date.now() - REBOTE.cooldownHours * HOUR) } },
    select: { symbol: true },
  });
  const cooling = new Set(recent.map((p) => p.symbol.replace(/-EUR$/, "")));
  const pool = market
    .filter((t) => def.coins?.includes(t.base) && !held.has(t.base) && !cooling.has(t.base) && t.price > 0)
    .filter((t, i, all) => all.findIndex((x) => x.base === t.base) === i)
    .sort((a, b) => b.volume24h - a.volume24h);
  const entered: string[] = [];
  for (const t of pool) {
    if (free <= 0) break;
    // 20 días de velas de 1 h ya cerradas (la de ahora, sin terminar, fuera).
    const bars = (await hourlyN(t.pair, REBOTE.maPeriod + 2).catch(() => [])).slice(0, -1);
    const r = bounceShortIdea(bars);
    if (!r) continue;
    const px = (await priceEur(t.pair).catch(() => null)) ?? null;
    // Si desde el cierre de la hora ya ha vuelto por encima del stop, el rebote sigue: no entra.
    if (!px || px >= r.stop) continue;
    const st = await accountState(WS, def.key);
    const budget = Math.min(st.summary.available, st.summary.equity * ((def.sizeOfEquityPct ?? 10) / 100));
    if (budget < 10) break;
    const symbol = `${t.base}-EUR`;
    const quantity = allInQuantity(budget * (def.leverage ?? 1), px, costOf(st.account));
    const inst = await prisma.market_instruments.findUnique({ where: { symbol }, select: { id: true } });
    if (inst) await setLive(inst.id, px);
    try {
      await placeOrder(
        WS,
        null,
        {
          symbol,
          direction: "short",
          quantity,
          stop: r.stop,
          target: px * 0.5,
          execution: "now",
          maxHoldDays: null,
          notes: `${def.name}: ${t.base} rebota un ${r.bouncePct.toFixed(1).replace(".", ",")} % dentro de su caída (por debajo de su media de 20 días) y se gira. Corto${(def.leverage ?? 1) > 1 ? ` x${def.leverage}` : ""} con el stop justo encima del rebote, que baja detrás del precio.`,
          source: "agente",
          // Distancia del stop que baja detrás del precio: el riesgo inicial (la lee la vigilancia).
          signalKey: `rebote:${t.base}:${r.risk.toPrecision(6)}:${Date.now()}`,
        },
        def.key,
      );
      entered.push(t.base);
      free--;
    } catch (e) {
      actions.push(`${t.base}: no pudo abrir (${e instanceof Error ? e.message.slice(0, 100) : "error"})`);
    }
  }
  if (entered.length) actions.push(`Entró en corto en ${entered.join(", ")}`);
  await note(entered.length ? `Abre cortos en ${entered.join(", ")}` : "En defensa, pero ninguna moneda grande está ahora girándose tras un rebote");
}

async function crashScan(
  def: KamikazeDef,
  state: Awaited<ReturnType<typeof accountState>>,
  market: Ticker[],
  rules: Map<string, unknown>,
  actions: string[],
  note: (text: string | null) => Promise<unknown>,
) {
  const btc = market.filter((t) => t.base === "BTC").sort((a, b) => b.volume24h - a.volume24h)[0];
  const btc24 = btc ? btc.ch24h : null;
  if (btc24 === null || btc24 > -AVALANCHA.btcDropPct) {
    await note(`Bitcoin ${btc24 === null ? "sin datos" : `${btc24 >= 0 ? "+" : ""}${btc24.toFixed(1).replace(".", ",")} % en 24 h`}: no hay caída del mercado`);
    return;
  }
  const open = state.positions.filter((p) => p.status === "abierta" || p.status === "pendiente");
  let free = (def.slots ?? 10) - open.length;
  if (free <= 0) return void (await note(null));
  const held = new Set(open.map((p) => p.symbol.replace(/-EUR$/, "")));
  // Pausa por moneda: no vuelve a una en la que acaba de cerrar un corto.
  const recent = await prisma.trading_positions.findMany({
    where: { account_id: state.account.id, status: "cerrada", updated_at: { gte: new Date(Date.now() - AVALANCHA.cooldownHours * HOUR) } },
    select: { symbol: true },
  });
  const cooling = new Set(recent.map((p) => p.symbol.replace(/-EUR$/, "")));
  const pool = market
    .filter((t) => def.coins?.includes(t.base) && !held.has(t.base) && !cooling.has(t.base) && t.price > 0)
    .filter((t, i, all) => all.findIndex((x) => x.base === t.base) === i)
    .sort((a, b) => b.volume24h - a.volume24h);
  const entered: string[] = [];
  for (const t of pool) {
    if (free <= 0) break;
    // Las 25 velas de 1 h ya cerradas (la de ahora, sin terminar, fuera).
    const bars = (await hourly(t.pair).catch(() => [])).slice(-26, -1);
    const r = crashIdea(bars, btc24);
    if (!r) continue;
    const px = (await priceEur(t.pair).catch(() => null)) ?? null;
    // Si desde el cierre de la hora ya ha rebotado por encima del stop, la caída se ha frenado.
    if (!px || px >= r.stop) continue;
    const st = await accountState(WS, def.key);
    const budget = Math.min(st.summary.available, st.summary.equity * ((def.sizeOfEquityPct ?? 10) / 100));
    if (budget < 10) break;
    const symbol = `${t.base}-EUR`;
    const quantity = allInQuantity(budget * (def.leverage ?? 1), px, costOf(st.account));
    const inst = await prisma.market_instruments.findUnique({ where: { symbol }, select: { id: true } });
    if (inst) await setLive(inst.id, px);
    try {
      await placeOrder(
        WS,
        null,
        {
          symbol,
          direction: "short",
          quantity,
          stop: r.stop,
          target: px * 0.5,
          execution: "now",
          maxHoldDays: null,
          notes: `${def.name}: ${t.base} cae un ${r.dropPct.toFixed(1).replace(".", ",")} % en 24 h y marca mínimo nuevo, con Bitcoin ${btc24.toFixed(1).replace(".", ",")} %. Corto${(def.leverage ?? 1) > 1 ? ` x${def.leverage}` : ""} con stop que baja detrás del precio.`,
          source: "agente",
          // Distancia del stop que baja detrás del precio (la lee la vigilancia).
          signalKey: `avalancha:${t.base}:${r.trail.toPrecision(6)}:${Date.now()}`,
        },
        def.key,
      );
      entered.push(t.base);
      free--;
    } catch (e) {
      actions.push(`${t.base}: no pudo abrir (${e instanceof Error ? e.message.slice(0, 100) : "error"})`);
    }
  }
  if (entered.length) actions.push(`Entró en corto en ${entered.join(", ")}`);
  await note(entered.length ? `Abre cortos en ${entered.join(", ")}` : `Bitcoin ${btc24.toFixed(1).replace(".", ",")} % en 24 h, pero ninguna moneda grande está ahora en plena caída`);
}

/** signal_key de las posiciones del agente, por id. */
async function signalKeys(accountId: string) {
  const rows = await prisma.trading_positions.findMany({ where: { account_id: accountId, status: { in: ["abierta", "pendiente"] } }, select: { id: true, signal_key: true } });
  return new Map<string, string>(rows.map((r: { id: string; signal_key: string | null }) => [r.id, r.signal_key ?? ""]));
}

/** Tipo de cada idea de FARO, por id. */
async function ideaKinds(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await prisma.trading_faro_ideas.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, kind: true } });
  return new Map<string, string>(rows.map((r: { id: string; kind: string }) => [r.id, r.kind]));
}

/** Tipos que se apagan solos: con al menos 50 ideas cerradas, sus últimas 50 pierden de media. */
async function kindsOff(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ kind: string; n: bigint; avg: number | null }[]>(Prisma.sql`
    SELECT kind, count(*) AS n, avg(result_pct) AS avg FROM (
      SELECT kind, result_pct, row_number() OVER (PARTITION BY kind ORDER BY resolved_at DESC) AS rn
      FROM public.trading_faro_ideas WHERE status IN ('acierto','fallo','caducada') AND result_pct IS NOT NULL
    ) t WHERE rn <= ${SHUTOFF_MIN_IDEAS} GROUP BY kind`).catch(() => []);
  return rows.filter((r) => Number(r.n) >= SHUTOFF_MIN_IDEAS && (r.avg ?? 0) < 0).map((r) => r.kind);
}

/**
 * Refuerzo: compra lo mismo otra vez (como mucho lo de la primera compra) y sube el stop de las dos para
 * que, si salta, no pierda más de lo que arriesgaba al principio. Nunca para promediar a la baja.
 */
async function reinforce(def: KamikazeDef, accountId: string, pos: { id: string; symbol: string; quantity: number; entryPrice: number | null; stop: number; initialStop: number; target: number }, price: number, key: string | null) {
  if (!key) return null;
  const extraKey = `${key}${REFUERZO_TAG}`;
  if (await prisma.trading_positions.findFirst({ where: { account_id: accountId, signal_key: extraKey } })) return null;
  const state = await accountState(WS, def.key);
  const entry = pos.entryPrice ?? price;
  const q2 = Math.min(pos.quantity, (state.summary.available * 0.98) / price);
  if (!(q2 * price >= 10)) return null;
  const stop = refuerzoStop({ q1: pos.quantity, entry, stop: pos.initialStop, q2, price });
  if (stop === null) return null;
  await placeOrder(
    WS,
    null,
    { symbol: pos.symbol, direction: "long", quantity: q2, stop, target: pos.target, execution: "now", maxHoldDays: null, notes: `${def.name} refuerza: la idea se ha confirmado pronto`, source: "agente", signalKey: extraKey },
    def.key,
  );
  await prisma.trading_positions.update({ where: { id: pos.id }, data: { stop: Math.max(stop, pos.stop), updated_at: new Date() } });
  return `Refuerza ${pos.symbol.replace(/-EUR$/, "")} (stop a ${stop.toPrecision(5)})`;
}

// ---------------------------------------------------------------------------
// Tomar una idea de FARO
// ---------------------------------------------------------------------------
type Pick = { idea: BoardIdea & { symbol: string; rationale: string; runId: string | null }; price: number; stop: number; target: number };

async function takeIdea(def: KamikazeDef, round: trading_kamikaze_rounds, pick: Pick, slots: number) {
  const state = await accountState(WS, def.key);
  const { idea } = pick;
  const px = (await priceEur(idea.pair)) ?? pick.price;
  const inst = await prisma.market_instruments.findUnique({ where: { symbol: idea.symbol }, select: { id: true } });
  if (inst) await setLive(inst.id, px);
  // Salida «de ruido»: objetivo +3 % y stop cercano, en vez de los niveles de la idea.
  if (def.exitMode === "noise") Object.assign(pick, noiseLevels(px, pick.idea.invalidation));
  // Por operación: según su riesgo (lo que pierde si salta el stop), un % fijo o su capital ÷ operaciones.
  const budget = positionBudget({
    equity: state.summary.equity,
    available: state.summary.available,
    capital: def.capital,
    slots,
    price: px,
    stop: pick.stop,
    riskPct: def.riskPct,
    sizeOfEquityPct: def.sizeOfEquityPct,
  });
  if (budget < 10) return `No entra en ${idea.symbol.replace(/-EUR$/, "")}: le quedan menos de 10 € para esta operación`;
  const quantity = allInQuantity(budget, px, costOf(state.account));
  // «Corre»: sin objetivo de venta real y con stop que sube con el precio. Con `targetFraction`, vende antes.
  const target =
    def.exitMode === "trail"
      ? Math.max(pick.target, px * 10)
      : def.targetFraction
        ? px + Math.max(0, pick.target - px) * def.targetFraction
        : pick.target;
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
        target,
        execution: "now",
        maxHoldDays: null,
        notes: `${def.name} toma una idea de ${idea.kind}: ${idea.rationale}`,
        source: "agente",
        signalKey: `faro:${idea.id}:${def.key}:${round.id}`,
      },
      def.key,
    );
    positionId = placed.id;
    await prisma.trading_kamikaze_rounds.update({ where: { id: round.id }, data: { last_decision_at: new Date(), last_decision_price: px } });
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
      target,
      quantity,
      rationale: idea.rationale,
      risks: null,
      status,
      rejection,
      position_id: positionId,
      decided_at: new Date(),
    },
  });
  return rejection ? `No pudo entrar en ${idea.symbol}: ${rejection}` : `Entró en ${idea.symbol.replace(/-EUR$/, "")} (idea de ${idea.kind})`;
}

// ---------------------------------------------------------------------------
// Para la interfaz y las acciones manuales
// ---------------------------------------------------------------------------
export async function kamikazeView(key: string) {
  const def = kamikazeByKey(key);
  if (!def) return null;
  const row = await prisma.trading_kamikaze_rounds.findFirst({ where: { agent: key, status: "en_curso" } });
  return {
    style: def.style,
    capital: def.capital,
    slots: def.slots ?? 1,
    /** No vende en un objetivo: el stop va siguiendo al precio (el «objetivo» guardado es solo un tope técnico). */
    noTarget: def.engine === "enjambre-corto" || def.engine === "avalancha" || def.engine === "rebote",
    /** Qué está haciendo ahora (o por qué no entra) y si está en pausa tras una pérdida. */
    note: row?.last_note ?? null,
    noteAt: row?.last_note_at?.toISOString() ?? null,
    cooldownUntil: row?.cooldown_until?.toISOString() ?? null,
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
