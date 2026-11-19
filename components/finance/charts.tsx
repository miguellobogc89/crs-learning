"use client";
// Gráficos de CRS Finance en SVG propio (como los de Trading): marcas finas, extremos redondeados, rejilla
// discreta, leyenda siempre que hay dos series y detalle al pasar el ratón o tocar.
import { useState } from "react";
import { eur } from "@/components/trading/format";
import { categoryLabel } from "@/lib/finance/categories";

const INCOME = "#2563eb";
const EXPENSE = "#fe2c55";
const SAVINGS = "#16a34a";

/** Escala «bonita» para el eje: 0, 500, 1.000… */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const compact = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} k` : v.toLocaleString("es-ES", { maximumFractionDigits: 0 }));

export type CyclePoint = { label: string; income: number; expenses: number; net: number; /** Texto del detalle (si no, la etiqueta). */ title?: string; current?: boolean };

/** Ingresos, gastos y ahorro neto por periodo (barras agrupadas; el déficit baja de cero). */
export function CycleBars({ data, height = 200, incomeColor = INCOME, expenseColor = EXPENSE }: {
  data: CyclePoint[]; height?: number; incomeColor?: string; expenseColor?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 40, r: 8, t: 10, b: 26 };
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.income, d.expenses, d.net])));
  const min = Math.min(0, ...data.map((d) => d.net));
  const bottom = min < 0 ? -niceMax(-min) : 0;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const slot = iw / Math.max(1, data.length);
  const bw = Math.min(30, Math.max(3, (slot - 12) / 3));
  const y = (v: number) => pad.t + ((max - v) / (max - bottom)) * ih;
  const ticks = bottom < 0 ? [bottom, 0, max] : [0, max / 2, max];
  const h = hover === null ? null : data[hover];
  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: incomeColor }} /> Ingresos</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: expenseColor }} /> Gastos</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SAVINGS }} /> Ahorro neto</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ingresos, gastos y ahorro neto por periodo" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "3 3"} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">{compact(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const bar = (v: number, x: number, color: string) => {
            const top = Math.min(y(v), y(0));
            const hh = Math.abs(y(v) - y(0));
            return <rect x={x} y={top} width={bw} height={hh} rx={Math.min(3, hh / 2, bw / 2)} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />;
          };
          return (
            <g key={`${i}:${d.label}`} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={cx - slot / 2} y={pad.t} width={slot} height={ih} fill="transparent" />
              {bar(d.income, cx - 1.5 * bw - 2, incomeColor)}
              {bar(d.expenses, cx - bw / 2, expenseColor)}
              {bar(d.net, cx + bw / 2 + 2, d.net < 0 ? EXPENSE : SAVINGS)}
              <text x={cx} y={H - 8} textAnchor="middle" className={d.current ? "fill-slate-900 text-[10px] font-semibold" : "fill-slate-500 text-[10px]"}>{d.label}</text>
            </g>
          );
        })}
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs shadow-lg">
          <p className="font-semibold text-slate-900">{h.title ?? h.label}</p>
          <p className="mt-1 flex justify-between gap-4 text-slate-600"><span>Ingresos</span><b className="tabular-nums text-slate-900">{eur(h.income, 2)}</b></p>
          <p className="flex justify-between gap-4 text-slate-600"><span>Gastos</span><b className="tabular-nums text-slate-900">{eur(h.expenses, 2)}</b></p>
          <p className="flex justify-between gap-4 text-slate-600"><span>Ahorro neto</span><b className={`tabular-nums ${h.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{eur(h.net, 2)}</b></p>
        </div>
      )}
    </div>
  );
}

