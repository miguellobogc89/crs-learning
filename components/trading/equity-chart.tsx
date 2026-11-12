"use client";
// Gráfico de patrimonio: área con degradado, línea del capital inicial, ejes con valores
// y fechas, selector de periodo y detalle del día al pasar el ratón.
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { eur, eur0, pct } from "./format";

type Point = { day: string; equity: number };

/** Día de hoy en Madrid (AAAA-MM-DD). */
const todayMadrid = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

/**
 * Las curvas guardadas son de cierre (un punto por sesión). Se añade el patrimonio de ahora como
 * punto de hoy para que la línea se mueva durante el día; al cierre lo sustituye el definitivo.
 */
export function withLivePoint(points: Point[], equityNow: number | null | undefined): Point[] {
  if (equityNow === null || equityNow === undefined || !Number.isFinite(equityNow) || !points.length) return points;
  const today = todayMadrid();
  const last = points[points.length - 1];
  if (last.day.slice(0, 10) >= today) return [...points.slice(0, -1), { day: last.day, equity: equityNow }];
  return [...points, { day: today, equity: equityNow }];
}

const RANGES = [
  { key: "1m", label: "1M", days: 31 },
  { key: "3m", label: "3M", days: 92 },
  { key: "6m", label: "6M", days: 183 },
  { key: "all", label: "Todo", days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const dayLabel = (d: string, long = false, intraday = false) =>
  new Intl.DateTimeFormat(
    "es-ES",
    intraday
      ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }
      : long
        ? { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
        : { day: "numeric", month: "short", timeZone: "UTC" },
  ).format(new Date(d));

/** Cuatro valores redondos para el eje vertical. */
function ticks(lo: number, hi: number) {
  const span = hi - lo || Math.abs(hi) * 0.02 || 1;
  const raw = span / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step * 0.01; v += step) out.push(v);
  return out;
}

export function EquityChart({
  points,
  initial,
  height = 260,
  ranges = true,
  bare = false,
  fill = false,
  intraday = false,
  balanceOnly = false,
  empty = "El gráfico se dibuja con el cierre de cada sesión a partir de que la cartera tenga actividad.",
}: {
  points: Point[];
  initial: number;
  height?: number;
  ranges?: boolean;
  /** Sin ejes ni textos: solo la línea (tarjetas pequeñas). */
  bare?: boolean;
  /** Ajusta la gráfica a la altura disponible del contenedor en lugar de imponer una altura fija. */
  fill?: boolean;
  /** Hora en puntos y ejes; posición horizontal proporcional al tiempo transcurrido. */
  intraday?: boolean;
  /** Gráfico de saldo real: no presentar ingresos y retiradas como rentabilidad. */
  balanceOnly?: boolean;
  empty?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [measuredHeight, setMeasuredHeight] = useState(height);
  const [range, setRange] = useState<RangeKey>("all");
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setWidth(Math.max(bare ? 1 : 240, Math.round(e.contentRect.width)));
      if (fill) setMeasuredHeight(Math.max(1, Math.round(e.contentRect.height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [bare, fill]);

  const shown = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!;
    if (!Number.isFinite(r.days) || points.length < 2) return points;
    const from = new Date(points[points.length - 1].day).getTime() - r.days * 86_400_000;
    const cut = points.filter((p) => new Date(p.day).getTime() >= from);
    return cut.length >= 2 ? cut : points.slice(-2);
  }, [points, range]);

  if (points.length < 2) return <p className="px-6 py-8 text-sm text-slate-500">{empty}</p>;

  const pad = bare ? { l: 4, r: 6, t: 6, b: 4 } : { l: balanceOnly ? 88 : 56, r: 16, t: 14, b: 26 };
  const w = width;
  const h = fill ? measuredHeight : height;
  const base = shown[0].equity;
  const vals = shown.map((p) => p.equity).concat(range === "all" ? [initial] : []);
  const yt = ticks(Math.min(...vals), Math.max(...vals));
  // La mini gráfica no tiene ejes: escala con los extremos reales y deja aire arriba y abajo.
  // Los ticks redondeados pueden terminar por debajo del máximo y recortar los picos.
  const min = Math.min(...shown.map((p) => p.equity));
  const max = Math.max(...shown.map((p) => p.equity));
  const span = max - min || Math.abs(max) * 0.01 || 1;
  const lo = bare ? min - span * 0.15 : Math.min(yt[0], Math.min(...vals) - span * 0.08);
  const hi = bare ? max + span * 0.15 : Math.max(yt[yt.length - 1], Math.max(...vals) + span * 0.12);
  const startAt = new Date(shown[0].day).getTime();
  const endAt = new Date(shown[shown.length - 1].day).getTime();
  const duration = Math.max(1, endAt - startAt);
  const x = (i: number) => pad.l + (
    intraday ? (new Date(shown[i].day).getTime() - startAt) / duration : i / (shown.length - 1)
  ) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (h - pad.t - pad.b);
  const line = shown.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join("");
  const last = shown[shown.length - 1].equity;
  const ref = range === "all" ? initial : base;
  const up = last >= ref;
  const col = balanceOnly ? "#2563eb" : up ? "#16a34a" : "#dc2626";
  const grad = `eq-${uid}`;
  const xIdx = shown.length <= 4 ? shown.map((_, i) => i) : [0, Math.round((shown.length - 1) / 3), Math.round(((shown.length - 1) * 2) / 3), shown.length - 1];
  const hp = hover !== null ? shown[hover] : null;
  const change = ((last - ref) / (ref || 1)) * 100;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const fraction = Math.max(0, Math.min(1, (px - pad.l) / (w - pad.l - pad.r)));
    if (intraday) {
      const target = startAt + fraction * duration;
      let lo = 0;
      let hi = shown.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (new Date(shown[mid].day).getTime() < target) lo = mid + 1;
        else hi = mid;
      }
      const before = Math.max(0, lo - 1);
      setHover(Math.abs(new Date(shown[before].day).getTime() - target) < Math.abs(new Date(shown[lo].day).getTime() - target) ? before : lo);
    } else {
      setHover(Math.max(0, Math.min(shown.length - 1, Math.round(fraction * (shown.length - 1)))));
    }
  };

  return (
    <div className={bare ? "" : fill ? "flex h-full min-h-0 flex-col px-2 pb-2 pt-2" : "px-4 pb-4 pt-2"}>
      {!bare && (
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-2">
        <div className="text-sm text-slate-500">
          {hp ? (
            <>
              <b className="text-base font-semibold tabular-nums text-slate-900">{balanceOnly ? eur(hp.equity, 2) : eur0(hp.equity)}</b> · {dayLabel(hp.day, true, intraday)}
              {!balanceOnly && <> · <span className={hp.equity >= ref ? "text-emerald-700" : "text-red-700"}>{pct(((hp.equity - ref) / (ref || 1)) * 100)}</span></>}
            </>
          ) : (
            <>
              {balanceOnly ? (
                <span className="font-medium text-slate-600">Evolución del saldo en euros</span>
              ) : (
                <>
                  <b className={`font-semibold tabular-nums ${up ? "text-emerald-700" : "text-red-700"}`}>{pct(change)}</b>{" "}
                  {range === "all" ? "desde el capital inicial" : "en el periodo"}
                </>
              )}
            </>
          )}
        </div>
        {ranges && (
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${range === r.key ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
      )}
      <div ref={box} className={fill ? "min-h-0 w-full flex-1" : "w-full"}>
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          className={fill ? "block h-full w-full touch-none select-none" : "block max-w-full touch-none select-none"}
          role="img"
          aria-label="Evolución del patrimonio"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={grad} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={col} stopOpacity="0.22" />
              <stop offset="100%" stopColor={col} stopOpacity="0" />
            </linearGradient>
          </defs>
          {!bare && yt.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="#f1f5f9" />
              <text x={pad.l - 8} y={y(v) + 3.5} fontSize="11" fill="#94a3b8" textAnchor="end">
                {balanceOnly ? eur(v, 2) : eur0(v)}
              </text>
            </g>
          ))}
          {!bare && !balanceOnly && range === "all" && initial >= lo && initial <= hi && (
            <g>
              <line x1={pad.l} x2={w - pad.r} y1={y(initial)} y2={y(initial)} stroke="#94a3b8" strokeDasharray="4 4" />
              <text x={w - pad.r} y={y(initial) - 5} fontSize="10" fill="#64748b" textAnchor="end">
                capital inicial
              </text>
            </g>
          )}
          <path d={`${line}L${x(shown.length - 1)},${h - pad.b}L${x(0)},${h - pad.b}Z`} fill={`url(#${grad})`} />
          <path d={line} fill="none" stroke={col} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          {!bare && xIdx.map((i, k) => (
            <text key={i} x={x(i)} y={h - 6} fontSize="11" fill="#94a3b8" textAnchor={k === 0 ? "start" : k === xIdx.length - 1 ? "end" : "middle"}>
              {dayLabel(shown[i].day, false, intraday)}
            </text>
          ))}
          {hover !== null && hp ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={h - pad.b} stroke="#cbd5e1" />
              <circle cx={x(hover)} cy={y(hp.equity)} r={5} fill="white" stroke={col} strokeWidth={2.5} />
            </g>
          ) : (
            <circle cx={x(shown.length - 1)} cy={y(last)} r={4} fill={col} />
          )}
        </svg>
      </div>
    </div>
  );
}

/** Versión compacta (sin selector de periodo), para las tarjetas y fichas de los agentes. */
export function EquityCurve({ points, initial, height = 180, empty }: { points: Point[]; initial: number; height?: number; empty?: string }) {
  return <EquityChart points={points} initial={initial} height={height} ranges={false} bare={height < 120} empty={empty} />;
}
