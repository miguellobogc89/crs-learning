// lib/trading/kamikaze/engine.ts
// Motor de los kamikazes. Cada pocos minutos (cuando alguien usa el módulo o lo pide el cron):
//   1) vigilancia sin IA: precio al momento de Binance, stop y objetivo, protección del stop;
//   2) rondas: termina la ronda al llegar a la meta, al plazo o sin dinero, y empieza otra;
//   3) decisión con IA cuando toca (cada 30 min sin posición, cada 60 con ella o si el precio se
//      mueve mucho), con los candidatos de su estilo y datos de mercado de la última hora.
// Opera en su cartera virtual de siempre (accounts.ts): mismas órdenes, mismos costes.
import "server-only";
import { Prisma, type trading_kamikaze_rounds } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aiJson, aiModelInfo } from "../ai";
import { accountState, closePosition, costOf, ensureAccount, madridDay, placeOrder } from "../accounts";
import { AGENTS_WORKSPACE } from "../agents/roster";
import { CRYPTO, CRYPTO_MARKET } from "../market-data";
import { dayDate } from "../sync";
import { allInQuantity, checkDecision, decisionDue, exitNow, metricsOf, prefilter, protectedStop, rank, requiredDailyPct, roundOutcome, type AiDecision, type Metrics, type Ticker } from "./logic";
import { eurPairs, hourly, prices, symbolOf, tickers } from "./market";
import { KAMIKAZES, kamikazeByKey, type KamikazeDef } from "./roster";

const WS = AGENTS_WORKSPACE;
const DAY = 86_400_000;
/** Mínimo para una orden en un exchange (Binance pide ~5 € por orden en los pares en euros). */
const MIN_ORDER = 5;
const env = (k: string, d: number) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const IDLE_MIN = () => env("TRADING_KAMIKAZE_IDLE_MINUTES", 30);
const HOLD_MIN = () => env("TRADING_KAMIKAZE_HOLD_MINUTES", 60);
const COOLDOWN_MIN = 30;
const TICK_GAP_MS = 2 * 60_000;

const ensureKamikaze = (def: KamikazeDef) => ensureAccount(WS, def.key, { name: def.name, capital: def.capital, settings: def.settings });
const pairOf = (symbol: string) => symbol.replace(/-EUR$/, "") + "EUR";

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

// ---------------------------------------------------------------------------
// Precios: el de Binance pasa a ser el «precio en directo» del valor en CRS
// ---------------------------------------------------------------------------
async function ensureInstrument(symbol: string, base: string) {
  const known = CRYPTO.find((c) => c.symbol === symbol);
  return prisma.market_instruments.upsert({
    where: { symbol },
    create: { symbol, name: known?.name ?? base, sector: "Crypto", market: CRYPTO_MARKET, currency: "EUR", active: false },
    update: {},
  });
}

