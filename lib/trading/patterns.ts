// lib/trading/patterns.ts
// Detectores de figuras chartistas sobre los pivotes del zigzag.
// Cada detector mira la cola de pivotes conocida en un momento dado y, si la geometría encaja,
// devuelve un Setup: la figura, su línea de disparo, su nivel de invalidación y su altura.
// `evaluateSetup` sigue después las velas para ver si rompió, se anuló o caducó.
import { atrAt, avgVolumeBefore, type IndicatorBundle } from "./indicators";
import type { Candle, ChartPoint, Detection, Direction, PatternKey, Pivot, Setup } from "./types";

type Ctx = { c: Candle[]; ind: IndicatorBundle };
type Line = { i0: number; p0: number; i1: number; p1: number };

export function lineAt(l: Line, i: number) {
  if (l.i1 === l.i0) return l.p0;
  return l.p0 + ((l.p1 - l.p0) * (i - l.i0)) / (l.i1 - l.i0);
}
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const pt = (p: Pivot, label: string): ChartPoint => ({ i: p.i, price: p.price, label });

function avgVol(c: Candle[], center: number, half = 2) {
  let s = 0;
  let n = 0;
  for (let k = Math.max(0, center - half); k <= Math.min(c.length - 1, center + half); k++) {
    s += c[k].v;
    n++;
  }
  return n ? s / n : 0;
}

/** ¿Los pivotes de la cola alternan exactamente con el patrón de tipos pedido? */
function kinds(tail: Pivot[], pattern: string) {
  if (tail.length !== pattern.length) return false;
  return tail.every((p, k) => p.kind === pattern[k]);
}

// ---------------------------------------------------------------------------
// Hombro-cabeza-hombro (s = +1, techo bajista) y su versión invertida (s = -1, suelo alcista).
// En el "espacio con signo" (precio · s) los dos son la misma figura de techo.
// ---------------------------------------------------------------------------
function headAndShoulders(ctx: Ctx, piv: Pivot[], s: 1 | -1): Setup | null {
  if (piv.length < 5) return null;
  const tail = piv.slice(-5);
  if (!kinds(tail, s === 1 ? "HLHLH" : "LHLHL")) return null;
  const [ls, n1, hd, n2, rs] = tail;
  const prior = piv.length >= 6 ? piv[piv.length - 6] : null;
  const v = (p: Pivot) => s * p.price;
  const neck: Line = { i0: n1.i, p0: n1.price, i1: n2.i, p1: n2.price };
  const neckS = (i: number) => s * lineAt(neck, i);

  const height = v(hd) - neckS(hd.i);
  const a = atrAt(ctx.ind.atr14, ctx.c, hd.i);
  if (height < 1.5 * a || height < 0.03 * Math.abs(hd.price)) return null;
  if (v(hd) - Math.max(v(ls), v(rs)) < 0.12 * height) return null;
  if (v(ls) - neckS(ls.i) < 0.3 * height || v(rs) - neckS(rs.i) < 0.3 * height) return null;
  const shoulderGap = Math.abs(v(ls) - v(rs)) / height;
  if (shoulderGap > 0.5) return null;
  const neckSlope = Math.abs(n1.price - n2.price) / height;
  if (neckSlope > 0.6) return null;
  const d1 = hd.i - ls.i;
  const d2 = rs.i - hd.i;
  const timeRatio = d1 / Math.max(1, d2);
  if (timeRatio < 0.33 || timeRatio > 3) return null;
  const width = rs.i - ls.i;
  if (width < 10 || width > 260) return null;

  const notes: string[] = [];
  let q = 45;
  q += 15 * (1 - shoulderGap / 0.5);
  q += 10 * (1 - Math.abs(Math.log(timeRatio)) / Math.log(3));
  q += 10 * (1 - neckSlope / 0.6);
  if (prior && s * prior.price < Math.min(s * n1.price, s * n2.price)) {
    q += 10;
    notes.push(s === 1 ? "Aparece tras una subida previa (giro de techo)" : "Aparece tras una bajada previa (giro de suelo)");
  } else notes.push("Sin tendencia previa clara: la figura pierde fiabilidad");
  const volLs = avgVol(ctx.c, ls.i);
  const volRs = avgVol(ctx.c, rs.i);
  if (volRs < volLs) {
    q += 7;
    notes.push("El volumen del hombro derecho es menor que el del izquierdo");
  }
  if (shoulderGap < 0.15) notes.push("Hombros muy simétricos");

  return {
    pattern: s === 1 ? "hch" : "hch_inv",
    direction: s === 1 ? "short" : "long",
    startIndex: ls.i,
    formedAt: rs.confirmedAt,
    points: [pt(ls, "HI"), pt(n1, ""), pt(hd, "C"), pt(n2, ""), pt(rs, "HD")],
    lines: [
      {
        from: { i: n1.i, price: n1.price },
        to: { i: rs.i + Math.round(width * 0.4), price: lineAt(neck, rs.i + Math.round(width * 0.4)) },
        label: "Línea clavicular",
        role: "trigger",
      },
    ],
    trigger: neck,
    invalidation: rs.price,
    height,
    expiresAfter: Math.max(8, Math.round(width * 0.5)),
    quality: clamp(q),
    notes,
  };
}

