// lib/trading/indicators.ts
// Indicadores técnicos clásicos. Todos son causales: el valor en i solo usa velas 0..i.
import type { Candle } from "./types";

type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seed = 0;
  for (let i = 0; i < values.length; i++) {
    if (prev === null) {
      seed += values[i];
      if (i === period - 1) {
        prev = seed / period;
        out[i] = prev;
      }
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** RSI de Wilder. */
export function rsi(values: number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/** Rango verdadero medio de Wilder. */
export function atr(c: Candle[], period = 14): Series {
  const out: Series = new Array(c.length).fill(null);
  let prev: number | null = null;
  let seed = 0;
  for (let i = 0; i < c.length; i++) {
    const tr =
      i === 0
        ? c[i].h - c[i].l
        : Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    if (prev === null) {
      seed += tr;
      if (i === period - 1) {
        prev = seed / period;
        out[i] = prev;
      }
      continue;
    }
    prev = (prev * (period - 1) + tr) / period;
    out[i] = prev;
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) => (f[i] !== null && s[i] !== null ? f[i]! - s[i]! : null));
  const firstValid = line.findIndex((v) => v !== null);
  const sig: Series = new Array(values.length).fill(null);
  if (firstValid >= 0) {
    const tail = ema(line.slice(firstValid) as number[], signal);
    tail.forEach((v, k) => (sig[firstValid + k] = v));
  }
  const hist: Series = line.map((v, i) => (v !== null && sig[i] !== null ? v - sig[i]! : null));
  return { line, signal: sig, hist };
}

/** ATR en la vela i con respaldo para el arranque de la serie. */
export function atrAt(series: Series, c: Candle[], i: number) {
  const v = series[i];
  if (v !== null && v !== undefined && v > 0) return v;
  const from = Math.max(0, i - 13);
  let s = 0;
  for (let k = from; k <= i; k++) s += c[k].h - c[k].l;
  return Math.max(s / (i - from + 1), c[i].c * 0.005);
}

/** Media de volumen de las `period` velas anteriores a i (sin incluir i). */
export function avgVolumeBefore(c: Candle[], i: number, period = 20) {
  const from = Math.max(0, i - period);
  if (from >= i) return c[i]?.v ?? 0;
  let s = 0;
  for (let k = from; k < i; k++) s += c[k].v;
  return s / (i - from);
}

export type IndicatorBundle = {
  sma20: Series;
  sma50: Series;
  sma200: Series;
  rsi14: Series;
  atr14: Series;
};

export function indicatorBundle(c: Candle[]): IndicatorBundle {
  const closes = c.map((x) => x.c);
  return {
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    rsi14: rsi(closes, 14),
    atr14: atr(c, 14),
  };
}

/** Tendencia de fondo en la vela i: alcista si precio > SMA200 y la SMA50 sube; bajista al revés. */
export function trendAt(ind: IndicatorBundle, c: Candle[], i: number): "up" | "down" | "flat" {
  const s200 = ind.sma200[i];
  const s50 = ind.sma50[i];
  const s50prev = ind.sma50[i - 10];
  if (s50 === null || s50prev === null || s50prev === undefined) return "flat";
  const ref = s200 ?? s50;
  const rising = s50 > s50prev;
  if (c[i].c > ref && rising) return "up";
  if (c[i].c < ref && !rising) return "down";
  return "flat";
}
