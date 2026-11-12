// lib/trading/chip/engine.ts
// Agentes de dos modos en marcha. Una vez al día, con la vela de ayer ya cerrada:
//   1) pone al día su cartera (órdenes de la apertura, stops);
//   2) mira el detector (¿ataque o defensa?) y aplica la estrategia del laboratorio, la misma que se probó;
//   3) vende lo que sobra y compra lo nuevo al precio de ahora (crypto no cierra) y sube los stops;
//   4) deja escrito qué ha hecho y por qué (se ve en su página, en Inicio y en Oportunidades),
//      y las copias de los usuarios hacen lo mismo en proporción.
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accountState, closePosition, ensureAccount, OPEN_STATUSES, placeOrder, processAccount, resetAccount } from "../accounts";
import { replicate } from "../agents/copy";
import { AGENTS_WORKSPACE } from "../agents/roster";
import { CHIP, contextAt, explainDetectorB, type Coin } from "../lab/strategies";
import { CRYPTO_MARKET, CRYPTO_BENCHMARK } from "../market-data";
import { dayDate, dayKey, loadSeries } from "../sync";
import { CHIP_AGENTS, chipByKey, type ChipDef } from "./roster";

const WS = AGENTS_WORKSPACE;
const DAY = 86_400_000;
const dayOf = (t: number) => Math.floor(t / DAY) * DAY;

/** Fila de propuesta (lo que el agente ha hecho), como la guarda el comité. */
type ProposalRow = {
  workspace_id: string;
  agent: string;
  symbol: string;
  name: string;
  market: string;
  action: "comprar" | "vender";
  conviction: number;
  horizon_days: number;
  price: number;
  stop?: number | null;
  target?: number | null;
  quantity: number | null;
  rationale: string;
  evidence: never[];
  risks: string | null;
  status: "ejecutada";
  position_id: string | null;
  decided_at: Date;
};

export type ChipRunSummary = { agent: string; skipped?: string; mode?: "ataque" | "defensa"; actions: string[] };

async function ensureChip(def: ChipDef) {
  return ensureAccount(WS, def.key, { name: def.name, capital: def.capital, settings: def.settings });
}

/** Velas diarias cerradas de las crypto (sin la de hoy, que aún se está formando). */
async function closedCoins(): Promise<{ coins: Coin[]; lastDay: number | null }> {
  const inst = await prisma.market_instruments.findMany({ where: { market: CRYPTO_MARKET, active: true }, select: { id: true, symbol: true } });
  const series = await loadSeries(inst.map((i) => i.id), new Date(Date.now() - 330 * DAY));
  const today = dayOf(Date.now());
  const coins = inst.map((i) => ({ symbol: i.symbol, candles: (series.get(i.id) ?? []).filter((c) => dayOf(c.t) < today) }));
  const btc = coins.find((c) => c.symbol === CRYPTO_BENCHMARK)?.candles ?? [];
  return { coins, lastDay: btc.length ? dayOf(btc[btc.length - 1].t) : null };
}

/** Reunión diaria de todos los agentes de dos modos (si no se han reunido hoy). */
export async function chipTick(force = false): Promise<ChipRunSummary[]> {
  const out: ChipRunSummary[] = [];
  for (const def of CHIP_AGENTS) out.push(await runChip(def, force).catch((e) => ({ agent: def.key, skipped: e instanceof Error ? e.message : "error", actions: [] })));
  return out;
}

export async function runChipNow(key: string) {
  const def = chipByKey(key);
  if (!def) throw new Error("Agente desconocido");
  const r = await runChip(def, true);
  return { id: null, auto: r.actions.map((a) => ({ symbol: "", ok: true, detail: a })), skipped: r.skipped ?? null };
}

export async function resetChip(key: string) {
  const def = chipByKey(key);
  if (!def) throw new Error("Agente desconocido");
  const account = await ensureChip(def);
  await resetAccount(WS, def.capital, def.key);
  await prisma.trading_committee_runs.deleteMany({ where: { workspace_id: WS, agent: def.key } });
  await prisma.trading_accounts.update({ where: { id: account.id }, data: { ...def.settings, name: def.name, created_at: new Date(), updated_at: new Date() } });
}

