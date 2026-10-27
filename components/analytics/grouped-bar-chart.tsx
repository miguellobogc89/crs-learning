"use client";
import { useMemo, useState } from "react";
import { fmtMoney, fmtMoneyShort, fmtNumber } from "./format";

/** Units are passed by name (a server page cannot pass functions to this client component). */
const UNITS = {
  money: { value: fmtMoney, axis: fmtMoneyShort },
  kwh: { value: (n: number) => `${fmtNumber(n)} kWh`, axis: fmtNumber },
};

export type BarSeries = { key: string; label: string; color: string };
export type BarGroup = { key: string; label: string; values: Record<string, number> };

/**
 * Grouped vertical bars: one group per month, one bar per series (category). One y axis, recessive grid, 2px gaps
 * between bars, rounded data ends anchored on the baseline, a legend, a hover tooltip per group and a table view.
 */
export function GroupedBarChart({ groups, series, unit = "money", title, compact = false }: {
  groups: BarGroup[]; series: BarSeries[]; title: string; unit?: keyof typeof UNITS; compact?: boolean;
}) {
  const { value: format, axis: formatAxis } = UNITS[unit];
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const W = compact ? 560 : 760, H = compact ? 190 : 280, left = compact ? 48 : 56, right = 8, top = 10, bottom = 24;
  const { min, max, ticks } = useMemo(() => {
    const all = groups.flatMap(g => series.map(s => g.values[s.key] ?? 0));
    const hi = Math.max(0, ...all), lo = Math.min(0, ...all);
    const span = hi - lo || 1;
    const step = niceStep(span / 4);
    const max = Math.ceil(hi / step) * step || step, min = Math.floor(lo / step) * step;
    const ticks: number[] = [];
    for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
    return { min, max, ticks };
  }, [groups, series]);
  const plotW = W - left - right, plotH = H - top - bottom;
  const y = (v: number) => top + (max - v) / (max - min) * plotH;
  const groupW = plotW / Math.max(groups.length, 1);
  const inner = Math.min(groupW * 0.8, series.length * (compact ? 14 : 22));
  const gap = 2, barW = Math.max(2, (inner - gap * (series.length - 1)) / Math.max(series.length, 1));

  if (!groups.length || !series.length) return <p className="py-10 text-center text-sm text-slate-500">Todavía no hay datos para este gráfico.</p>;
  return <figure className={compact ? "space-y-2" : "space-y-3"}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ul className={compact ? "flex flex-wrap gap-x-3 gap-y-0.5" : "flex flex-wrap gap-x-4 gap-y-1"} aria-label="Leyenda">
        {series.length > 1 && series.map(s => <li key={s.key} className={(compact ? "text-[11px]" : "text-xs") + " flex items-center gap-1.5 text-slate-600"}>
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />{s.label}</li>)}
      </ul>
      <button type="button" onClick={() => setAsTable(v => !v)} className={(compact ? "text-[11px]" : "text-xs") + " font-medium text-[#0A58FF] hover:underline"}>
        {asTable ? "Ver gráfico" : "Ver como tabla"}</button>
    </div>
    {asTable ? <div className={compact ? "max-h-[190px] overflow-auto" : "overflow-x-auto"}><table className={(compact ? "text-xs" : "text-sm") + " w-full text-left"}>
      <caption className="sr-only">{title}</caption>
      <thead className="text-xs text-slate-500"><tr><th className="py-2 pr-4 font-semibold">Mes</th>
        {series.map(s => <th key={s.key} className="py-2 pr-4 text-right font-semibold">{s.label}</th>)}
        <th className="py-2 text-right font-semibold">Total</th></tr></thead>
      <tbody>{groups.map(g => <tr key={g.key} className="border-t border-slate-100">
        <td className="py-2 pr-4 text-slate-700">{g.label}</td>
        {series.map(s => <td key={s.key} className="py-2 pr-4 text-right tabular-nums text-slate-700">{format(g.values[s.key] ?? 0)}</td>)}
        <td className="py-2 text-right font-medium tabular-nums text-slate-900">{format(series.reduce((a, s) => a + (g.values[s.key] ?? 0), 0))}</td>
      </tr>)}</tbody>
    </table></div> : <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
        {ticks.map(t => <g key={t}>
          <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#94a3b8" : "#e2e8f0"} strokeWidth={1} />
          <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[11px]">{formatAxis(t)}</text>
        </g>)}
        {groups.map((g, gi) => {
          const x0 = left + gi * groupW + (groupW - inner) / 2;
          return <g key={g.key}>
            {hover === gi && <rect x={left + gi * groupW} y={top} width={groupW} height={plotH} fill="#f1f5f9" />}
            {series.map((s, si) => {
              const v = g.values[s.key] ?? 0;
              if (!v) return null;
              const y0 = y(0), y1 = y(v), h = Math.max(1, Math.abs(y1 - y0));
              return <path key={s.key} d={bar(x0 + si * (barW + gap), Math.min(y0, y1), barW, h, v >= 0)} fill={s.color} />;
            })}
            <text x={left + gi * groupW + groupW / 2} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">{g.label}</text>
            {/* Hit target: the whole month column, bigger than the bars. */}
            <rect x={left + gi * groupW} y={top} width={groupW} height={plotH + bottom} fill="transparent"
              onMouseEnter={() => setHover(gi)} onFocus={() => setHover(gi)} tabIndex={0} aria-label={`${g.label}: ${series.map(s => `${s.label} ${format(g.values[s.key] ?? 0)}`).join(", ")}`} />
          </g>;
        })}
      </svg>
      {hover !== null && <Tooltip group={groups[hover]} series={series} format={format}
        leftPct={(left + (hover + 0.5) * groupW) / W * 100} />}
    </div>}
  </figure>;
}

function Tooltip({ group, series, format, leftPct }: { group: BarGroup; series: BarSeries[]; format: (n: number) => string; leftPct: number }) {
  const rows = series.filter(s => group.values[s.key]);
  const total = series.reduce((a, s) => a + (group.values[s.key] ?? 0), 0);
  return <div className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg"
    style={{ left: `${leftPct}%`, transform: leftPct > 60 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}>
    <p className="mb-1.5 font-semibold text-slate-900">{group.label}</p>
    {rows.length ? rows.map(s => <p key={s.key} className="flex items-center justify-between gap-4 text-slate-600">
      <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: s.color }} />{s.label}</span>
      <span className="tabular-nums text-slate-900">{format(group.values[s.key])}</span></p>) : <p className="text-slate-500">Sin datos</p>}
    {rows.length > 1 && <p className="mt-1.5 flex justify-between border-t border-slate-100 pt-1.5 font-medium text-slate-900"><span>Total</span><span className="tabular-nums">{format(total)}</span></p>}
  </div>;
}

/** A bar with a 4px rounded data end (top for positive values, bottom for negative ones). */
function bar(x: number, y: number, w: number, h: number, up: boolean) {
  const r = Math.min(4, w / 2, h);
  return up
    ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
    : `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
}

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
