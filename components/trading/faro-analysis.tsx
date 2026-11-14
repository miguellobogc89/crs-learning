"use client";
// Análisis de FARO: si sus ideas ganan dinero, cómo evoluciona, qué tipos, convicciones, horas y fases del
// mercado funcionan, si falla al elegir o al gestionar (lo que subieron antes de caer) y qué objetivo le
// habría ido mejor. Cada idea cuenta como 100 € seguidos al pie de la letra, con costes.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import type { faroAnalysis } from "@/lib/trading/faro/engine";
import { api, errorText, eur, int } from "./format";
import { card, ErrorNote, LoadingCard } from "./ui";
import { useTradingRefresh } from "./navigation";

type A = Awaited<ReturnType<typeof faroAnalysis>>;
type Bucket = A["byKind"][number];

// Positivo / negativo / neutro y estados (siempre con etiqueta o leyenda, nunca solo color).
const POS = "#059669";
const NEG = "#e11d48";
const MUTED = "#94a3b8";
const LINE = "#2563eb";
const STATUS_COLOR: Record<string, string> = { acierto: POS, fallo: NEG, caducada: MUTED };
const STATUS_LABEL: Record<string, string> = { acierto: "Acierto", fallo: "Fallo", caducada: "Caducada" };

const sPct = (v: number, d = 2) => `${v > 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")} %`;
const sEur = (v: number) => `${v > 0 ? "+" : ""}${eur(v, 2)}`;
const tone = (v: number) => (v > 0.005 ? "text-emerald-700" : v < -0.005 ? "text-rose-700" : "text-slate-600");
const day = (t: number) => new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", timeZone: "Europe/Madrid" }).format(new Date(t));
const dayTime = (t: number) => new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(t));

type Segment = "todas" | "faro2" | "descartadas";
const SEGMENTS: [Segment, string][] = [
  ["todas", "Todas las ideas"],
  ["faro2", "FARO-2: las que pasa"],
  ["descartadas", "FARO-2: las que descarta"],
];

