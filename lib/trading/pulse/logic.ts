// Panorama del mercado: cálculos y lecturas en lenguaje claro de los indicadores básicos (sin red ni base
// de datos, para poder probarlos). Son contexto para entender el mercado, no señales de compra o venta.
import { rsi } from "../indicators";

export type Tone = "pos" | "neg" | "warn" | "neutral";
export type Zone = { label: string; tone: Tone };
export type Point = { t: number; v: number };

export type BtcPulse = {
  price: number;
  ch24h: number | null;
  ch7d: number | null;
  ch30d: number | null;
  rsi14: number | null;
  ma200: number | null;
  /** % por encima (+) o por debajo (−) de la media de 200 días. */
  vsMa200Pct: number | null;
  /** Volumen de las últimas 24 h frente a la media diaria de los 30 días anteriores (1 = lo normal). */
  volRatio: number | null;
  volume24hEur: number | null;
  history: { t: number; c: number; ma200: number | null }[];
  rsiHistory: Point[];
};

export type FearGreed = { value: number; label: string; yesterday: number | null; weekAgo: number | null; monthAgo: number | null; history: Point[] };
export type GlobalMarket = { marketCapEur: number; volumeEur: number; btcDominance: number; marketCapCh24h: number | null };
export type Funding = { ratePct: number; source: string; history: Point[] };
export type Dollar = { value: number; ch30d: number | null; history: Point[] };

export type Read = { key: string; tone: Tone; text: string };

const DAY = 86_400_000;
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const chg = (now: number, before: number | undefined | null) => (before && before > 0 ? round(((now - before) / before) * 100) : null);

/** Velas diarias cerradas (t, cierre, volumen en BTC) + precio y volumen de ahora → todo lo de Bitcoin. */
export function btcPulse(
  closed: { t: number; c: number; v: number }[],
  now: { price: number; open24h: number | null; volume24hEur: number | null },
): BtcPulse {
  const list = [...closed].sort((a, b) => a.t - b.t);
  const closes = [...list.map((x) => x.c), now.price];
  const r = rsi(closes, 14);
  const ma = (i: number) => (i >= 199 ? closes.slice(i - 199, i + 1).reduce((s, v) => s + v, 0) / 200 : null);
  const last = closes.length - 1;
  const ma200 = ma(last);
  const back = (days: number) => closes[last - days];
  const vols = list.slice(-30).map((x) => x.v * x.c).filter((v) => v > 0);
  const avgVol = vols.length >= 10 ? vols.reduce((s, v) => s + v, 0) / vols.length : null;
  const ts = [...list.map((x) => x.t), list.length ? list[list.length - 1].t + DAY : Date.now()];
  const from = Math.max(0, closes.length - 180);
  const history = closes.slice(from).map((c, k) => ({ t: ts[from + k], c: round(c, 2), ma200: ma(from + k) === null ? null : round(ma(from + k)!, 2) }));
  const rsiHistory: Point[] = [];
  for (let i = Math.max(0, closes.length - 90); i < closes.length; i++) if (r[i] !== null) rsiHistory.push({ t: ts[i], v: round(r[i]!, 1) });
  return {
    price: now.price,
    ch24h: now.open24h ? chg(now.price, now.open24h) : chg(now.price, back(1)),
    ch7d: chg(now.price, back(7)),
    ch30d: chg(now.price, back(30)),
    rsi14: r[last] === null ? null : round(r[last]!, 1),
    ma200: ma200 === null ? null : round(ma200, 2),
    vsMa200Pct: ma200 ? chg(now.price, ma200) : null,
    volRatio: avgVol && now.volume24hEur ? round(now.volume24hEur / avgVol) : null,
    volume24hEur: now.volume24hEur,
    history,
    rsiHistory,
  };
}

// ---------------------------------------------------------------------------
// Zonas: cómo se suele leer cada valor (con sus cortes a la vista).
// ---------------------------------------------------------------------------
export const RSI_LOW = 30;
export const RSI_HIGH = 70;
export function rsiZone(v: number): Zone {
  if (v < RSI_LOW) return { label: "Sobrevendido", tone: "warn" };
  if (v > RSI_HIGH) return { label: "Sobrecomprado", tone: "warn" };
  return { label: "Normal", tone: "neutral" };
}

/** Cortes del índice de miedo y codicia (los de su autor, alternative.me). */
export function fearGreedZone(v: number): Zone {
  if (v <= 24) return { label: "Miedo extremo", tone: "neg" };
  if (v <= 46) return { label: "Miedo", tone: "warn" };
  if (v <= 54) return { label: "Neutral", tone: "neutral" };
  if (v <= 75) return { label: "Codicia", tone: "pos" };
  return { label: "Codicia extrema", tone: "warn" };
}

export function trendZone(vsMa200Pct: number): Zone {
  if (vsMa200Pct >= 0) return { label: "Tendencia alcista", tone: "pos" };
  return { label: "Tendencia bajista", tone: "neg" };
}

