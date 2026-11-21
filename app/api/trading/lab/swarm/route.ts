// Simulación histórica de los ENJAMBRES: descarga velas de 1 h de Binance (datos públicos), ejecuta las tres
// variantes con la regla del escáner de ruido y guarda el resultado en trading_lab_results. Solo con sesión.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { tickers } from "@/lib/trading/kamikaze/market";
import { venueCoverage } from "@/lib/trading/agents/venues";
import { BIG_COINS } from "@/lib/trading/kamikaze/roster";
import { attackDays, simulateSwarm, type Funding, type HBar, type SwarmVariant } from "@/lib/trading/lab/swarm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HOUR = 3_600_000;

async function klines(pair: string, from: number, to: number, interval = "1h"): Promise<HBar[]> {
  const step = interval === "1d" ? 24 * HOUR : HOUR;
  const out: HBar[] = [];
  let start = from;
  while (start < to) {
    const q = new URLSearchParams({ symbol: pair, interval, startTime: String(start), limit: "1000" });
    const res = await fetch(`https://data-api.binance.vision/api/v3/klines?${q}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Binance ${res.status} ${pair}`);
    const rows = (await res.json()) as unknown[][];
    if (!rows.length) break;
    for (const k of rows) out.push({ t: Number(k[0]), o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]) });
    start = Number(rows[rows.length - 1][0]) + step;
    if (rows.length < 1000) break;
  }
  return out.filter((b) => b.t < to);
}

export async function GET(req: Request) {
  // Con sesión, o desde el cron diario de Vercel (Authorization: Bearer CRON_SECRET).
  const cron = !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!cron && !(await auth())?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  // «desde=AAAA-MM-DD»: prueba fuera de muestra desde esa fecha hasta hoy (la usa el cron diario).
  const since = q.get("desde") && /^\d{4}-\d{2}-\d{2}$/.test(q.get("desde")!) ? Date.parse(`${q.get("desde")}T00:00:00Z`) : null;
  const days = since ? Math.max(1, Math.ceil((Date.now() - since) / (24 * HOUR))) : Math.min(365, Math.max(14, Number(q.get("dias")) || 180));
  // «hasta=AAAA-MM-DD»: simula el periodo que termina ese día (para probar otros años, como 2022).
  const until = q.get("hasta") && /^\d{4}-\d{2}-\d{2}$/.test(q.get("hasta")!) ? Date.parse(`${q.get("hasta")}T00:00:00Z`) + 24 * HOUR : Date.now();
  const to = Math.floor(Math.min(until, Date.now()) / HOUR) * HOUR;
  const from = since ?? to - days * 24 * HOUR;
  // Mismo universo que el escáner de hoy: monedas de Revolut X con más de 200.000 € de volumen, las 40 mayores.
  const [market, cov] = await Promise.all([tickers(), venueCoverage()]);
  const revx = cov?.find((v) => v.id === "revolutx")?.has ?? null;
  const pool = market.filter((t) => (!revx || revx.has(t.base)) && t.volume24h >= 200_000 && t.price > 0).sort((a, b) => b.volume24h - a.volume24h)
    .filter((t, i, all) => all.findIndex((x) => x.base === t.base) === i)
    .slice(0, 40);
  const btcPair = market.find((t) => t.base === "BTC" && t.pair.endsWith("EUR"))?.pair ?? "BTCEUR";
  const series = new Map<string, HBar[]>();
  const failed: string[] = [];
  for (let i = 0; i < pool.length; i += 8) {
    await Promise.all(pool.slice(i, i + 8).map(async (t) => {
      try {
        const bars = await klines(t.pair, from - 24 * HOUR, to);
        if (bars.length > 48) series.set(t.base, bars);
      } catch {
        failed.push(t.base);
      }
    }));
  }
  const btc = series.get("BTC") ?? (await klines(btcPair, from - 24 * HOUR, to));
  // Fase del mercado de cada día (Detector B con Bitcoin diario: hacen falta 200 días previos).
  const daily = await klines(btcPair, from - 230 * 24 * HOUR, to, "1d");
  const attack = attackDays(daily);
  // Funding histórico de Kraken (perpetuos PF_<moneda>USD; Bitcoin es XBT) de las monedas con datos.
  const funding: Funding = new Map();
  const noFunding: string[] = [];
  for (const base of series.keys()) {
    try {
      const sym = `PF_${base === "BTC" ? "XBT" : base}USD`;
      const res = await fetch(`https://futures.kraken.com/derivatives/api/v3/historical-funding-rates?symbol=${sym}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const j = (await res.json()) as { rates?: { timestamp: string; relativeFundingRate: number }[] };
      if (!j.rates?.length) { noFunding.push(base); continue; }
      funding.set(base, new Map(j.rates.map((r) => [Math.floor(Date.parse(r.timestamp) / HOUR) * HOUR, Number(r.relativeFundingRate) || 0])));
    } catch {
      noFunding.push(base);
    }
  }
  // «regla=caidas»: AVALANCHA (cortos en caídas bruscas, en cualquier fase) en vez de ENJAMBRE.
  const crash = q.get("regla") === "caidas";
  const variants: SwarmVariant[] = crash
    ? [1, 2, 3].map((leverage) => ({
        key: `avalancha-x${leverage}`,
        name: `AVALANCHA ${leverage}x (grandes, caídas bruscas, Kraken)`,
        side: "caida" as const,
        coins: BIG_COINS,
        kraken: true,
        leverage,
      }))
    : [1, 2, 3, 5, 10].map((leverage) => ({
    key: `enjambre-x${leverage}`,
    name: `ENJAMBRE ${leverage}x (grandes, defensa, Kraken)`,
    side: "short" as const,
    regime: "defensa" as const,
    coins: BIG_COINS,
    kraken: true,
    leverage,
  }));
  const results = variants.map((v) => simulateSwarm(series, btc, v, from, 1000, attack, funding));
  const window = [...attack.entries()].filter(([d]) => d >= new Date(from).toISOString().slice(0, 10));
  const btcFrom = btc.find((b) => b.t >= from)?.o ?? null;
  const summary = {
    until: q.get("hasta"),
    days,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    coins: [...series.keys()],
    failed,
    noFunding,
    attackDaysPct: window.length ? Math.round((window.filter(([, on]) => on).length / window.length) * 100) : null,
    btcHoldPct: btcFrom ? Math.round((btc[btc.length - 1].c / btcFrom - 1) * 10_000) / 100 : null,
    results,
  };
  await prisma.$executeRaw`INSERT INTO trading_lab_results (name, params, result) VALUES (${crash ? "avalancha" : since ? "enjambres-vivo" : "enjambres"}, ${JSON.stringify({ days, desde: q.get("desde"), hasta: q.get("hasta"), regla: q.get("regla") })}::jsonb, ${JSON.stringify(summary)}::jsonb)`;
  return NextResponse.json(summary);
}