export function FaroAnalysis() {
  const [data, setData] = useState<A | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [segment, setSegment] = useState<Segment>("todas");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<A>(`faro/analysis?segmento=${segment}`));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [segment]);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <LoadingCard height="h-96" />;

  const t = data.total;
  const best = [...data.targetScan.levels].sort((a, b) => b.avgPct - a.avgPct)[0];
  const m = data.management;
  const f2 = data.faro2;
  const byDay = data.weekly.length < 3;
  return (
    <div className="space-y-4 pb-4">
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Qué ideas analizar">
          {SEGMENTS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={segment === k}
              onClick={() => setSegment(k)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${segment === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Actualizar
        </button>
      </div>
      <p className="text-sm text-slate-600">
        {int(data.n)} ideas resueltas{data.since ? ` desde el ${day(data.since)}` : ""}. Cada una cuenta como <b>100 €</b> siguiendo la idea al pie de la letra (entrar al publicarla, salir en la invalidación, el objetivo o al caducar), con costes.
        {segment !== "todas" && " Solo ideas con contexto (lo que veía FARO al publicarlas)."}
      </p>

      <Faro2Card f2={f2} totalIdeas={data.totalIdeas} />

      {data.n === 0 ? (
        <p className={`${card} px-6 py-10 text-center text-sm text-slate-500`}>
          {segment === "todas" ? "Todavía no hay ideas resueltas para analizar." : "Todavía no hay ideas con contexto en este grupo: se va reconstruyendo con cada revisión (unos 5 min)."}
        </p>
      ) : (
        <>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Resultado total" value={sEur(t.totalEur)} cls={tone(t.totalEur)} hint={`${int(data.n)} ideas × 100 €`} />
        <Tile label="Por idea" value={sPct(t.avgPct)} cls={tone(t.avgPct)} hint="media neta de costes" />
        <Tile label="Acierto" value={`${t.hitRate.toFixed(1).replace(".", ",")} %`} hint={`${data.statusCounts.acierto} aciertos · ${data.statusCounts.fallo} fallos · ${data.statusCounts.caducada} caducadas`} />
        <Tile label="Ganan / pierden" value={`${sPct(data.avgWinPct, 1)} / ${sPct(data.avgLossPct, 1)}`} hint="media de las que ganan y de las que pierden" />
        <Tile label="Factor de beneficio" value={data.profitFactor === null ? "—" : data.profitFactor.toFixed(2).replace(".", ",")} cls={data.profitFactor !== null && data.profitFactor >= 1 ? "text-emerald-700" : "text-rose-700"} hint="lo ganado entre lo perdido (más de 1 = gana)" />
        <Tile label="Peor caída" value={sEur(data.maxDrawdownEur)} cls={tone(data.maxDrawdownEur)} hint="desde el mejor momento de la curva" />
      </div>

      <Panel title="¿Gana dinero?" sub="Lo acumulado poniendo 100 € en cada idea, en el orden en que se resolvieron.">
        <EquityLine points={data.equity} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="¿Mejora o empeora?" sub={`Resultado medio por idea, ${byDay ? "día a día" : "semana a semana"} (por fecha de publicación).`}>
          <WeekBars weeks={byDay ? data.daily : data.weekly} byDay={byDay} />
        </Panel>
        <Panel title={`Acierto de las últimas ${data.rollingWindow}`} sub="Media móvil: si la línea sube, FARO está acertando más que antes.">
          {data.rolling.length ? <RollingLine points={data.rolling} /> : <Empty>Hacen falta al menos {data.rollingWindow} ideas resueltas.</Empty>}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="¿Qué tipo de idea funciona?" sub="Resultado medio por idea (barra) y acierto. Un tipo que pierde siempre se puede apagar.">
          <BucketBars rows={data.byKind} />
        </Panel>
        <Panel title="¿Sirve la convicción?" sub="Si la convicción 5 no rinde más que la 1, la IA no sabe distinguir sus buenas ideas.">
          <BucketBars rows={data.byConviction} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="¿Falla al elegir o al gestionar?" sub="Cada punto es una idea: lo máximo que subió (→) frente a lo máximo que bajó (↓) antes de resolverse.">
          <ExcursionScatter points={data.excursions} />
          <p className="mt-3 text-sm text-slate-700">
            De {m.fails} fallos, <b>{m.wentUp2}</b> llegaron a ir +2 % o más y <b>{m.nearMiss}</b> hicieron más de la mitad del camino al objetivo antes de caer; <b>{m.straightDown}</b> cayeron casi desde el principio.{" "}
            {m.fails > 0 && (m.wentUp2 / m.fails >= 0.35 ? "Muchas iban bien y se dieron la vuelta: el problema está más en dónde sale (objetivo lejos) que en qué elige." : m.straightDown / m.fails >= 0.5 ? "La mayoría cae desde el principio: el problema está en qué elige o cuándo entra." : "")}
          </p>
        </Panel>
        <Panel title="¿Y con un objetivo fijo más corto?" sub="Resultado medio por idea si se hubiera salido al ganar +k % (las que llegaron a subir eso antes de caer o caducar).">
          <TargetBars scan={data.targetScan} />
          {best && (
            <p className="mt-3 text-sm text-slate-700">
              Con un objetivo fijo de <b>+{best.targetPct} %</b> el resultado medio habría sido <b className={tone(best.avgPct)}>{sPct(best.avgPct)}</b> por idea (acierto {best.hitRate.toFixed(0)} %), frente a{" "}
              <b className={tone(data.targetScan.currentAvgPct)}>{sPct(data.targetScan.currentAvgPct)}</b> con sus objetivos.
            </p>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="¿A qué hora acierta?" sub="Por la hora de Madrid a la que publicó la idea.">
          <BucketBars rows={data.byHour} />
        </Panel>
        <Panel title="¿En qué mercado acierta?" sub="Fase de Bitcoin (detector de CAMALEÓN) al publicar la idea.">
          {data.byPhase.length ? <BucketBars rows={data.byPhase} /> : <Empty>Aún sin ideas con la fase del mercado ({data.withFeatures} con contexto por ahora).</Empty>}
        </Panel>
      </div>
        </>
      )}
    </div>
  );
}

/** FARO-2 (en pruebas) frente a FARO: mismas ideas, solo las que pasan sus filtros. */
function Faro2Card({ f2, totalIdeas }: { f2: A["faro2"]; totalIdeas: number }) {
  const rows: [string, A["faro2"]["all"], string][] = [
    ["FARO (todas con contexto)", f2.all, "text-slate-900"],
    ["FARO-2: las que pasa", f2.pass, "text-slate-900"],
    ["Las que descarta", f2.rejected, "text-slate-500"],
  ];
  return (
    <section className={`${card} px-5 py-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-slate-900">FARO-2 en pruebas</h3>
        <span className="text-xs text-slate-500">
          Contexto disponible en {int(f2.judged)} de {int(totalIdeas)} ideas{f2.judged < totalIdeas ? " · se reconstruyen unas 10 cada 5 min" : ""}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        Las mismas ideas de FARO, pero solo las que pasan unos filtros fijos: sin rebotes, sin perseguir subidas (más de +12 % en 24 h o +4 % en 1 h), sin impulsos pegados al máximo, nada con Bitcoin cayendo más de un 2 % o el mercado en defensa, y objetivo de al menos 1,5 veces el riesgo.
      </p>
      {f2.judged === 0 ? (
        <p className="py-4 text-sm text-slate-500">Todavía no hay ideas con contexto. Si no aparecen en unos minutos, falta aplicar la migración de «features».</p>
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-1.5 pr-2" />
                <th className="px-2 py-1.5 text-right">Ideas</th>
                <th className="px-2 py-1.5 text-right">Por idea</th>
                <th className="px-2 py-1.5 text-right">Acierto</th>
                <th className="px-2 py-1.5 text-right">Total</th>
                <th className="px-2 py-1.5 text-right">Factor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, r, cls]) => (
                <tr key={label} className="border-b border-slate-100/70">
                  <td className={`py-2 pr-2 font-medium ${cls}`}>{label}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-600">{int(r.n)}</td>
                  <td className={`px-2 py-2 text-right font-semibold tabular-nums ${tone(r.avgPct)}`}>{r.n ? sPct(r.avgPct) : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-600">{r.n ? `${r.hitRate.toFixed(0)} %` : "—"}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${tone(r.totalEur)}`}>{r.n ? sEur(r.totalEur) : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-600">{r.profitFactor === null ? "—" : r.profitFactor.toFixed(2).replace(".", ",")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Por qué descarta (y cómo les fue)</div>
            {f2.reasons.length === 0 ? (
              <p className="text-sm text-slate-500">No descarta ninguna.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {f2.reasons.map((r) => (
                  <li key={r.reason} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-slate-700" title={r.reason}>
                      {r.reason}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-slate-500">
                      {r.n} · <b className={tone(r.avgPct)}>{sPct(r.avgPct, 1)}</b>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------
function Tile({ label, value, hint, cls = "text-slate-900" }: { label: string; value: string; hint?: string; cls?: string }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${cls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className={`${card} px-5 py-4`}>
      <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="py-8 text-center text-sm text-slate-500">{children}</p>;

/** Ticks «redondos» entre min y max. */
function ticks(min: number, max: number, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * pow).find((x) => x >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

type Hover = { x: number; y: number; lines: string[] } | null;
/** Tooltip sobre el SVG: x/y en coordenadas del viewBox (w × h), colocado en % para que escale con él. */
function Tip({ h, w, height }: { h: Hover; w: number; height: number }) {
  if (!h) return null;
  const left = Math.min(88, Math.max(12, (h.x / w) * 100));
  const top = Math.max(0, (h.y / height) * 100);
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-lg" style={{ left: `${left}%`, top: `${top}%` }}>
      {h.lines.map((l, i) => (
        <div key={i} className={i === 0 ? "font-semibold" : "text-slate-300"}>
          {l}
        </div>
      ))}
    </div>
  );
}

/** Ancho real del contenedor (el SVG se dibuja a ese ancho para que el texto no crezca al estirarse). */
function useWidth(initial = 640) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setW(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, Math.max(280, w)] as const;
}

function EquityLine({ points }: { points: A["equity"] }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220;
  const pad = { l: 52, r: 12, t: 12, b: 24 };
  const vals = points.map((p) => p.eur);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const x = (i: number) => pad.l + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.eur).toFixed(1)}`).join("");
  const last = points[points.length - 1];
  const color = (last?.eur ?? 0) >= 0 ? POS : NEG;
  const area = `${path}L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
  const h = hover !== null ? points[hover] : null;
  const labels = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Resultado acumulado de FARO"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}
      >
        {ticks(lo, hi).map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#cbd5e1" : "#f1f5f9"} strokeWidth={1} />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">{`${v > 0 ? "+" : ""}${Math.round(v)} €`}</text>
          </g>
        ))}
        <path d={area} fill={color} opacity={0.08} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {labels.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="fill-slate-400 text-[10px]">
            {day(points[i].t)}
          </text>
        ))}
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#94a3b8" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.eur)} r={4} fill={color} stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && hover !== null && <Tip w={W} height={H} h={{ x: x(hover), y: y(h.eur), lines: [sEur(h.eur), `idea ${hover + 1} · ${STATUS_LABEL[h.status] ?? h.status}`, dayTime(h.t)] }} />}
    </div>
  );
}

function RollingLine({ points }: { points: A["rolling"] }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = 180;
  const pad = { l: 40, r: 12, t: 12, b: 24 };
  const x = (i: number) => pad.l + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + ((100 - v) / 100) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.hitRate).toFixed(1)}`).join("");
  const h = hover !== null ? points[hover] : null;
  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Acierto en media móvil"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (points.length - 1)))));
        }}
      >
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 50 ? "#cbd5e1" : "#f1f5f9"} />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">{`${v} %`}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
        <text x={pad.l} y={H - 6} className="fill-slate-400 text-[10px]">{day(points[0].t)}</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" className="fill-slate-400 text-[10px]">{day(points[points.length - 1].t)}</text>
        {h && hover !== null && <circle cx={x(hover)} cy={y(h.hitRate)} r={4} fill={LINE} stroke="#fff" strokeWidth={2} />}
      </svg>
      {h && hover !== null && <Tip w={W} height={H} h={{ x: x(hover), y: y(h.hitRate), lines: [`Acierto ${h.hitRate.toFixed(0)} %`, `media ${sPct(h.avgPct)} por idea`, dayTime(h.t)] }} />}
    </div>
  );
}

/** Barras verticales con base en 0 (positivas arriba en verde, negativas abajo en rojo). */
function WeekBars({ weeks, byDay = false }: { weeks: A["weekly"]; byDay?: boolean }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = 180;
  const pad = { l: 40, r: 8, t: 12, b: 24 };
  const vals = weeks.map((w) => w.avgPct);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const slot = (W - pad.l - pad.r) / Math.max(1, weeks.length);
  const bw = Math.max(4, Math.min(36, slot - 6));
  const h = hover !== null ? weeks[hover] : null;
  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Resultado medio por semana" onMouseLeave={() => setHover(null)}>
        {ticks(lo, hi).map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#cbd5e1" : "#f1f5f9"} />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">{`${v > 0 ? "+" : ""}${v} %`}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const top = y(Math.max(0, w.avgPct));
          const height = Math.max(1, Math.abs(y(w.avgPct) - y(0)));
          return (
            <g key={w.week} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
              <rect x={cx - bw / 2} y={top} width={bw} height={height} rx={3} fill={w.avgPct >= 0 ? POS : NEG} opacity={hover === null || hover === i ? 1 : 0.5} />
              {(weeks.length <= 8 || i % Math.ceil(weeks.length / 8) === 0) && (
                <text x={cx} y={H - 6} textAnchor="middle" className="fill-slate-400 text-[10px]">{day(new Date(`${w.week}T12:00:00Z`).getTime())}</text>
              )}
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <Tip w={W} height={H} h={{ x: pad.l + slot * hover + slot / 2, y: y(Math.max(0, h.avgPct)), lines: [`${byDay ? "Día" : "Semana del"} ${day(new Date(`${h.week}T12:00:00Z`).getTime())}`, `${sPct(h.avgPct)} por idea · ${sEur(h.totalEur)}`, `${h.n} ideas · acierto ${h.hitRate.toFixed(0)} %`] }} />
      )}
    </div>
  );
}

/** Filas con barra divergente (resultado medio por idea) y el acierto al lado. */
function BucketBars({ rows }: { rows: Bucket[] }) {
  if (!rows.length) return <Empty>Sin datos.</Empty>;
  const max = Math.max(0.5, ...rows.map((r) => Math.abs(r.avgPct)));
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const w = (Math.abs(r.avgPct) / max) * 50;
        return (
          <li key={r.key} className="grid grid-cols-[8.5rem_minmax(0,1fr)_7.5rem] items-center gap-3 text-sm" title={`${r.n} ideas · ${r.hits} aciertos · ${sEur(r.totalEur)} en total`}>
            <span className="truncate text-slate-700">{r.label}</span>
            <span className="relative h-5 rounded bg-slate-50">
              <span className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
              <span className="absolute inset-y-1 rounded-sm" style={{ background: r.avgPct >= 0 ? POS : NEG, width: `${w}%`, left: r.avgPct >= 0 ? "50%" : `${50 - w}%` }} />
            </span>
            <span className="text-right tabular-nums">
              <b className={`font-semibold ${tone(r.avgPct)}`}>{sPct(r.avgPct, 1)}</b>
              <span className="block text-[11px] text-slate-500">
                {r.hitRate.toFixed(0)} % · {r.n} ideas
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TargetBars({ scan }: { scan: A["targetScan"] }) {
  const rows = [{ key: "actual", label: "Sus objetivos", n: 0, hits: 0, hitRate: 0, avgPct: scan.currentAvgPct, totalEur: 0 }, ...scan.levels.map((l) => ({ key: String(l.targetPct), label: `Objetivo +${l.targetPct} %`, n: 0, hits: 0, hitRate: l.hitRate, avgPct: l.avgPct, totalEur: 0 }))];
  const max = Math.max(0.5, ...rows.map((r) => Math.abs(r.avgPct)));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const w = (Math.abs(r.avgPct) / max) * 50;
        return (
          <li key={r.key} className={`grid grid-cols-[8.5rem_minmax(0,1fr)_6rem] items-center gap-3 text-sm ${r.key === "actual" ? "font-semibold" : ""}`}>
            <span className="truncate text-slate-700">{r.label}</span>
            <span className="relative h-4 rounded bg-slate-50">
              <span className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
              <span className="absolute inset-y-0.5 rounded-sm" style={{ background: r.key === "actual" ? MUTED : r.avgPct >= 0 ? POS : NEG, width: `${w}%`, left: r.avgPct >= 0 ? "50%" : `${50 - w}%` }} />
            </span>
            <span className={`text-right tabular-nums ${tone(r.avgPct)}`}>
              {sPct(r.avgPct, 2)}
              {r.key !== "actual" && <span className="block text-[11px] font-normal text-slate-500">acierto {r.hitRate.toFixed(0)} %</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ExcursionScatter({ points }: { points: A["excursions"] }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = 240;
  const pad = { l: 40, r: 12, t: 12, b: 28 };
  const xMax = Math.max(5, ...points.map((p) => p.best));
  const yMin = Math.min(-5, ...points.map((p) => p.worst));
  const x = (v: number) => pad.l + (Math.max(0, v) / xMax) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (Math.min(0, v) / yMin) * (H - pad.t - pad.b);
  const counts = useMemo(() => points.reduce<Record<string, number>>((s, p) => ({ ...s, [p.status]: (s[p.status] ?? 0) + 1 }), {}), [points]);
  const h = hover !== null ? points[hover] : null;
  return (
    <div ref={ref}>
      <div className="mb-1 flex flex-wrap gap-3 text-[11px] text-slate-600">
        {["acierto", "fallo", "caducada"].map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} /> {STATUS_LABEL[s]} ({counts[s] ?? 0})
          </span>
        ))}
      </div>
      <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Máxima subida frente a máxima bajada de cada idea" onMouseLeave={() => setHover(null)}>
        {ticks(0, xMax).map((v) => (
          <g key={`x${v}`}>
            <line x1={x(v)} x2={x(v)} y1={pad.t} y2={H - pad.b} stroke="#f1f5f9" />
            <text x={x(v)} y={H - 10} textAnchor="middle" className="fill-slate-400 text-[10px]">{`+${v} %`}</text>
          </g>
        ))}
        {ticks(yMin, 0).map((v) => (
          <g key={`y${v}`}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#f1f5f9" />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">{`${v} %`}</text>
          </g>
        ))}
        <text x={W - pad.r} y={H - 0} textAnchor="end" className="fill-slate-500 text-[10px]">máxima subida →</text>
        {points.map((p, i) => (
          <circle key={p.id} cx={x(p.best)} cy={y(p.worst)} r={hover === i ? 6 : 4} fill={STATUS_COLOR[p.status] ?? MUTED} fillOpacity={0.75} stroke="#fff" strokeWidth={1.5} onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {h && hover !== null && <Tip w={W} height={H} h={{ x: x(h.best), y: y(h.worst), lines: [`${STATUS_LABEL[h.status] ?? h.status} · ${h.kind}`, `subió hasta ${sPct(h.best, 1)} · bajó hasta ${sPct(h.worst, 1)}`, `resultado ${sPct(h.resultPct)}`] }} />}
      </div>
    </div>
  );
}