/** Evolución de la liquidez (una serie: el título la nombra). */
export function LiquidityLine({ data, height = 160 }: { data: { date: string; balance: number }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <p className="py-8 text-center text-sm text-slate-400">Aún no hay historial suficiente.</p>;
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 10, t: 10, b: 22 };
  const vals = data.map((d) => d.balance);
  const lo = Math.min(0, ...vals);
  const hi = niceMax(Math.max(...vals) - lo) + lo;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * iw;
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z`;
  const h = hover === null ? null : data[hover];
  const fmtDay = (s: string) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${s}T00:00:00Z`)).replace(".", "");
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y"
        role="img"
        aria-label="Evolución de la liquidez"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - pad.l) / iw) * (data.length - 1)))));
        }}
      >
        {[lo, (lo + hi) / 2, hi].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">{compact(t)}</text>
          </g>
        ))}
        <path d={area} fill={INCOME} opacity={0.07} />
        <path d={line} fill="none" stroke={INCOME} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {[0, data.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i ? "end" : "start"} className="fill-slate-500 text-[10px]">{fmtDay(data[i].date)}</text>
        ))}
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="#94a3b8" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(h.balance)} r={4.5} fill={INCOME} stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs shadow-lg">
          <p className="text-slate-500">{fmtDay(h.date)}</p>
          <p className="font-semibold tabular-nums text-slate-900">{eur(h.balance, 2)}</p>
        </div>
      )}
    </div>
  );
}