// ---------------------------------------------------------------------------
// Doble techo (s = +1) y doble suelo (s = -1).
// ---------------------------------------------------------------------------
function doubleTop(ctx: Ctx, piv: Pivot[], s: 1 | -1): Setup | null {
  if (piv.length < 3) return null;
  const tail = piv.slice(-3);
  if (!kinds(tail, s === 1 ? "HLH" : "LHL")) return null;
  const [t1, m, t2] = tail;
  const prior = piv.length >= 4 ? piv[piv.length - 4] : null;
  const v = (p: Pivot) => s * p.price;
  const top = (v(t1) + v(t2)) / 2;
  const height = top - v(m);
  const a = atrAt(ctx.ind.atr14, ctx.c, t2.i);
  if (height < 2 * a || height < 0.04 * Math.abs(m.price)) return null;
  const gap = Math.abs(v(t1) - v(t2)) / height;
  if (gap > 0.22) return null;
  const sep = t2.i - t1.i;
  if (sep < 8 || sep > 160) return null;
  // La figura de giro necesita algo que girar: la pierna previa debe ser al menos tan larga como la figura.
  if (!prior || v(t1) - s * prior.price < 0.8 * height) return null;

  const notes: string[] = [];
  let q = 45 + 20 * (1 - gap / 0.22);
  if (sep >= 15 && sep <= 80) q += 8;
  const r1 = ctx.ind.rsi14[t1.i];
  const r2 = ctx.ind.rsi14[t2.i];
  if (r1 !== null && r2 !== null && s * (r1 - r2) > 2) {
    q += 12;
    notes.push(s === 1 ? "Divergencia bajista del RSI entre los dos techos" : "Divergencia alcista del RSI entre los dos suelos");
  }
  if (avgVol(ctx.c, t2.i) < avgVol(ctx.c, t1.i)) {
    q += 7;
    notes.push(s === 1 ? "Menos volumen en el segundo techo" : "Menos volumen en el segundo suelo");
  }
  const priorLeg = (v(t1) - s * prior.price) / height;
  if (priorLeg > 1.5) {
    q += 6;
    notes.push("Llega tras un movimiento previo amplio");
  }
  return {
    pattern: s === 1 ? "double_top" : "double_bottom",
    direction: s === 1 ? "short" : "long",
    startIndex: t1.i,
    formedAt: t2.confirmedAt,
    points: [pt(t1, s === 1 ? "T1" : "S1"), pt(m, ""), pt(t2, s === 1 ? "T2" : "S2")],
    lines: [
      {
        from: { i: m.i, price: m.price },
        to: { i: t2.i + Math.round(sep * 0.5), price: m.price },
        label: s === 1 ? "Soporte del valle" : "Resistencia del pico",
        role: "trigger",
      },
    ],
    trigger: { i0: m.i, p0: m.price, i1: m.i + 1, p1: m.price },
    invalidation: s === 1 ? Math.max(t1.price, t2.price) : Math.min(t1.price, t2.price),
    height,
    expiresAfter: Math.max(8, Math.round(sep * 0.6)),
    quality: clamp(q),
    notes,
  };
}