async function setLive(instrumentId: string, price: number) {
  const day = new Date(new Date().toISOString().slice(0, 10));
  await prisma.$executeRaw(Prisma.sql`UPDATE public.market_instruments SET
      live_open = CASE WHEN live_day = ${day}::date THEN COALESCE(live_open, ${price}) ELSE ${price} END,
      live_high = CASE WHEN live_day = ${day}::date THEN GREATEST(COALESCE(live_high, ${price}), ${price}) ELSE ${price} END,
      live_low = CASE WHEN live_day = ${day}::date THEN LEAST(COALESCE(live_low, ${price}), ${price}) ELSE ${price} END,
      live_price = ${price}, live_day = ${day}::date, live_at = now()
    WHERE id = ${instrumentId}::uuid`);
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

/** Revisión de los kamikazes. `force`: decide ya con IA (botón «Reunir»). */
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
  const out: KamikazeTickSummary = { agents: [] };
  const rules = await eurPairs();
  let market: Ticker[] | null = null;
  let aiUsed = false;
  for (const def of KAMIKAZES) {
    const actions: string[] = [];
    out.agents.push({ key: def.key, actions });
    const account = await ensureKamikaze(def);
    // Turno: evita que dos servidores muevan al mismo kamikaze a la vez.
    const got = await prisma.$executeRaw(Prisma.sql`UPDATE public.trading_accounts SET meeting_lease_until = now() + interval '3 minutes'
      WHERE id = ${account.id}::uuid AND (meeting_lease_until IS NULL OR meeting_lease_until < now())`);
    if (got !== 1) {
      actions.push("ocupado");
      continue;
    }
    try {
      let round = await activeRound(def);

      // 1) Vigilancia sin IA.
      let state = await accountState(WS, def.key);
      let pos = state.positions.find((p) => p.status === "abierta") ?? null;
      let price: number | null = null;
      if (pos) {
        const pair = pairOf(pos.symbol);
        price = (await prices([pair])).get(pair) ?? null;
        if (price) {
          const inst = await prisma.market_instruments.findUnique({ where: { symbol: pos.symbol }, select: { id: true } });
          if (inst) await setLive(inst.id, price);
          const hit = exitNow({ stop: pos.stop, target: pos.target }, price);
          if (hit) {
            await closePosition(WS, pos.id, def.key, hit === "stop" ? "stop" : "objetivo");
            const lost = (price - (pos.entryPrice ?? price)) < 0;
            round = await prisma.trading_kamikaze_rounds.update({
              where: { id: round.id },
              data: { trades: { increment: 1 }, ...(lost ? { cooldown_until: new Date(Date.now() + COOLDOWN_MIN * 60_000) } : {}) },
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
      const end = roundOutcome({ equity: s.equity, goal: round.goal, deadline: round.deadline.getTime(), now: Date.now(), holding: !!pos, cash: s.available, minOrder: MIN_ORDER });
      if (end) {
        if (pos) await closePosition(WS, pos.id, def.key, end === "meta" ? "meta de la ronda" : end === "plazo" ? "fin del plazo" : "sin capital");
        const after = (await accountState(WS, def.key)).summary.equity;
        await prisma.trading_kamikaze_rounds.update({ where: { id: round.id }, data: { status: end, end_equity: after, ended_at: new Date() } });
        actions.push(`ronda ${round.number}: ${end} con ${after.toFixed(2)} €`);
        await startRound(def);
        continue;
      }

      // 3) Decisión con IA (una por revisión, salvo que se pida a mano).
      const due =
        force === def.key ||
        (!force &&
          !aiUsed &&
          decisionDue({
            now: Date.now(),
            holding: !!pos,
            lastAt: round.last_decision_at?.getTime() ?? null,
            lastPrice: round.last_decision_price,
            price,
            cooldownUntil: round.cooldown_until?.getTime() ?? null,
            idleMin: IDLE_MIN(),
            holdMin: HOLD_MIN(),
          }));
      if (!due) continue;
      aiUsed = true;
      market ??= await tickers();
      const r = await decide(def, round, market, rules);
      actions.push(r);
    } catch (e) {
      actions.push(`error: ${e instanceof Error ? e.message.slice(0, 160) : "desconocido"}`);
      console.error("[kamikaze]", def.key, e);
    } finally {
      await prisma.trading_accounts.update({ where: { id: account.id }, data: { meeting_lease_until: null } }).catch(() => undefined);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Decisión con IA
// ---------------------------------------------------------------------------
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["market_view", "decision"],
  properties: {
    market_view: { type: "string", description: "Cómo ves ahora tus candidatos, en 1-2 frases." },
    decision: {
      type: "object",
      additionalProperties: false,
      required: ["action", "symbol", "conviction", "stop", "target", "rationale", "risks"],
      properties: {
        action: { type: "string", enum: ["comprar", "vender", "mantener", "esperar"] },
        symbol: { type: "string", description: "Par de Binance (p. ej. SOLEUR). Vacío si esperas." },
        conviction: { type: "integer", minimum: 1, maximum: 5 },
        stop: { type: "number", description: "Precio de stop en euros (0 si no aplica)." },
        target: { type: "number", description: "Precio objetivo en euros (0 si no aplica)." },
        rationale: { type: "string", description: "Por qué, en 2-3 frases. Puedes marcar lo clave con **negritas**." },
        risks: { type: "string" },
      },
    },
  },
} as const;

const STYLE_TEXT: Record<KamikazeDef["style"], string> = {
  impulso: "Los candidatos son las monedas en euros que más suben con volumen. Busca la que tenga el impulso más limpio y aún no agotado.",
  rupturas: "Los candidatos están cerca de sus máximos de 3 días con volumen al alza. Busca la ruptura con más fuerza o una noticia que pueda dispararla.",
  rebotes: "Los candidatos han caído con fuerza desde sus máximos de 3 días. Busca la que empieza a girarse (sube en la última hora) con volumen.",
};

async function decide(def: KamikazeDef, round: trading_kamikaze_rounds, market: Ticker[], rules: Awaited<ReturnType<typeof eurPairs>>) {
  const state = await accountState(WS, def.key);
  const s = state.summary;
  const pos = state.positions.find((p) => p.status === "abierta") ?? null;
  const holdingPair = pos ? pairOf(pos.symbol) : null;

  // Candidatos de su estilo: criba con el resumen de 24 h y detalle con velas horarias.
  const pre = prefilter(def.style, market, 15);
  if (holdingPair && !pre.some((t) => t.pair === holdingPair)) {
    const t = market.find((x) => x.pair === holdingPair);
    if (t) pre.push(t);
  }
  const detailed: Metrics[] = [];
  for (const t of pre) {
    try {
      detailed.push(metricsOf(t, await hourly(t.pair)));
    } catch {
      // Sin velas de este par: se queda fuera.
    }
  }
  const candidates = rank(def.style, detailed, 10);
  const holdingMetrics = holdingPair ? detailed.find((m) => m.pair === holdingPair) ?? null : null;
  const livePrice = (pair: string) => detailed.find((m) => m.pair === pair)?.price ?? market.find((m) => m.pair === pair)?.price ?? null;

  const bases = [...new Set([...candidates.map((c) => c.base), ...(pos ? [pos.symbol.replace(/-EUR$/, "")] : [])])];
  const news = await prisma.news_items.findMany({
    where: { status: "clasificada", relevant: true, published_at: { gte: new Date(Date.now() - DAY) }, symbols: { hasSome: [...bases, "CRYPTO"] } },
    orderBy: [{ impact: "desc" }, { published_at: "desc" }],
    take: 12,
    select: { title: true, summary: true, symbols: true, sentiment: true, impact: true, published_at: true },
  });

  const msLeft = round.deadline.getTime() - Date.now();
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const input = {
    ahora: new Date().toISOString(),
    ronda: {
      numero: round.number,
      capital_inicial: round.start_capital,
      patrimonio: r2(s.equity),
      efectivo: r2(s.available),
      meta: round.goal,
      dias_restantes: r2(msLeft / DAY),
      ritmo_diario_necesario_pct: r2(requiredDailyPct(s.equity, round.goal, msLeft)),
      operaciones: round.trades,
    },
    posicion: pos
      ? {
          par: holdingPair,
          entrada: pos.entryPrice,
          precio: holdingMetrics?.price ?? pos.lastPrice,
          resultado_pct: pos.entryPrice && pos.lastPrice ? r2(((pos.lastPrice - pos.entryPrice) / pos.entryPrice) * 100) : null,
          stop: pos.stop,
          objetivo: pos.target,
          desde: pos.entryDay,
          metricas: holdingMetrics ? summary(holdingMetrics) : null,
        }
      : null,
    candidatos: candidates.map(summary),
    noticias: news.map((n) => ({ hace_h: Math.round((Date.now() - n.published_at.getTime()) / 3_600_000), monedas: n.symbols, resumen: n.summary || n.title, sentimiento: n.sentiment, impacto: n.impact })),
  };
  const instructions = [
    def.persona,
    STYLE_TEXT[def.style],
    "Reglas: una sola posición a la vez y con todo el efectivo. Para comprar, elige SOLO un par de la lista de candidatos, con stop entre un 5 % y un 40 % por debajo del precio y objetivo al menos un 10 % por encima (apunta alto: necesitas el ritmo diario indicado).",
    "Si tienes posición: «mantener» (puedes subir el stop o mover el objetivo), «vender» si el movimiento se ha agotado o hay algo mejor, o déjala correr. Sin posición: «comprar» o «esperar» si de verdad no hay nada; recuerda que esperar también tiene coste con tu plazo.",
    "Volumen en euros de 24 h, cambios en %, fromHigh3d = distancia al máximo de 3 días, volSurge = volumen de las últimas 4 h frente a la media (1 = normal).",
    "Responde en español, claro y breve.",
  ].join("\n");

  const runBase = { workspace_id: WS, agent: def.key, as_of: dayDate(madridDay()), context: { ronda: input.ronda, candidatos: candidates.length } as Prisma.InputJsonValue, model: aiModelInfo().smart ?? null };
  let ai: { market_view: string; decision: AiDecision };
  try {
    ai = await aiJson({ tier: "smart", purpose: "kamikaze", instructions, input: JSON.stringify(input), schemaName: "kamikaze_decision", schema: SCHEMA as unknown as Record<string, unknown>, maxOutputTokens: 2500, timeoutMs: 45_000 });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "error";
    await prisma.trading_committee_runs.create({ data: { ...runBase, status: "error", error: msg } });
    await prisma.trading_kamikaze_rounds.update({ where: { id: round.id }, data: { last_decision_at: new Date() } });
    return `IA: ${msg}`;
  }

  const d = ai.decision;
  const checked = checkDecision(d, {
    holding: pos && holdingPair ? { pair: holdingPair, entry: pos.entryPrice ?? 0, stop: pos.stop, target: pos.target } : null,
    candidates: candidates.map((c) => ({ pair: c.pair, price: c.price })),
    price: livePrice,
  });
  const run = await prisma.trading_committee_runs.create({ data: { ...runBase, status: "ok", market_view: ai.market_view, raw: ai as unknown as Prisma.InputJsonValue } });

  let status = "ejecutada";
  let rejection: string | null = null;
  let positionId: string | null = null;
  let symbol = pos?.symbol ?? "";
  let px = holdingPair ? livePrice(holdingPair) : null;
  let quantity: number | null = null;
  try {
    if (checked.action === "rechazada") {
      status = "rechazada";
      rejection = checked.reason;
    } else if (checked.action === "comprar") {
      symbol = symbolOf(checked.pair, rules) ?? `${checked.pair.replace(/EUR$/, "")}-EUR`;
      const inst = await ensureInstrument(symbol, rules.get(checked.pair)?.base ?? symbol.replace(/-EUR$/, ""));
      px = (await prices([checked.pair])).get(checked.pair) ?? livePrice(checked.pair);
      if (!px) throw new Error("Sin precio al momento");
      await setLive(inst.id, px);
      quantity = allInQuantity(s.available, px, costOf(state.account));
      const placed = await placeOrder(
        WS,
        null,
        {
          symbol,
          direction: "long",
          quantity,
          stop: checked.stop,
          target: checked.target,
          execution: "now",
          maxHoldDays: Math.max(1, Math.ceil(msLeft / DAY)),
          notes: `${def.name}: ${d.rationale}`,
          source: "agente",
          signalKey: `kamikaze:${round.id}:${Date.now()}`,
        },
        def.key,
      );
      positionId = placed.id;
      await prisma.trading_kamikaze_rounds.update({ where: { id: round.id }, data: { trades: { increment: 1 } } });
    } else if (checked.action === "vender" && pos) {
      await closePosition(WS, pos.id, def.key, "decisión del agente");
      positionId = pos.id;
      const lost = pos.unrealized !== null && pos.unrealized < 0;
      if (lost) await prisma.trading_kamikaze_rounds.update({ where: { id: round.id }, data: { cooldown_until: new Date(Date.now() + COOLDOWN_MIN * 60_000) } });
    } else if (checked.action === "mantener" && pos) {
      await prisma.trading_positions.update({
        where: { id: pos.id },
        data: { ...(checked.stop ? { stop: checked.stop } : {}), ...(checked.target ? { target: checked.target } : {}), updated_at: new Date() },
      });
      positionId = pos.id;
    }
  } catch (e) {
    status = "descartada";
    rejection = `No se pudo ejecutar: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`;
  }

  if (checked.action !== "esperar" && symbol) {
    await prisma.trading_proposals.create({
      data: {
        run_id: run.id,
        workspace_id: WS,
        agent: def.key,
        symbol,
        name: symbol.replace(/-EUR$/, ""),
        market: "crypto",
        action: d.action,
        conviction: Math.max(1, Math.min(5, Math.round(d.conviction))),
        horizon_days: Math.max(1, Math.ceil(msLeft / DAY)),
        price: px ?? 0,
        stop: d.stop || null,
        target: d.target || null,
        quantity,
        rationale: d.rationale,
        risks: d.risks || null,
        status,
        rejection,
        position_id: positionId,
        decided_at: new Date(),
      },
    });
  }
  await prisma.trading_kamikaze_rounds.update({
    where: { id: round.id },
    data: { last_decision_at: new Date(), last_decision_price: px ?? null },
  });
  return `${d.action}${symbol ? ` ${symbol}` : ""}${rejection ? ` (${rejection})` : ""}`;
}

function summary(m: Metrics) {
  const r = (x: number) => Math.round(x * 100) / 100;
  return {
    par: m.pair,
    precio: m.price,
    cambio_1h: r(m.ch1h),
    cambio_4h: r(m.ch4h),
    cambio_24h: r(m.ch24h),
    fromHigh3d: r(m.fromHigh3d),
    fromLow3d: r(m.fromLow3d),
    volSurge: r(m.volSurge),
    volumen_24h_eur: Math.round(m.volume24h),
  };
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

/** «Reunir ahora» de un kamikaze: decisión con IA ya. */
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
