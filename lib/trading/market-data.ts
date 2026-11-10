// lib/trading/market-data.ts
// Proveedor de velas diarias. Usa el endpoint público de gráficos de Yahoo Finance
// (sin clave; no es una API oficial, así que todo va encapsulado aquí para poder cambiar
// de proveedor sin tocar nada más).
import type { Candle } from "./types";

export const INDEX_SYMBOL = "^IBEX";

/** Composición de partida del IBEX 35 (tickers de Yahoo, sufijo .MC = Bolsa de Madrid). Se puede editar desde la app. */
export const IBEX35: { symbol: string; name: string; sector: string }[] = [
  { symbol: "ACS.MC", name: "ACS", sector: "Construcción" },
  { symbol: "ACX.MC", name: "Acerinox", sector: "Materiales" },
  { symbol: "AENA.MC", name: "Aena", sector: "Transporte" },
  { symbol: "AMS.MC", name: "Amadeus", sector: "Tecnología" },
  { symbol: "ANA.MC", name: "Acciona", sector: "Construcción" },
  { symbol: "ANE.MC", name: "Acciona Energía", sector: "Energía" },
  { symbol: "BBVA.MC", name: "BBVA", sector: "Banca" },
  { symbol: "BKT.MC", name: "Bankinter", sector: "Banca" },
  { symbol: "CABK.MC", name: "CaixaBank", sector: "Banca" },
  { symbol: "CLNX.MC", name: "Cellnex", sector: "Telecomunicaciones" },
  { symbol: "COL.MC", name: "Inmobiliaria Colonial", sector: "Inmobiliario" },
  { symbol: "ELE.MC", name: "Endesa", sector: "Energía" },
  { symbol: "ENG.MC", name: "Enagás", sector: "Energía" },
  { symbol: "FDR.MC", name: "Fluidra", sector: "Industria" },
  { symbol: "FER.MC", name: "Ferrovial", sector: "Construcción" },
  { symbol: "GRF.MC", name: "Grifols", sector: "Salud" },
  { symbol: "IAG.MC", name: "IAG", sector: "Transporte" },
  { symbol: "IBE.MC", name: "Iberdrola", sector: "Energía" },
  { symbol: "IDR.MC", name: "Indra", sector: "Tecnología" },
  { symbol: "ITX.MC", name: "Inditex", sector: "Consumo" },
  { symbol: "LOG.MC", name: "Logista", sector: "Distribución" },
  { symbol: "MAP.MC", name: "Mapfre", sector: "Seguros" },
  { symbol: "MRL.MC", name: "Merlin Properties", sector: "Inmobiliario" },
  { symbol: "MTS.MC", name: "ArcelorMittal", sector: "Materiales" },
  { symbol: "NTGY.MC", name: "Naturgy", sector: "Energía" },
  { symbol: "PUIG.MC", name: "Puig", sector: "Consumo" },
  { symbol: "RED.MC", name: "Redeia", sector: "Energía" },
  { symbol: "REP.MC", name: "Repsol", sector: "Energía" },
  { symbol: "ROVI.MC", name: "Laboratorios Rovi", sector: "Salud" },
  { symbol: "SAB.MC", name: "Banco Sabadell", sector: "Banca" },
  { symbol: "SAN.MC", name: "Banco Santander", sector: "Banca" },
  { symbol: "SCYR.MC", name: "Sacyr", sector: "Construcción" },
  { symbol: "SLR.MC", name: "Solaria", sector: "Energía" },
  { symbol: "TEF.MC", name: "Telefónica", sector: "Telecomunicaciones" },
  { symbol: "UNI.MC", name: "Unicaja", sector: "Banca" },
];

export type ChartResponse = {
  symbol: string;
  name: string | null;
  currency: string | null;
  exchange: string | null;
  candles: Candle[];
};

type YahooChart = {
  chart?: {
    error?: { description?: string } | null;
    result?: {
      meta?: { symbol?: string; currency?: string; exchangeName?: string; longName?: string; shortName?: string; gmtoffset?: number };
      timestamp?: number[];
      indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
    }[] | null;
  };
};

/** Normaliza la respuesta del endpoint de gráficos: una vela por sesión, fecha local a las 00:00 UTC. */
export function parseYahooChart(json: unknown): ChartResponse {
  const data = json as YahooChart;
  const err = data?.chart?.error;
  if (err) throw new Error(err.description || "El proveedor de datos devolvió un error");
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error("Respuesta sin datos");
  const q = r.indicators?.quote?.[0] ?? {};
  const ts = r.timestamp ?? [];
  const offset = (r.meta?.gmtoffset ?? 0) * 1000;
  const byDay = new Map<number, Candle>();
  for (let k = 0; k < ts.length; k++) {
    const o = q.open?.[k];
    const h = q.high?.[k];
    const l = q.low?.[k];
    const c = q.close?.[k];
    if (o == null || h == null || l == null || c == null) continue;
    if (!(o > 0 && h > 0 && l > 0 && c > 0)) continue;
    const local = new Date(ts[k] * 1000 + offset);
    const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    byDay.set(day, {
      t: day,
      o,
      h: Math.max(h, o, c),
      l: Math.min(l, o, c),
      c,
      v: Math.max(0, Math.round(q.volume?.[k] ?? 0)),
    });
  }
  return {
    symbol: r.meta?.symbol ?? "",
    name: r.meta?.longName ?? r.meta?.shortName ?? null,
    currency: r.meta?.currency ?? null,
    exchange: r.meta?.exchangeName ?? null,
    candles: [...byDay.values()].sort((a, b) => a.t - b.t),
  };
}

export async function fetchDailyCandles(symbol: string, opts: { since?: Date; years?: number; timeoutMs?: number } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const from = opts.since
    ? Math.floor(opts.since.getTime() / 1000)
    : now - Math.round((opts.years ?? 6) * 365.25 * 86_400);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${from}&period2=${now + 86_400}&interval=1d&events=div%2Csplit&includePrePost=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Crussader/1.0)", Accept: "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    cache: "no-store",
  });
  if (res.status === 404) throw new Error(`No existe el valor ${symbol}`);
  if (!res.ok) throw new Error(`El proveedor de datos respondió ${res.status} para ${symbol}`);
  return parseYahooChart(await res.json());
}