/** Funding cada 8 h, en %: lo normal ronda +0,01 %. */
export const FUNDING_HIGH = 0.03;
export function fundingZone(ratePct: number): Zone {
  if (ratePct >= FUNDING_HIGH) return { label: "Muy alcistas", tone: "warn" };
  if (ratePct < 0) return { label: "Bajistas", tone: "warn" };
  return { label: "Normal", tone: "neutral" };
}

export function volumeZone(ratio: number): Zone {
  if (ratio >= 1.5) return { label: "Mucha actividad", tone: "warn" };
  if (ratio <= 0.7) return { label: "Poca actividad", tone: "neutral" };
  return { label: "Normal", tone: "neutral" };
}

export function dollarZone(ch30d: number): Zone {
  if (ch30d >= 2) return { label: "Dólar fuerte", tone: "warn" };
  if (ch30d <= -2) return { label: "Dólar débil", tone: "pos" };
  return { label: "Estable", tone: "neutral" };
}

const pctText = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")} %`;

/**
 * Resumen en frases: lo más importante primero. Cada frase dice qué pasa y, si lo hay, qué suele
 * implicar; nunca «compra» ni «vende».
 */
export function pulseReads(p: { btc: BtcPulse | null; fearGreed: FearGreed | null; funding: Funding | null; dollar: Dollar | null; btc24hLimit: number }): Read[] {
  const out: Read[] = [];
  const b = p.btc;
  if (b && b.ch24h !== null && b.ch24h <= p.btc24hLimit)
    out.push({ key: "faro2", tone: "warn", text: `Bitcoin cae ${pctText(b.ch24h)} en 24 h: FARO-2 deja en pausa las compras nuevas hasta que se calme.` });
  if (b && b.vsMa200Pct !== null)
    out.push(
      b.vsMa200Pct >= 0
        ? { key: "trend", tone: "pos", text: `Bitcoin está ${pctText(b.vsMa200Pct)} por encima de su media de 200 días: la tendencia de fondo es alcista.` }
        : { key: "trend", tone: "neg", text: `Bitcoin está ${pctText(b.vsMa200Pct)} por debajo de su media de 200 días: la tendencia de fondo es bajista.` },
    );
  if (p.fearGreed) {
    const z = fearGreedZone(p.fearGreed.value);
    const extra = p.fearGreed.value <= 24 ? " Suele coincidir con caídas fuertes; a veces, con suelos." : p.fearGreed.value >= 76 ? " Suele coincidir con subidas muy estiradas." : "";
    out.push({ key: "fg", tone: z.tone, text: `El sentimiento está en «${z.label.toLowerCase()}» (${p.fearGreed.value} de 100).${extra}` });
  }
  if (b && b.rsi14 !== null && (b.rsi14 < RSI_LOW || b.rsi14 > RSI_HIGH))
    out.push({
      key: "rsi",
      tone: "warn",
      text:
        b.rsi14 < RSI_LOW
          ? `El RSI de Bitcoin está en ${Math.round(b.rsi14)}: ha caído muy rápido. Puede rebotar, pero en tendencia bajista lo sobrevendido puede seguir cayendo.`
          : `El RSI de Bitcoin está en ${Math.round(b.rsi14)}: ha subido muy rápido y suele tomarse un respiro.`,
    });
  if (p.funding && (p.funding.ratePct >= FUNDING_HIGH || p.funding.ratePct < 0))
    out.push({
      key: "funding",
      tone: "warn",
      text:
        p.funding.ratePct >= FUNDING_HIGH
          ? "En futuros hay muchas apuestas a que sube: cuando se llena tanto ese lado, a menudo vienen sacudidas a la baja."
          : "En futuros dominan las apuestas a que baja: si el precio aguanta, pueden verse obligados a cerrar y empujarlo hacia arriba.",
    });
  if (p.dollar && p.dollar.ch30d !== null && Math.abs(p.dollar.ch30d) >= 2)
    out.push({
      key: "dollar",
      tone: p.dollar.ch30d > 0 ? "warn" : "pos",
      text: p.dollar.ch30d > 0 ? `El dólar sube ${pctText(p.dollar.ch30d)} en un mes: un dólar fuerte suele pesar sobre las cripto.` : `El dólar baja ${pctText(p.dollar.ch30d)} en un mes: un dólar débil suele favorecer a las cripto.`,
    });
  return out;
}

/** Lo que se guarda cada día (sin las series) para estudiar después qué contexto acompaña a cada idea. */
export function pulseSnapshot(p: { btc: BtcPulse | null; fearGreed: FearGreed | null; global: GlobalMarket | null; funding: Funding | null; dollar: Dollar | null }) {
  return {
    btcPrice: p.btc?.price ?? null,
    btcCh24h: p.btc?.ch24h ?? null,
    btcRsi14: p.btc?.rsi14 ?? null,
    btcVsMa200Pct: p.btc?.vsMa200Pct ?? null,
    btcVolRatio: p.btc?.volRatio ?? null,
    fearGreed: p.fearGreed?.value ?? null,
    btcDominance: p.global?.btcDominance ?? null,
    marketCapEur: p.global?.marketCapEur ?? null,
    fundingPct: p.funding?.ratePct ?? null,
    dollar: p.dollar?.value ?? null,
    dollarCh30d: p.dollar?.ch30d ?? null,
  };
}
