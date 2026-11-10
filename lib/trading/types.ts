// lib/trading/types.ts
// Tipos compartidos del módulo de trading. Sin dependencias: se usan en servidor, cliente y tests.

/** Vela diaria. `t` es la fecha de la sesión en milisegundos UTC (00:00). */
export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export type Direction = "long" | "short";

export type PatternKey =
  | "hch"
  | "hch_inv"
  | "double_top"
  | "double_bottom"
  | "triangle_asc"
  | "triangle_desc"
  | "triangle_sym"
  | "flag_bull"
  | "flag_bear"
  | "range_up"
  | "range_down";

export type Pivot = {
  /** Índice de la vela donde está el extremo. */
  i: number;
  price: number;
  kind: "H" | "L";
  /** Índice de la vela en la que el giro quedó confirmado (sin mirar el futuro). */
  confirmedAt: number;
};

export type ChartPoint = { i: number; price: number; label?: string };
export type ChartLine = { from: ChartPoint; to: ChartPoint; label: string; role: "trigger" | "support" | "resistance" | "pole" };

/**
 * Figura ya formada y a la espera de ruptura. La ruptura (cierre más allá de `trigger`) es la entrada;
 * tocar `invalidation` antes de romper la anula.
 */
export type Setup = {
  pattern: PatternKey;
  direction: Direction;
  /** Primera vela de la figura. */
  startIndex: number;
  /** Vela en la que la figura queda reconocible (se confirma su último pivote). */
  formedAt: number;
  points: ChartPoint[];
  lines: ChartLine[];
  /** Línea de disparo: precio en el índice i = p0 + (p1 - p0) * (i - i0) / (i1 - i0). */
  trigger: { i0: number; p0: number; i1: number; p1: number };
  /** Nivel que anula la figura y donde va el stop. */
  invalidation: number;
  /** Altura de la figura: lo que se proyecta desde la ruptura para el objetivo. */
  height: number;
  /** Velas máximas que se espera la ruptura desde `formedAt`. */
  expiresAfter: number;
  /** 0-100: calidad geométrica y de contexto de la figura. */
  quality: number;
  notes: string[];
};

export type SetupStatus = "forming" | "confirmed" | "invalidated" | "expired";

export type Detection = Setup & {
  status: SetupStatus;
  /** Vela del cierre de ruptura. */
  confirmIndex: number | null;
  /** Precio de disparo en la vela actual (o en la de ruptura si ya rompió). */
  triggerPrice: number;
  entry: number;
  stop: number;
  target: number;
  /** Beneficio esperado / riesgo asumido. */
  rr: number;
  /** La vela de ruptura tuvo volumen por encima de la media. */
  volumeConfirmed: boolean;
};

export type TradeOutcome = {
  pattern: PatternKey;
  direction: Direction;
  entryIndex: number;
  exitIndex: number;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  reason: "stop" | "target" | "time" | "open";
  /** Resultado en múltiplos del riesgo inicial, ya con costes. */
  r: number;
  /** Resultado porcentual sobre el precio de entrada, ya con costes. */
  pct: number;
  bars: number;
  quality: number;
};

export type PatternStats = {
  pattern: PatternKey;
  trades: number;
  wins: number;
  winRate: number;
  avgR: number;
  /** Esperanza en R reducida según el tamaño de la muestra (para no fiarse de 5 operaciones). */
  adjustedExpectancy: number;
  profitFactor: number | null;
  avgBars: number;
  avgPct: number;
  maxDrawdownR: number;
  bestR: number;
  worstR: number;
};