async function runChip(def: ChipDef, force: boolean): Promise<ChipRunSummary> {
  const actions: string[] = [];
  const account = await ensureChip(def);
  const today = dayOf(Date.now());
  const last = await prisma.trading_committee_runs.findFirst({ where: { workspace_id: WS, agent: def.key }, orderBy: { created_at: "desc" }, select: { created_at: true } });
  if (!force && last && last.created_at.getTime() >= today) return { agent: def.key, skipped: "ya decidió hoy", actions };

  const { coins, lastDay } = await closedCoins();
  if (lastDay === null) return { agent: def.key, skipped: "sin datos de Bitcoin", actions };
  // Solo decide con la vela de ayer: si aún no ha llegado, espera a la próxima revisión.
  if (!force && lastDay < today - DAY) return { agent: def.key, skipped: "aún no está la vela de ayer", actions };

  // Turno: evita que dos servidores muevan al agente a la vez.
  const got = await prisma.$executeRaw(Prisma.sql`UPDATE public.trading_accounts SET meeting_lease_until = now() + interval '3 minutes'
    WHERE id = ${account.id}::uuid AND (meeting_lease_until IS NULL OR meeting_lease_until < now())`);
  if (got !== 1) return { agent: def.key, skipped: "ocupado", actions };

  try {
    await processAccount(account.id);
    let state = await accountState(WS, def.key);
    const open = state.positions.filter((p) => (OPEN_STATUSES as readonly string[]).includes(p.status));
    const step = Math.floor((lastDay - dayOf(account.created_at.getTime())) / DAY);
    const ctx = contextAt(coins, lastDay, step, (s) => open.some((p) => p.symbol === s));
    const why = explainDetectorB(ctx);
    const mode = why.attack ? "ataque" : "defensa";
    const strategy = CHIP.find((s) => s.key === def.strategy);
    if (!strategy) throw new Error(`Estrategia ${def.strategy} no encontrada`);
    const target = strategy.decide(ctx);
    const equityBefore = state.summary.equity;
    const proposals: ProposalRow[] = [];
    const nameOf = new Map<string, string>((await prisma.market_instruments.findMany({ where: { symbol: { in: coins.map((c) => c.symbol) } }, select: { symbol: true, name: true } })).map((i: { symbol: string; name: string }) => [i.symbol, i.name] as [string, string]));

    // 1) Ventas: lo que ya no está en el plan.
    if (target !== null) {
      for (const p of open) {
        if (p.symbol in target) continue;
        const reason = why.attack ? "pierde su mínimo de 10 días" : "el chip pasa a defensa";
        await closePosition(WS, p.id, def.key, reason);
        const price = ctx.close(p.symbol) ?? p.lastPrice ?? p.plannedEntry;
        proposals.push({
          workspace_id: WS,
          agent: def.key,
          symbol: p.symbol,
          name: p.name,
          market: "crypto",
          action: "vender",
          conviction: 4,
          horizon_days: 1,
          price,
          quantity: p.quantity,
          rationale: why.attack
            ? `**Vende ${p.name}**: ha perdido su mínimo de los últimos 10 días, señal de que la subida se ha agotado.`
            : `**Vende ${p.name} y pasa a efectivo**: el detector ha cambiado a **modo defensa** (${why.checks.filter((x) => !x.ok).map((x) => x.text.toLowerCase().replace("está por encima", "ya no está por encima").replace("vale más", "ya no vale más")).join("; ")}).`,
          evidence: [],
          risks: null,
          status: "ejecutada",
          position_id: p.id,
          decided_at: new Date(),
        });
        actions.push(`vende ${p.symbol}`);
      }
    }

    // 2) Compras: lo nuevo, a partes iguales del patrimonio.
    if (target !== null) {
      const fresh = Object.keys(target).filter((s) => !open.some((p) => p.symbol === s));
      if (fresh.length) {
        state = await accountState(WS, def.key);
        const per = state.summary.equity / Object.keys(target).length;
        let cash = state.summary.cash;
        for (const s of fresh) {
          const price = ctx.close(s);
          const stop = ctx.lowest(s, 10);
          const high = ctx.highest(s, 20);
          if (!price || !stop || stop >= price) continue;
          const amount = Math.min(per, cash * 0.99);
          if (amount < 10) break;
          const quantity = amount / price;
          const name = nameOf.get(s) ?? s;
          try {
            const r = await placeOrder(
              WS,
              null,
              {
                symbol: s,
                direction: "long",
                quantity,
                stop,
                target: price * 10, // sin objetivo: sale por el stop que sube o por el cambio de chip
                // Crypto cotiza siempre: el cierre de ayer es la apertura de hoy. Se compra ya (como en la simulación).
                execution: "now",
                signalKey: `chip:${def.key}:${s}:${dayKey(new Date(lastDay))}`,
                maxHoldDays: null,
                notes: `${def.name}: ruptura de máximos de 20 días en modo ataque`,
                source: "agente",
              },
              def.key,
            );
            cash -= amount;
            proposals.push({
              workspace_id: WS,
              agent: def.key,
              symbol: s,
              name,
              market: "crypto",
              action: "comprar",
              conviction: 4,
              horizon_days: 20,
              price,
              stop,
              target: null,
              quantity,
              rationale: `**Compra ${name}** en **modo ataque**: ha superado su máximo de los últimos 20 días${high ? ` (${high.toFixed(4)} €)` : ""} y Bitcoin acompaña. Se queda mientras no pierda su mínimo de 10 días (stop a ${stop.toFixed(4)} €, que irá subiendo).`,
              evidence: [],
              risks: "Las rupturas a veces fallan y el precio vuelve atrás: entonces salta el stop.",
              status: "ejecutada",
              position_id: r.id,
              decided_at: new Date(),
            });
            actions.push(`compra ${s}`);
          } catch (e) {
            actions.push(`${s}: ${e instanceof Error ? e.message : "no se pudo"}`);
          }
        }
      }
    }

    // 3) Stops que suben: el mínimo de 10 días de lo que sigue en cartera.
    for (const p of open.filter((x) => x.status === "abierta")) {
      if (target !== null && !(p.symbol in target)) continue;
      const low = ctx.lowest(p.symbol, 10);
      if (low && low > p.stop && low < (ctx.close(p.symbol) ?? Infinity)) {
        await prisma.trading_positions.update({ where: { id: p.id }, data: { stop: low, updated_at: new Date() } });
        // Las copias suben su stop igual (sin dejar una «decisión» por cada subida).
        await replicate(def.key, { id: p.id, action: "mantener", symbol: p.symbol, price: ctx.close(p.symbol) ?? p.stop, quantity: null, stop: low, target: null, horizon_days: 0 }, equityBefore).catch(() => undefined);
        actions.push(`sube el stop de ${p.symbol}`);
      }
    }

    // 4) Lo deja escrito.
    const holdings = (await accountState(WS, def.key)).positions.filter((p) => (OPEN_STATUSES as readonly string[]).includes(p.status)).map((p) => p.name);
    const view =
      mode === "ataque"
        ? `**Modo ataque.** ${why.checks.map((x) => x.text).join("; ")}. ${holdings.length ? `En cartera: ${holdings.join(", ")}.` : "Esperando una ruptura de máximos para entrar."}`
        : `**Modo defensa: en efectivo.** ${why.checks.filter((x) => !x.ok).map((x) => `No se cumple: ${x.text.toLowerCase()}`).join(". ")}. Vuelve a atacar cuando se cumplan las tres condiciones.`;
    const run = await prisma.trading_committee_runs.create({
      data: {
        workspace_id: WS,
        agent: def.key,
        as_of: dayDate(dayKey(new Date(lastDay))),
        market_view: view,
        context: JSON.parse(JSON.stringify({ chip: { mode, checks: why.checks, btc: why.btc, ma200: why.ma200, ma50: why.ma50, holdings } })),
        model: "reglas",
        proposals: { create: proposals },
      },
      include: { proposals: true },
    });
    // Las copias de los usuarios hacen lo mismo, en proporción.
    for (const p of run.proposals) await replicate(def.key, p, equityBefore, "now").catch(() => undefined);
    return { agent: def.key, mode, actions };
  } finally {
    await prisma.trading_accounts.update({ where: { id: account.id }, data: { meeting_lease_until: null } }).catch(() => undefined);
  }
}

/** Modo del agente según su última decisión (para la interfaz). */
export function chipModeOf(context: unknown): { mode: "ataque" | "defensa"; checks: { ok: boolean; text: string }[] } | null {
  const c = (context as { chip?: { mode?: string; checks?: { ok: boolean; text: string }[] } } | null)?.chip;
  if (!c || (c.mode !== "ataque" && c.mode !== "defensa")) return null;
  return { mode: c.mode, checks: Array.isArray(c.checks) ? c.checks : [] };
}