/** Gasto por categoría: barras horizontales de un solo tono, con la comparación con el ciclo anterior. */
export function CategoryBars({ items, previous, limit = 8, onSelect }: { items: { category: string; amount: number }[]; previous?: { category: string; amount: number }[]; limit?: number; onSelect?: (category: string) => void }) {
  const shown = items.filter((i) => i.amount > 0).slice(0, limit);
  if (!shown.length) return <p className="py-6 text-center text-sm text-slate-400">Sin gastos en este periodo.</p>;
  const max = Math.max(...shown.map((i) => i.amount));
  const total = items.filter((i) => i.amount > 0).reduce((s, i) => s + i.amount, 0);
  return (
    <ul className="space-y-2.5">
      {shown.map((i) => {
        const prev = previous?.find((p) => p.category === i.category)?.amount ?? null;
        const delta = prev ? ((i.amount - prev) / prev) * 100 : null;
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-slate-700">{categoryLabel(i.category)}</span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">
                <b className="font-semibold text-slate-900">{eur(i.amount, 2)}</b>
                <span className="ml-2 text-xs text-slate-400">{((i.amount / total) * 100).toFixed(0)} %</span>
                {delta !== null && Math.abs(delta) >= 1 && (
                  <span className={`ml-2 text-xs ${delta > 0 ? "text-red-700" : "text-emerald-700"}`}>{delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)} %</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.max(2, (i.amount / max) * 100)}%` }} />
            </div>
          </>
        );
        return (
          <li key={i.category}>
            {onSelect ? <button type="button" onClick={() => onSelect(i.category)} className="block w-full rounded-lg text-left hover:bg-slate-50">{body}</button> : body}
          </li>
        );
      })}
    </ul>
  );
}

/** Barra de un límite: gastado frente al límite, con la marca de lo que «tocaría» a estas alturas del ciclo. */
export function BudgetBar({ pct, expectedPct, status }: { pct: number; expectedPct: number; status: "ok" | "atencion" | "superado" }) {
  const color = status === "superado" ? "bg-red-500" : status === "atencion" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="relative h-2 w-full rounded-full bg-slate-100" title={`${pct.toFixed(0)} % gastado · ${expectedPct.toFixed(0)} % del ciclo transcurrido`}>
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(1, pct))}%` }} />
      <span className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded bg-slate-500" style={{ left: `${Math.min(100, expectedPct)}%` }} aria-hidden />
    </div>
  );
}

/**
 * Saldo día a día de un ciclo (una serie: el título la nombra). El eje X es el ciclo entero; en el ciclo en curso,
 * un tramo discontinuo lleva del saldo de hoy al previsto el último día. Etiqueta fija con el último saldo.
 */
export function BalanceLine({ data, start, end, projected, height = 190 }: { data: { date: string; balance: number }[]; start: string; end: string; projected?: number | null; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <p className="py-8 text-center text-sm text-slate-400">Aún no hay historial suficiente.</p>;
  const W = 640;
  const H = height;
  const pad = { l: 46, r: 14, t: 26, b: 22 };
  const day = (s: string) => Math.round((Date.parse(`${s}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  const span = Math.max(1, day(end));
  const vals = data.map((d) => d.balance).concat(projected ?? []);
  const rawLo = Math.min(...vals);
  const rawHi = Math.max(...vals);
  const pad10 = Math.max(50, (rawHi - rawLo) * 0.12);
  const step = niceMax((rawHi - rawLo + 2 * pad10) / 2) / 2 || 1;
  const lo = Math.floor((rawLo - pad10) / step) * step;
  const hi = Math.ceil((rawHi + pad10) / step) * step;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (s: string) => pad.l + (day(s) / span) * iw;
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(d.date).toFixed(1)},${y(d.balance).toFixed(1)}`).join(" ");
  const last = data[data.length - 1];
  const area = `${line} L${x(last.date)},${pad.t + ih} L${x(data[0].date)},${pad.t + ih} Z`;
  const showProj = projected !== null && projected !== undefined && last.date < end;
  const h = hover === null ? null : data[hover];
  const fmtDay = (s: string) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${s}T00:00:00Z`)).replace(".", "");
  const ticks = [lo, (lo + hi) / 2, hi];
  // Fechas del eje: inicio, mitad y fin del ciclo.
  const mid = new Date(Date.parse(`${start}T00:00:00Z`) + Math.round(span / 2) * 86_400_000).toISOString().slice(0, 10);
  const tag = `${eur(last.balance, 0)}`;
  const tagW = Math.max(56, tag.length * 7 + 16);
  const tagX = Math.min(W - pad.r - tagW, Math.max(pad.l, x(last.date) - tagW / 2));
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y"
        role="img"
        aria-label="Evolución del saldo en el ciclo"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const d = Math.round(((px - pad.l) / iw) * span);
          let best = 0;
          data.forEach((p, i) => { if (Math.abs(day(p.date) - d) < Math.abs(day(data[best].date) - d)) best = i; });
          setHover(best);
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className={`fill-slate-400 text-[10px] amount`}>{compact(t)}</text>
          </g>
        ))}
        <path d={area} fill={INCOME} opacity={0.08} />
        <path d={line} fill="none" stroke={INCOME} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {showProj && (
          <g>
            <path d={`M${x(last.date)},${y(last.balance)} L${x(end)},${y(projected!)}`} fill="none" stroke={INCOME} strokeWidth={2} strokeDasharray="4 4" opacity={0.6} />
            <circle cx={x(end)} cy={y(projected!)} r={3.5} fill="#fff" stroke={INCOME} strokeWidth={2} />
          </g>
        )}
        {[start, mid, end].map((d, i) => (
          <text key={d} x={x(d)} y={H - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="fill-slate-500 text-[10px]">{fmtDay(d)}</text>
        ))}
        {!h && (
          <g>
            <circle cx={x(last.date)} cy={y(last.balance)} r={4.5} fill={INCOME} stroke="#fff" strokeWidth={2} />
            <rect x={tagX} y={Math.max(2, y(last.balance) - 28)} width={tagW} height={20} rx={6} fill={INCOME} />
            <text x={tagX + tagW / 2} y={Math.max(2, y(last.balance) - 28) + 14} textAnchor="middle" className={`fill-white text-[11px] font-semibold amount`}>{tag}</text>
          </g>
        )}
        {h && hover !== null && (
          <g>
            <line x1={x(h.date)} x2={x(h.date)} y1={pad.t} y2={pad.t + ih} stroke="#94a3b8" strokeWidth={1} />
            <circle cx={x(h.date)} cy={y(h.balance)} r={4.5} fill={INCOME} stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs shadow-lg">
          <p className="text-slate-500">{fmtDay(h.date)}</p>
          <p className={`font-semibold tabular-nums text-slate-900 amount`}>{eur(h.balance, 2)}</p>
        </div>
      )}
      {showProj && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: INCOME }} />
          Previsto el {fmtDay(end)}: <b className={`tabular-nums text-slate-700 amount`}>{eur(projected!, 0)}</b>
        </p>
      )}
    </div>
  );
}
