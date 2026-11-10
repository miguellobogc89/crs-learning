"use client";
// Gráfico de velas en SVG, sin dependencias: velas, volumen, medias, figuras y niveles de la operación.
import { useEffect, useMemo, useRef, useState } from "react";
import { dayFmt, int, num } from "./format";

export type ChartCandle = { day: string; o: number; h: number; l: number; c: number; v: number };
export type ChartOverlay = {
  points: { day: string; price: number; label?: string }[];
  lines: { from: { day: string; price: number }; to: { day: string; price: number }; label: string; role: string }[];
  direction: "long" | "short";
  confirmDay?: string | null;
};
export type ChartLevel = { price: number; label: string; kind: "entry" | "stop" | "target" };

const RANGES = [
  { key: "3M", bars: 65 },
  { key: "6M", bars: 130 },
  { key: "1A", bars: 255 },
  { key: "2A", bars: 520 },
] as const;

const PAD = { top: 12, right: 64, bottom: 22, left: 8 };

function businessDaysBetween(from: string, to: string) {
  let t = Date.parse(from);
  const end = Date.parse(to);
  let n = 0;
  while (t < end) {
    t += 86_400_000;
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}

export function CandleChart({
  candles,
  sma50,
  sma200,
  overlay,
  levels = [],
  height = 420,
  defaultRange = "6M",
}: {
  candles: ChartCandle[];
  sma50?: (number | null)[];
  sma200?: (number | null)[];
  overlay?: ChartOverlay | null;
  levels?: ChartLevel[];
  height?: number;
  defaultRange?: (typeof RANGES)[number]["key"];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>(defaultRange);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const indexOf = useMemo(() => {
    const m = new Map(candles.map((c, i) => [c.day, i]));
    const last = candles[candles.length - 1]?.day;
    return (day: string) => m.get(day) ?? (last && day > last ? candles.length - 1 + businessDaysBetween(last, day) : -1);
  }, [candles]);

  // Si hay una figura, la vista arranca como mínimo en su primer punto.
  const bars = RANGES.find((r) => r.key === range)!.bars;
  const overlayStart = overlay?.points.length ? Math.min(...overlay.points.map((p) => indexOf(p.day)).filter((i) => i >= 0)) : Infinity;
  const from = Math.max(0, Math.min(candles.length - bars, Number.isFinite(overlayStart) ? overlayStart - 15 : Infinity));
  const overlayEnd = overlay ? Math.max(0, ...overlay.lines.map((l) => indexOf(l.to.day))) : 0;
  const to = Math.max(candles.length - 1, Math.min(overlayEnd, candles.length - 1 + 25)) + 3;
  const view = candles.slice(from);

  const priceH = height - PAD.top - PAD.bottom;
  const volH = Math.round(priceH * 0.16);
  const plotH = priceH - volH - 6;
  const plotW = width - PAD.left - PAD.right;
  const step = plotW / Math.max(1, to - from + 1);
  const x = (i: number) => PAD.left + (i - from + 0.5) * step;

  const values: number[] = [];
  for (const c of view) values.push(c.h, c.l);
  for (const l of levels) values.push(l.price);
  if (overlay) for (const l of overlay.lines) values.push(l.from.price, l.to.price);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  const padP = (hi - lo) * 0.06 || hi * 0.02;
  lo -= padP;
  hi += padP;
  const y = (p: number) => PAD.top + ((hi - p) / (hi - lo)) * plotH;
  const maxV = Math.max(1, ...view.map((c) => c.v));
  const vy0 = PAD.top + plotH + 6 + volH;

  const ticks = useMemo(() => {
    const raw = (hi - lo) / 6;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const stepP = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
    const out: number[] = [];
    for (let p = Math.ceil(lo / stepP) * stepP; p <= hi; p += stepP) out.push(p);
    return out;
  }, [lo, hi]);

  const monthTicks = useMemo(() => {
    const out: { i: number; label: string }[] = [];
    let prev = "";
    view.forEach((c, k) => {
      const m = c.day.slice(0, 7);
      if (m !== prev) {
        prev = m;
        out.push({
          i: from + k,
          label: new Intl.DateTimeFormat("es-ES", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(c.day)),
        });
      }
    });
    const every = Math.ceil(out.length / Math.max(1, Math.floor(plotW / 70)));
    return out.filter((_, k) => k % every === 0);
  }, [view, from, plotW]);

  const path = (series?: (number | null)[]) => {
    if (!series) return "";
    let d = "";
    let pen = false;
    for (let i = from; i < candles.length; i++) {
      const v = series[i];
      if (v === null || v === undefined) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const hc = hover !== null ? candles[hover] : candles[candles.length - 1];
  const hcPrev = hover !== null ? candles[hover - 1] : candles[candles.length - 2];
  const bodyW = Math.max(1, Math.min(9, step * 0.65));
  const levelColor = { entry: "#2563eb", stop: "#dc2626", target: "#059669" } as const;
  const roleColor = (role: string) =>
    role === "trigger" ? "#2563eb" : role === "pole" ? "#94a3b8" : role === "support" ? "#059669" : "#dc2626";

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - PAD.left) / step) + from;
    setHover(i >= from && i < candles.length ? i : null);
  };

  if (!candles.length)
    return <div className={`flex items-center justify-center text-sm text-slate-500`} style={{ height }}>Sin cotizaciones todavía.</div>;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
          <span className="font-medium text-slate-900">{dayFmt(hc?.day)}</span>
          <span>A {num(hc?.o, 3)}</span>
          <span>Máx {num(hc?.h, 3)}</span>
          <span>Mín {num(hc?.l, 3)}</span>
          <span>
            C <b className="text-slate-900">{num(hc?.c, 3)}</b>
            {hc && hcPrev && (
              <span className={hc.c >= hcPrev.c ? " text-emerald-700" : " text-red-700"}>
                {" "}
                ({hc.c >= hcPrev.c ? "+" : ""}
                {num(((hc.c - hcPrev.c) / hcPrev.c) * 100, 2)} %)
              </span>
            )}
          </span>
          <span>Vol {hc ? int(hc.v) : "—"}</span>
          <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-amber-500" /> Media 50</span>
          <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-violet-500" /> Media 200</span>
        </div>
        <div className="flex border border-slate-200">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`px-2.5 py-1 text-xs ${range === r.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>
      <div ref={box} className="w-full">
        <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block select-none">
          {ticks.map((p) => (
            <g key={p}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(p)} y2={y(p)} stroke="#f1f5f9" />
              <text x={width - PAD.right + 6} y={y(p) + 3} fontSize="10" fill="#64748b">
                {num(p, p < 20 ? 2 : 1)}
              </text>
            </g>
          ))}
          {monthTicks.map((m) => (
            <text key={m.i} x={x(m.i)} y={height - 6} fontSize="10" fill="#94a3b8" textAnchor="middle">
              {m.label}
            </text>
          ))}
          {view.map((c, k) => {
            const i = from + k;
            const up = c.c >= c.o;
            const col = up ? "#059669" : "#dc2626";
            const vh = (c.v / maxV) * volH;
            return (
              <g key={c.day}>
                <rect x={x(i) - bodyW / 2} y={vy0 - vh} width={bodyW} height={vh} fill={up ? "#a7f3d0" : "#fecaca"} />
                <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1} />
                <rect
                  x={x(i) - bodyW / 2}
                  y={y(Math.max(c.o, c.c))}
                  width={bodyW}
                  height={Math.max(1, Math.abs(y(c.o) - y(c.c)))}
                  fill={up ? "#ffffff" : col}
                  stroke={col}
                  strokeWidth={1}
                />
              </g>
            );
          })}
          <path d={path(sma50)} fill="none" stroke="#f59e0b" strokeWidth={1.3} />
          <path d={path(sma200)} fill="none" stroke="#8b5cf6" strokeWidth={1.3} />

          {overlay && (
            <g>
              <polyline
                points={overlay.points.map((p) => `${x(indexOf(p.day))},${y(p.price)}`).join(" ")}
                fill="none"
                stroke={overlay.direction === "long" ? "#059669" : "#dc2626"}
                strokeWidth={1.6}
                strokeOpacity={0.55}
              />
              {overlay.lines.map((l, k) => (
                <g key={k}>
                  <line
                    x1={x(indexOf(l.from.day))}
                    y1={y(l.from.price)}
                    x2={x(indexOf(l.to.day))}
                    y2={y(l.to.price)}
                    stroke={roleColor(l.role)}
                    strokeWidth={1.6}
                    strokeDasharray={l.role === "trigger" ? undefined : "5 3"}
                  />
                  <text x={x(indexOf(l.to.day)) - 4} y={y(l.to.price) - 5} fontSize="10" fill={roleColor(l.role)} textAnchor="end">
                    {l.label}
                  </text>
                </g>
              ))}
              {overlay.points.map((p, k) => (
                <g key={k}>
                  <circle cx={x(indexOf(p.day))} cy={y(p.price)} r={3.2} fill="#fff" stroke="#0f172a" strokeWidth={1.2} />
                  {p.label && (
                    <text x={x(indexOf(p.day))} y={y(p.price) - 8} fontSize="10" fontWeight={600} fill="#0f172a" textAnchor="middle">
                      {p.label}
                    </text>
                  )}
                </g>
              ))}
              {overlay.confirmDay && indexOf(overlay.confirmDay) >= from && (
                <g>
                  <line
                    x1={x(indexOf(overlay.confirmDay))}
                    x2={x(indexOf(overlay.confirmDay))}
                    y1={PAD.top}
                    y2={PAD.top + plotH}
                    stroke="#2563eb"
                    strokeOpacity={0.3}
                    strokeDasharray="2 3"
                  />
                  <text x={x(indexOf(overlay.confirmDay)) + 4} y={PAD.top + 10} fontSize="10" fill="#2563eb">
                    Ruptura
                  </text>
                </g>
              )}
            </g>
          )}

          {levels.map((l, k) => (
            <g key={k}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(l.price)} y2={y(l.price)} stroke={levelColor[l.kind]} strokeDasharray="6 4" strokeWidth={1.2} />
              <rect x={width - PAD.right + 1} y={y(l.price) - 8} width={PAD.right - 2} height={16} fill={levelColor[l.kind]} />
              <text x={width - PAD.right + 5} y={y(l.price) + 3.5} fontSize="10" fill="#fff" fontWeight={600}>
                {num(l.price, l.price < 20 ? 3 : 2)}
              </text>
              <text x={PAD.left + 4} y={y(l.price) - 4} fontSize="10" fill={levelColor[l.kind]} fontWeight={600}>
                {l.label}
              </text>
            </g>
          ))}

          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={vy0} stroke="#94a3b8" strokeDasharray="3 3" />
          )}
        </svg>
      </div>
    </div>
  );
}

/** Esquema pequeño de una figura para la biblioteca. */
export function PatternSketch({
  points,
  trigger,
  direction,
}: {
  points: [number, number][];
  trigger: [[number, number], [number, number]];
  direction: "long" | "short";
}) {
  const w = 220;
  const h = 110;
  const sx = (v: number) => 8 + (v / 100) * (w - 16);
  const sy = (v: number) => 8 + (v / 100) * (h - 16);
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  return (
    <svg width={w} height={h} className="block">
      <polyline points={points.slice(0, -1).map(([a, b]) => `${sx(a)},${sy(b)}`).join(" ")} fill="none" stroke="#334155" strokeWidth={2} />
      <line x1={sx(prev[0])} y1={sy(prev[1])} x2={sx(last[0])} y2={sy(last[1])} stroke={direction === "long" ? "#059669" : "#dc2626"} strokeWidth={2} strokeDasharray="5 3" />
      <line x1={sx(trigger[0][0])} y1={sy(trigger[0][1])} x2={sx(trigger[1][0])} y2={sy(trigger[1][1])} stroke="#2563eb" strokeWidth={1.5} />
    </svg>
  );
}
