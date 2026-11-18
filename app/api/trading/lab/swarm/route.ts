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
  if (!(await auth())?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const days = Math.min(365, Math.max(14, Number(new URL(req.url).searchParams.get("dias")) || 180));
  const to = Math.floor(Date.now() / HOUR) * HOUR;
  const from = to - days * 24 * HOUR;
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
  const variants: SwarmVariant[] = [
    { key: "inverso-defensa", name: "INVERSO en defensa (sin costes de Kraken)", side: "short", regime: "defensa" },
    { key: "inverso-defensa-kraken", name: "INVERSO en defensa · Kraken real", side: "short", regime: "defensa", kraken: true },
    { key: "inverso-grandes-defensa", name: "INVERSO GRANDES en defensa (sin costes de Kraken)", side: "short", regime: "defensa", coins: BIG_COINS },
    { key: "inverso-grandes-defensa-kraken", name: "INVERSO GRANDES en defensa · Kraken real", side: "short", regime: "defensa", coins: BIG_COINS, kraken: true },
  ];
  const results = variants.map((v) => simulateSwarm(series, btc, v, from, 1000, attack, funding));
  const window = [...attack.entries()].filter(([d]) => d >= new Date(from).toISOString().slice(0, 10));
  const btcFrom = btc.find((b) => b.t >= from)?.o ?? null;
  const summary = {
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
  await prisma.$executeRaw`INSERT INTO trading_lab_results (name, params, result) VALUES ('enjambres', ${JSON.stringify({ days })}::jsonb, ${JSON.stringify(summary)}::jsonb)`;
  return NextResponse.json(summary);
}
