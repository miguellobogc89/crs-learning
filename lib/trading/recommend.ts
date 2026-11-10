// lib/trading/recommend.ts
// Convierte las figuras detectadas en recomendaciones concretas: qué hacer, con cuánto,
// dónde salir y por qué. Combina calidad de la figura, su historial en el backtest,
// la tendencia del valor, la del mercado y el beneficio/riesgo.
import { maxHoldBars } from "./backtest";
import { trendAt, type IndicatorBundle } from "./indicators";
import { PATTERN_NAMES } from "./library";
import { positionSize, type CostModel, type Sizing } from "./risk";
import type { Candle, Detection, Direction, PatternKey, PatternStats } from "./types";

export type Regime = "alcista" | "bajista" | "lateral";

export type AccountView = {
  equity: number;
  cash: number;
  riskPct: number;
  maxPositionPct: number;
  allowShort: boolean;
  minScore: number;
  cost: CostModel;
  /** Símbolos con posición abierta o pendiente, y su dirección. */
  holdings: Record<string, Direction>;
};

export type RecommendationAction = "comprar" | "vender_corto" | "evitar" | "vigilar" | "cerrar";

export type Recommendation = {
  key: string;
  symbol: string;
  name: string;
  pattern: PatternKey;
  patternName: string;
  direction: Direction;
  action: RecommendationAction;
  /** La señal pasa el umbral de puntuación de la cuenta. */
  strong: boolean;
  status: Detection["status"];
  asOf: string;
  signalDate: string | null;
  lastClose: number;
  entry: number;
  stop: number;
  target: number;
  rr: number;
  quality: number;
  score: number;
  /** Lo que llevaría el precio desde la entrada hacia el objetivo (0 = en la entrada, 1 = en el objetivo). */
  progress: number;
  pros: string[];
  cons: string[];
  sizing: Sizing | null;
  history: { trades: number; winRate: number; avgR: number } | null;
  /** Sesiones máximas en posición antes de salir por tiempo. */
  maxHoldDays: number;
  /** La figura tiene historial negativo con muestra suficiente: no se recomienda entrar. */
  vetoed: boolean;
  plan: string;
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
/** Operaciones mínimas del historial para vetar una figura con resultado negativo. */
export const MIN_TRADES_FOR_VETO = 30;
const REVERSALS: PatternKey[] = ["hch", "hch_inv", "double_top", "double_bottom"];

const eur = (v: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: v < 20 ? 3 : 2 }).format(v);
const eur0 = (v: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export function regimeFrom(c: Candle[], ind: IndicatorBundle): Regime {
  if (c.length < 60) return "lateral";
  const t = trendAt(ind, c, c.length - 1);
  return t === "up" ? "alcista" : t === "down" ? "bajista" : "lateral";
}

export type InstrumentInput = {
  symbol: string;
  name: string;
  candles: Candle[];
  ind: IndicatorBundle;
  detections: Detection[];
};

/**
 * Recomendaciones de un valor. Solo las figuras vivas: rotas en las últimas 3 sesiones
 * (y sin haberse alejado demasiado) o formadas y pendientes de ruptura.
 */
export function recommendForInstrument(
  inst: InstrumentInput,
  stats: Partial<Record<PatternKey, PatternStats>>,
  regime: Regime,
  account: AccountView,
  /** Vela que hace de "hoy" (para el simulador). Por defecto, la última. */
  at?: number,
): Recommendation[] {
  const c = inst.candles;
  const last = at ?? c.length - 1;
  if (last < 30) return [];
  const close = c[last].c;
  const out: Recommendation[] = [];
  const trend = trendAt(inst.ind, c, last);
  const r = inst.ind.rsi14[last];

  for (const d of inst.detections) {
    const long = d.direction === "long";
    let live = false;
    if (d.status === "confirmed" && d.confirmIndex !== null && d.confirmIndex >= last - 3 && d.confirmIndex <= last) live = true;
    if (d.status === "forming" && d.formedAt >= last - 40 && at === undefined) live = true;
    if (!live) continue;

    // Para las confirmadas, se recalcula desde el precio actual: la entrada sería ahora.
    const entry = d.status === "confirmed" ? close : d.triggerPrice;
    const stop = d.stop;
    const target = d.target;
    if (long ? stop >= entry || target <= entry : stop <= entry || target >= entry) continue;
    const rr = Math.abs(target - entry) / Math.abs(entry - stop);
    const span = Math.abs(d.target - d.entry) || 1;
    const progress = d.status === "confirmed" ? ((long ? close - d.entry : d.entry - close) / span) : 0;
    if (progress > 0.6) continue; // Ya ha hecho casi todo el recorrido: llegar tarde no compensa.

    const pros: string[] = [...d.notes];
    const cons: string[] = [];
    const st = stats[d.pattern];
    const edge = st ? st.adjustedExpectancy : 0;
    let edgeScore = 50;
    if (st && st.trades >= 5) {
      edgeScore = clamp(50 + edge * 150);
      const line = `Historial en el IBEX: ${st.trades} operaciones, ${(st.winRate * 100).toFixed(0)} % de acierto, ${st.avgR >= 0 ? "+" : ""}${st.avgR.toFixed(2)} R de media`;
      (edge > 0.05 ? pros : cons).push(line);
    } else cons.push("Pocas operaciones en el historial para medir esta figura");

    const reversal = REVERSALS.includes(d.pattern);
    let trendScore = 60;
    if (trend === (long ? "up" : "down")) {
      trendScore = 100;
      pros.push(long ? "A favor de la tendencia de fondo del valor" : "A favor de la tendencia bajista del valor");
    } else if (trend === (long ? "down" : "up")) {
      trendScore = reversal ? 55 : 15;
      if (!reversal) cons.push("Contra la tendencia de fondo del valor");
    }
    let regimeScore = 60;
    if (regime === (long ? "alcista" : "bajista")) {
      regimeScore = 100;
      pros.push(`Mercado (IBEX 35) en fase ${regime}`);
    } else if (regime === (long ? "bajista" : "alcista")) {
      regimeScore = 20;
      cons.push(`Mercado (IBEX 35) en fase ${regime}: va en contra`);
    }
    const rrScore = clamp(((rr - 1) / 2) * 100);
    if (rr >= 2) pros.push(`Beneficio/riesgo de ${rr.toFixed(1)} a 1`);
    else if (rr < 1.3) cons.push(`Beneficio/riesgo bajo (${rr.toFixed(1)} a 1)`);
    if (d.volumeConfirmed) pros.push("Ruptura con volumen por encima de la media");
    else if (d.status === "confirmed") cons.push("Ruptura sin volumen destacado");

    // El historial pesa más que la geometría: una figura bonita que pierde dinero no vale.
    let score = 0.3 * d.quality + 0.35 * edgeScore + 0.15 * trendScore + 0.1 * regimeScore + 0.1 * rrScore;
    // Con una muestra amplia y resultado medio negativo, la figura queda vetada para entrar.
    const provenLoser = !!st && st.trades >= MIN_TRADES_FOR_VETO && st.avgR < 0;
    if (provenLoser) {
      score = Math.min(score, 45);
      cons.unshift(`Esta figura ha perdido dinero en el IBEX (${st!.trades} operaciones, ${st!.avgR.toFixed(2)} R de media): no se recomienda entrar`);
    }
    if (r !== null && (long ? r > 75 : r < 25)) {
      score -= 8;
      cons.push(long ? `RSI en sobrecompra (${r.toFixed(0)})` : `RSI en sobreventa (${r.toFixed(0)})`);
    }
    if (progress > 0.3) {
      score -= 10;
      cons.push(`El precio ya ha recorrido el ${(progress * 100).toFixed(0)} % del camino al objetivo`);
    }
    if (d.status === "forming") score -= 5;
    score = Math.round(clamp(score));

    const held = account.holdings[inst.symbol];
    let action: RecommendationAction;
    if (d.status === "forming") action = "vigilar";
    else if (long) action = "comprar";
    else action = account.allowShort ? "vender_corto" : "evitar";
    if (held && held !== d.direction && d.status === "confirmed") action = "cerrar";

    const sizing =
      action === "comprar" || action === "vender_corto" || action === "vigilar"
        ? positionSize({
            equity: account.equity,
            cash: account.cash,
            riskPct: account.riskPct,
            maxPositionPct: account.maxPositionPct,
            entry,
            stop,
            cost: account.cost,
          })
        : null;

    const strong = score >= account.minScore && !provenLoser;
    out.push({
      key: `${inst.symbol}:${d.pattern}:${d.startIndex}:${isoDay(c[d.startIndex].t)}`,
      symbol: inst.symbol,
      name: inst.name,
      pattern: d.pattern,
      patternName: PATTERN_NAMES[d.pattern],
      direction: d.direction,
      action,
      strong,
      status: d.status,
      asOf: isoDay(c[last].t),
      signalDate: d.confirmIndex !== null ? isoDay(c[d.confirmIndex].t) : null,
      lastClose: close,
      entry,
      stop,
      target,
      rr,
      quality: Math.round(d.quality),
      score,
      progress: Math.max(0, progress),
      pros,
      cons,
      sizing,
      history: st ? { trades: st.trades, winRate: st.winRate, avgR: st.avgR } : null,
      maxHoldDays: maxHoldBars(d),
      plan: provenLoser && action !== "cerrar" && action !== "evitar"
        ? `No recomendada: el ${PATTERN_NAMES[d.pattern].toLowerCase()} ha dado pérdidas en el IBEX (${st!.trades} operaciones, ${(st!.winRate * 100).toFixed(0)} % de acierto, ${st!.avgR.toFixed(2)} R de media). Aunque la figura esté bien formada, la estadística no acompaña.`
        : planText(action, inst.name, d, entry, stop, target, rr, sizing, account, strong),
      vetoed: provenLoser,
    });
  }
  return out;
}

function planText(
  action: RecommendationAction,
  name: string,
  d: Detection,
  entry: number,
  stop: number,
  target: number,
  rr: number,
  s: Sizing | null,
  account: AccountView,
  strong: boolean,
) {
  const long = d.direction === "long";
  const weak = strong ? "" : " Señal por debajo de tu umbral de puntuación: mejor solo observarla.";
  if (action === "cerrar")
    return `Tienes posición en ${name} y acaba de aparecer un ${PATTERN_NAMES[d.pattern].toLowerCase()} en contra. Plantéate cerrarla o subir el stop a ${eur(stop)}.`;
  if (action === "evitar")
    return `Señal bajista confirmada en ${name} (${PATTERN_NAMES[d.pattern].toLowerCase()}). No abras compras; si ya tienes acciones, valora venderlas. Objetivo de la caída: ${eur(target)}. Si cierra por encima de ${eur(stop)}, la señal se anula.${weak}`;
  if (!s || s.quantity === 0)
    return `Señal en ${name}, pero con tu efectivo y tus límites de riesgo no sale un tamaño mínimo de posición.`;
  const verb = long ? "Compra" : "Vende en corto";
  const risk = s.riskAmount;
  const gain = s.quantity * Math.abs(target - entry);
  const head =
    action === "vigilar"
      ? `Si ${name} cierra ${long ? "por encima" : "por debajo"} de ${eur(entry)}: ${verb.toLowerCase()} ${s.quantity} acciones (≈ ${eur0(s.notional)}).`
      : `${verb} ${s.quantity} acciones de ${name} (≈ ${eur0(s.notional)}) a la apertura de la próxima sesión.`;
  return (
    `${head} Stop en ${eur(stop)}: si salta pierdes ≈ ${eur0(risk)} (${((risk / account.equity) * 100).toFixed(1)} % de la cartera). ` +
    `Objetivo en ${eur(target)}: ≈ +${eur0(gain)} (${rr.toFixed(1)} a 1).` +
    (s.limitedBy && s.limitedBy !== "riesgo" ? ` Tamaño limitado por ${s.limitedBy}.` : "") +
    weak
  );
}

/** Ordena: primero lo accionable y fuerte, luego por puntuación. */
export function rankRecommendations(list: Recommendation[]) {
  const weight: Record<RecommendationAction, number> = { cerrar: 0, comprar: 1, vender_corto: 1, evitar: 2, vigilar: 3 };
  return [...list].sort(
    (a, b) => Number(b.strong) - Number(a.strong) || weight[a.action] - weight[b.action] || b.score - a.score,
  );
}