// ---------------------------------------------------------------------------
// Triángulos: ascendente (alcista), descendente (bajista) y simétrico (sigue la tendencia previa).
// ---------------------------------------------------------------------------
function triangle(ctx: Ctx, piv: Pivot[]): Setup | null {
  for (const n of [5, 4]) {
    if (piv.length < n) continue;
    const tail = piv.slice(-n);
    const highs = tail.filter((p) => p.kind === "H");
    const lows = tail.filter((p) => p.kind === "L");
    if (highs.length < 2 || lows.length < 2) continue;
    const hF = highs[0];
    const hL = highs[highs.length - 1];
    const lF = lows[0];
    const lL = lows[lows.length - 1];
    const upper: Line = { i0: hF.i, p0: hF.price, i1: hL.i, p1: hL.price };
    const lower: Line = { i0: lF.i, p0: lF.price, i1: lL.i, p1: lL.price };
    const start = tail[0].i;
    const last = tail[tail.length - 1];
    const width = last.i - start;
    if (width < 12 || width > 200) continue;
    const h0 = lineAt(upper, start) - lineAt(lower, start);
    const a = atrAt(ctx.ind.atr14, ctx.c, last.i);
    if (h0 < 2.5 * a || h0 < 0.04 * ctx.c[last.i].c) continue;
    const hEnd = lineAt(upper, last.i) - lineAt(lower, last.i);
    if (hEnd <= 0 || hEnd > 0.75 * h0) continue;
    // Los pivotes intermedios no deben salirse de las líneas.
    const tol = 0.12 * h0;
    if (highs.some((p) => p.price > lineAt(upper, p.i) + tol)) continue;
    if (lows.some((p) => p.price < lineAt(lower, p.i) - tol)) continue;

    const du = (hL.price - hF.price) / h0;
    const dl = (lL.price - lF.price) / h0;
    const flatU = Math.abs(du) <= 0.15;
    const flatL = Math.abs(dl) <= 0.15;
    let pattern: PatternKey | null = null;
    let direction: Direction = "long";
    if (flatU && dl >= 0.25) pattern = "triangle_asc";
    else if (flatL && du <= -0.25) {
      pattern = "triangle_desc";
      direction = "short";
    } else if (du <= -0.2 && dl >= 0.2) {
      pattern = "triangle_sym";
      const prior = piv.length > n ? piv[piv.length - n - 1] : null;
      if (!prior) continue;
      direction = prior.price < lineAt(lower, prior.i) ? "long" : "short";
    }
    if (!pattern) continue;

    // Ápice: donde se cruzan las dos líneas.
    const su = (upper.p1 - upper.p0) / Math.max(1, upper.i1 - upper.i0);
    const sl = (lower.p1 - lower.p0) / Math.max(1, lower.i1 - lower.i0);
    const apex = sl - su > 0 ? last.i + hEnd / (sl - su) : last.i + width;
    const toApex = Math.max(5, Math.min(40, Math.round((apex - last.i) * 0.75)));
    const lastH = highs[highs.length - 1];
    const lastLo = lows[lows.length - 1];
    const notes: string[] = [`${n} toques entre las dos líneas`];
    let q = 45 + (n === 5 ? 12 : 0) + 15 * (1 - hEnd / h0);
    if (pattern === "triangle_asc" || pattern === "triangle_desc") {
      q += 8;
      notes.push(pattern === "triangle_asc" ? "Resistencia horizontal y mínimos crecientes" : "Soporte horizontal y máximos decrecientes");
    }
    // El volumen tiende a secarse dentro del triángulo.
    if (avgVol(ctx.c, last.i, 3) < avgVol(ctx.c, start, 3)) {
      q += 6;
      notes.push("El volumen se va secando dentro de la figura");
    }
    const ext = last.i + toApex;
    return {
      pattern,
      direction,
      startIndex: start,
      formedAt: last.confirmedAt,
      points: tail.map((p) => pt(p, "")),
      lines: [
        { from: { i: hF.i, price: hF.price }, to: { i: ext, price: lineAt(upper, ext) }, label: "Resistencia", role: direction === "long" ? "trigger" : "resistance" },
        { from: { i: lF.i, price: lF.price }, to: { i: ext, price: lineAt(lower, ext) }, label: "Soporte", role: direction === "short" ? "trigger" : "support" },
      ],
      trigger: direction === "long" ? upper : lower,
      invalidation: direction === "long" ? lastLo.price : lastH.price,
      height: h0,
      expiresAfter: toApex,
      quality: clamp(q),
      notes,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bandera alcista (s = +1) y bajista (s = -1): mástil fuerte y una pausa corta en contra.
// ---------------------------------------------------------------------------
function flag(ctx: Ctx, piv: Pivot[], s: 1 | -1): Setup | null {
  if (piv.length < 3) return null;
  const tail = piv.slice(-3);
  if (!kinds(tail, s === 1 ? "LHL" : "HLH")) return null;
  const [a0, b, cc] = tail;
  const v = (p: Pivot) => s * p.price;
  const pole = v(b) - v(a0);
  const a = atrAt(ctx.ind.atr14, ctx.c, b.i);
  // El mástil empieza donde arranca de verdad la subida (no en el mínimo de una base lateral larga).
  let poleStart = b.i;
  while (poleStart > a0.i && s * ctx.c[poleStart - 1][s === 1 ? "l" : "h"] > v(a0) + 0.15 * pole) poleStart--;
  poleStart = Math.max(a0.i, poleStart - 1);
  const poleBars = b.i - poleStart;
  if (pole < 3.5 * a || pole < 0.06 * Math.abs(a0.price) || poleBars > 25 || poleBars < 2) return null;
  const pull = v(b) - v(cc);
  if (pull > 0.5 * pole || pull < 0.12 * pole) return null;
  const flagBars = cc.i - b.i;
  if (flagBars < 3 || flagBars > 25) return null;
  const speed = pole / a / poleBars;
  const notes: string[] = [`Mástil de ${poleBars} sesiones (${((pole / Math.abs(a0.price)) * 100).toFixed(1)} %)`];
  let q = 45 + 15 * (1 - pull / pole / 0.5) + clamp(speed * 20, 0, 15);
  const poleVol = avgVol(ctx.c, Math.round((a0.i + b.i) / 2), Math.ceil(poleBars / 2));
  const flagVol = avgVol(ctx.c, Math.round((b.i + cc.i) / 2), Math.ceil(flagBars / 2));
  if (flagVol < poleVol) {
    q += 10;
    notes.push("El volumen baja durante la bandera");
  }
  if (pull / pole < 0.38) notes.push("Retroceso corto (menos del 38 % del mástil)");
  return {
    pattern: s === 1 ? "flag_bull" : "flag_bear",
    direction: s === 1 ? "long" : "short",
    startIndex: a0.i,
    formedAt: cc.confirmedAt,
    points: [pt(a0, ""), pt(b, ""), pt(cc, "")],
    lines: [
      { from: { i: a0.i, price: a0.price }, to: { i: b.i, price: b.price }, label: "Mástil", role: "pole" },
      { from: { i: b.i, price: b.price }, to: { i: cc.i + 12, price: b.price }, label: "Ruptura", role: "trigger" },
    ],
    trigger: { i0: b.i, p0: b.price, i1: b.i + 1, p1: b.price },
    invalidation: cc.price,
    height: pole,
    expiresAfter: 15,
    quality: clamp(q),
    notes,
  };
}

// ---------------------------------------------------------------------------
// Rango lateral (rectángulo): se arma en las dos direcciones; la primera que rompe manda.
// ---------------------------------------------------------------------------
function range(ctx: Ctx, piv: Pivot[]): Setup[] {
  for (const n of [6, 5, 4]) {
    if (piv.length < n) continue;
    const tail = piv.slice(-n);
    const highs = tail.filter((p) => p.kind === "H").map((p) => p.price);
    const lows = tail.filter((p) => p.kind === "L").map((p) => p.price);
    if (highs.length < 2 || lows.length < 2) continue;
    const top = Math.max(...highs);
    const bottom = Math.min(...lows);
    const height = top - bottom;
    const last = tail[tail.length - 1];
    const start = tail[0].i;
    const width = last.i - start;
    const a = atrAt(ctx.ind.atr14, ctx.c, last.i);
    if (width < 15 || width > 250) continue;
    if (height < 2.5 * a || height < 0.04 * bottom) continue;
    const spreadH = (top - Math.min(...highs)) / height;
    const spreadL = (Math.max(...lows) - bottom) / height;
    if (spreadH > 0.18 || spreadL > 0.18) continue;
    const mid = (top + bottom) / 2;
    const q = clamp(42 + (n - 4) * 6 + 15 * (1 - (spreadH + spreadL) / 0.36));
    const ext = last.i + 15;
    const base = {
      startIndex: start,
      formedAt: last.confirmedAt,
      points: tail.map((p) => pt(p, "")),
      height,
      expiresAfter: 25,
      quality: q,
      notes: [`${n} toques en los bordes del rango`, `Rango de ${width} sesiones`],
    };
    const lines = [
      { from: { i: start, price: top }, to: { i: ext, price: top }, label: "Techo del rango" },
      { from: { i: start, price: bottom }, to: { i: ext, price: bottom }, label: "Suelo del rango" },
    ];
    return [
      {
        ...base,
        pattern: "range_up",
        direction: "long",
        lines: [
          { ...lines[0], role: "trigger" },
          { ...lines[1], role: "support" },
        ],
        trigger: { i0: start, p0: top, i1: start + 1, p1: top },
        // Se anula si rompe por abajo; el stop de la operación va a mitad de rango.
        invalidation: bottom,
        stop: mid,
      } as Setup & { stop: number },
      {
        ...base,
        pattern: "range_down",
        direction: "short",
        lines: [
          { ...lines[0], role: "resistance" },
          { ...lines[1], role: "trigger" },
        ],
        trigger: { i0: start, p0: bottom, i1: start + 1, p1: bottom },
        invalidation: top,
        stop: mid,
      } as Setup & { stop: number },
    ];
  }
  return [];
}

/** Todas las figuras que encajan con la cola de pivotes `piv`. */
export function detectOnTail(ctx: Ctx, piv: Pivot[]): Setup[] {
  const out: Setup[] = [];
  for (const s of [1, -1] as const) {
    const h = headAndShoulders(ctx, piv, s);
    if (h) out.push(h);
    const d = doubleTop(ctx, piv, s);
    if (d) out.push(d);
    const f = flag(ctx, piv, s);
    if (f) out.push(f);
  }
  const t = triangle(ctx, piv);
  if (t) out.push(t);
  out.push(...range(ctx, piv));
  return out;
}

/**
 * Recorre los pivotes en orden y lanza los detectores cada vez que se confirma uno nuevo.
 * Solo devuelve figuras que quedaron formadas a partir de la vela `fromIndex`.
 */
export function findSetups(c: Candle[], ind: IndicatorBundle, pivots: Pivot[], fromIndex = 0): Setup[] {
  const ctx = { c, ind };
  const out: Setup[] = [];
  const seen = new Set<string>();
  for (let j = 0; j < pivots.length; j++) {
    if (pivots[j].confirmedAt < fromIndex) continue;
    for (const st of detectOnTail(ctx, pivots.slice(0, j + 1))) {
      const key = `${st.pattern}:${st.startIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(st);
    }
  }
  return out;
}

/** Sigue un setup vela a vela hasta `upto` (incluida) y calcula entrada, stop y objetivo. */
export function evaluateSetup(st: Setup & { stop?: number }, c: Candle[], ind: IndicatorBundle, upto: number): Detection | null {
  const long = st.direction === "long";
  let status: Detection["status"] = "forming";
  let confirmIndex: number | null = null;
  const end = Math.min(upto, c.length - 1);
  for (let i = st.formedAt; i <= end; i++) {
    if (i > st.formedAt + st.expiresAfter) {
      status = "expired";
      break;
    }
    const trig = lineAt(st.trigger, i);
    const bar = c[i];
    if (long ? bar.l <= st.invalidation : bar.h >= st.invalidation) {
      // Si la misma vela rompe y cierra fuera, cuenta como ruptura; si no, la figura queda anulada.
      if (long ? bar.c > trig && bar.l > (st.stop ?? st.invalidation) : bar.c < trig && bar.h < (st.stop ?? st.invalidation)) {
        status = "confirmed";
        confirmIndex = i;
      } else status = "invalidated";
      break;
    }
    if (long ? bar.c > trig : bar.c < trig) {
      status = "confirmed";
      confirmIndex = i;
      break;
    }
  }
  const at = confirmIndex ?? end;
  const triggerPrice = lineAt(st.trigger, at);
  const a = atrAt(ind.atr14, c, at);
  const entry = confirmIndex !== null ? c[confirmIndex].c : triggerPrice;
  let stop = st.stop ?? st.invalidation;
  // Stop mínimo de medio ATR para que el ruido diario no lo salte.
  if (long ? entry - stop < 0.5 * a : stop - entry < 0.5 * a) stop = long ? entry - 0.5 * a : entry + 0.5 * a;
  const target = long ? triggerPrice + st.height : triggerPrice - st.height;
  if (long ? target <= entry : target >= entry) return null;
  const rr = Math.abs(target - entry) / Math.abs(entry - stop);
  const volumeConfirmed = confirmIndex !== null && c[confirmIndex].v > 1.3 * avgVolumeBefore(c, confirmIndex);
  return {
    ...st,
    status,
    confirmIndex,
    triggerPrice,
    entry,
    stop,
    target,
    rr,
    volumeConfirmed,
    quality: clamp(st.quality + (volumeConfirmed ? 6 : 0)),
  };
}
