"use client";
// Panorama: lo primero que se ve al entrar. Cómo está el mercado ahora con los indicadores básicos,
// cada uno con su valor, cómo se lee y su historia reciente. Son contexto (no señales): ninguno decide
// solo, y así se dice.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, CircleAlert, CircleCheck, CircleMinus, Info, RefreshCw } from "lucide-react";
import type { Pulse } from "@/lib/trading/pulse/service";
import {
  dollarZone,
  FUNDING_HIGH,
  fearGreedZone,
  fundingZone,
  RSI_HIGH,
  RSI_LOW,
  rsiZone,
  trendZone,
  volumeZone,
  type Point,
  type Tone,
  type Zone,
} from "@/lib/trading/pulse/logic";
import { api, errorText, eur, pct } from "./format";
import { useTradingRefresh, useWarmStart } from "./navigation";
import { ErrorNote, LoadingCard, ReturnPill } from "./ui";

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------
const nf = (d: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
const big = (v: number) =>
  v >= 1e12 ? `${nf(2).format(v / 1e12)} billones €` : v >= 1e9 ? `${nf(0).format(v / 1e9)} mil millones €` : eur(v, 0);
const day = (t: number) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" }).format(new Date(t));
const since = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1 ? "ahora mismo" : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
};

const TONE_TEXT: Record<Tone, string> = {
  pos: "bg-emerald-50 text-emerald-700",
  neg: "bg-rose-50 text-rose-700",
  warn: "bg-amber-50 text-amber-700",
  neutral: "bg-slate-100 text-slate-600",
};
const TONE_ICON: Record<Tone, typeof CircleCheck> = { pos: CircleCheck, neg: CircleAlert, warn: CircleAlert, neutral: CircleMinus };
const TONE_ICON_COLOR: Record<Tone, string> = { pos: "text-emerald-600", neg: "text-rose-600", warn: "text-amber-600", neutral: "text-slate-400" };

function ZoneChip({ zone }: { zone: Zone }) {
  const Icon = TONE_ICON[zone.tone];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_TEXT[zone.tone]}`}>
      <Icon className="h-3.5 w-3.5" />
      {zone.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Gráficas pequeñas
// ---------------------------------------------------------------------------
/**
 * Línea de una serie (o dos: la segunda, discontinua y gris, como referencia) con su tooltip al pasar el
 * dedo o el ratón. Líneas de 2 px que no se deforman al estirar.
 */
function Spark({
  points,
  second,
  height = 64,
  format,
  bands,
  label,
  secondLabel,
}: {
  points: Point[];
  second?: (number | null)[];
  height?: number;
  format: (v: number) => string;
  /** Líneas horizontales de referencia (p. ej. 30 y 70 del RSI). */
  bands?: number[];
  label?: string;
  secondLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <div style={{ height }} className="rounded-lg bg-slate-50" />;
  const vals = [...points.map((p) => p.v), ...(second ?? []).filter((v): v is number => v !== null), ...(bands ?? [])];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pad = span * 0.08;
  const lo = min - pad;
  const hi = max + pad;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => ((hi - v) / (hi - lo)) * 100;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(p.v).toFixed(2)}`).join("");
  const path2 = second
    ? second
        .map((v, i) => (v === null ? null : `${x(i).toFixed(2)},${y(v).toFixed(2)}`))
        .reduce<string>((acc, c, i, arr) => (c === null ? acc : `${acc}${i === 0 || arr[i - 1] === null ? "M" : "L"}${c}`), "")
    : "";
  const move = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.round(((clientX - r.left) / r.width) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const h = hover === null ? null : points[hover];
  return (
    <div
      ref={ref}
      className="relative touch-pan-y select-none"
      style={{ height }}
      onPointerMove={(e) => move(e.clientX)}
      onPointerDown={(e) => move(e.clientX)}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label={label ? `${label}: de ${format(points[0].v)} a ${format(points[points.length - 1].v)}` : undefined}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        {(bands ?? []).map((b) => (
          <line key={b} x1="0" x2="100" y1={y(b)} y2={y(b)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        ))}
        {path2 && <path d={path2} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        <path d={path} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2="100" stroke="#cbd5e1" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {h && (
        <>
          <span
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow"
            style={{ left: `${x(hover!)}%`, top: `${y(h.v)}%` }}
          />
          <span
            className={`pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] text-white shadow ${x(hover!) > 60 ? "-translate-x-full" : ""}`}
            style={{ left: `${x(hover!)}%` }}
          >
            <span className="text-slate-300">{day(h.t)}</span> · <b className="tabular-nums">{format(h.v)}</b>
            {second && second[hover!] !== null && second[hover!] !== undefined && (
              <span className="text-slate-300"> · {secondLabel ?? "ref."} {format(second[hover!]!)}</span>
            )}
          </span>
        </>
      )}
    </div>
  );
}

/** Barra de 0 a 100 (o min–max) con tramos de color y una marca donde está el valor. */
function Gauge({ value, min = 0, max = 100, stops, ticks }: { value: number; min?: number; max?: number; stops: { to: number; cls: string }[]; ticks?: number[] }) {
  const at = (v: number) => ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * 100;
  let from = min;
  return (
    <div className="relative pb-4 pt-1">
      <div className="flex h-2 overflow-hidden rounded-full">
        {stops.map((s) => {
          const w = at(s.to) - at(from);
          from = s.to;
          return <span key={s.to} className={s.cls} style={{ width: `${w}%` }} />;
        })}
      </div>
      <span
        className="absolute top-0 h-4 w-1.5 -translate-x-1/2 rounded-full border-2 border-white bg-slate-900 shadow"
        style={{ left: `${at(value)}%` }}
        aria-hidden="true"
      />
      {(ticks ?? []).map((t) => (
        <span key={t} className="absolute top-4 -translate-x-1/2 text-[10px] tabular-nums text-slate-400" style={{ left: `${at(t)}%` }}>
          {t}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ficha de indicador
// ---------------------------------------------------------------------------
function Indicator({
  title,
  what,
  value,
  zone,
  children,
  how,
}: {
  title: string;
  /** Qué mide, en una línea. */
  what: string;
  value: ReactNode;
  zone?: Zone | null;
  children?: ReactNode;
  /** Cómo se lee: se despliega. */
  how: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col border-t border-slate-100 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{what}</p>
        </div>
        {zone && <ZoneChip zone={zone} />}
      </div>
      <div className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-slate-950">{value}</div>
      {children && <div className="mt-3">{children}</div>}
      <details className="group mt-3 text-sm text-slate-600">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-blue-600 [&::-webkit-details-marker]:hidden">
          <Info className="h-3.5 w-3.5" />
          <span className="group-open:hidden">Cómo se lee</span>
          <span className="hidden group-open:inline">Ocultar</span>
        </summary>
        <div className="mt-2 space-y-1.5 leading-relaxed">{how}</div>
      </details>
    </section>
  );
}

function Missing({ what }: { what: string }) {
  return <p className="text-sm text-slate-400">Ahora mismo no se puede leer {what}. Se vuelve a intentar en unos minutos.</p>;
}

function Small({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="min-w-0">
      <span className="block text-[11px] text-slate-400">{label}</span>
      <span className="block text-sm font-semibold tabular-nums text-slate-800">{children}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
export function PulsePanel({ tabs }: { tabs: ReactNode }) {
  const [data, setData] = useState<Pulse | null>(null);
  useWarmStart<Pulse>("pulse", setData);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await api<Pulse>("pulse"));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  return (
    <div className="space-y-6 pb-6 lg:h-full lg:overflow-y-auto lg:pr-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {tabs}
        {data && (
          <button type="button" onClick={() => void load()} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800" title="Actualizar">
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            Actualizado {since(data.asOf)}
          </button>
        )}
      </div>
      {!data ? error ? <ErrorNote>{error}</ErrorNote> : <LoadingCard /> : <Body p={data} />}
    </div>
  );
}

function Body({ p }: { p: Pulse }) {
  const b = p.btc;
  const fg = p.fearGreed;
  return (
    <>
      {/* Resumen */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-950 sm:text-xl">Cómo está el mercado ahora</h2>
          <ul className="mt-3 space-y-2.5">
            {p.reads.map((r) => {
              const Icon = TONE_ICON[r.tone];
              return (
                <li key={r.key} className="flex gap-2.5 text-sm leading-relaxed text-slate-700">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE_ICON_COLOR[r.tone]}`} />
                  <span>{r.text}</span>
                </li>
              );
            })}
            {!p.reads.length && <li className="text-sm text-slate-500">Sin datos suficientes para resumir ahora mismo.</li>}
          </ul>
        </div>
        {b && (
          <div className="rounded-2xl bg-slate-50 px-5 py-4 lg:min-w-[240px]">
            <div className="text-xs font-medium text-slate-500">Bitcoin</div>
            <div className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-slate-950">{eur(b.price, 0)}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {b.ch24h !== null && (
                <span className="flex items-center gap-1">24 h <ReturnPill value={b.ch24h} /></span>
              )}
              {b.ch7d !== null && (
                <span className="flex items-center gap-1">7 días <ReturnPill value={b.ch7d} /></span>
              )}
              {b.ch30d !== null && (
                <span className="flex items-center gap-1">30 días <ReturnPill value={b.ch30d} /></span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Estado del filtro de FARO: lo que hacemos nosotros con todo esto. */}
      <section
        className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${p.faro2.paused ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}
      >
        <Activity className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <b>FARO {p.faro2.paused ? "en pausa" : "publicando"}.</b>{" "}
          {p.faro2.paused
            ? `Con Bitcoin cayendo más de un ${Math.abs(p.faro2.btc24hLimit)} % en 24 h, su filtro no publica ninguna compra nueva: con el mercado así, casi todo cae a la vez.`
            : `Publica ideas mientras Bitcoin no caiga más de un ${Math.abs(p.faro2.btc24hLimit)} % en 24 h (es una de las reglas de su filtro). Los agentes solo ven lo que publica.`}
        </span>
      </section>

      {/* Indicadores */}
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
        <Indicator
          title="Miedo y codicia"
          what="El ánimo del mercado cripto, de 0 (pánico) a 100 (euforia)."
          value={fg ? <>{fg.value}<span className="ml-1 text-sm font-medium text-slate-400">/ 100</span></> : "—"}
          zone={fg ? fearGreedZone(fg.value) : null}
          how={
            <>
              <p>Mezcla la volatilidad, el volumen, lo que se habla en redes y el peso de Bitcoin. Lo publica alternative.me una vez al día.</p>
              <p>
                <b>Por debajo de 25</b> (miedo extremo) suele coincidir con caídas fuertes y, a veces, con suelos. <b>Por encima de 75</b> (codicia extrema), con subidas
                muy estiradas. En medio dice poco.
              </p>
              <p>No marca el momento exacto: el miedo puede durar semanas.</p>
            </>
          }
        >
          {fg ? (
            <div className="space-y-3">
              <Gauge
                value={fg.value}
                ticks={[0, 25, 50, 75, 100]}
                stops={[
                  { to: 24, cls: "bg-rose-400" },
                  { to: 46, cls: "bg-amber-300" },
                  { to: 54, cls: "bg-slate-300" },
                  { to: 75, cls: "bg-emerald-300" },
                  { to: 100, cls: "bg-emerald-500" },
                ]}
              />
              <div className="grid grid-cols-3 gap-2">
                <Small label="Ayer">{fg.yesterday ?? "—"}</Small>
                <Small label="Hace una semana">{fg.weekAgo ?? "—"}</Small>
                <Small label="Hace un mes">{fg.monthAgo ?? "—"}</Small>
              </div>
              <Spark points={fg.history} format={(v) => String(Math.round(v))} bands={[25, 75]} label="Miedo y codicia, último mes" />
            </div>
          ) : (
            <Missing what="el índice" />
          )}
        </Indicator>

        <Indicator
          title="Tendencia de Bitcoin"
          what="El precio frente a su media de los últimos 200 días."
          value={b?.vsMa200Pct != null ? pct(b.vsMa200Pct, 1) : "—"}
          zone={b?.vsMa200Pct != null ? trendZone(b.vsMa200Pct) : null}
          how={
            <>
              <p>La media de 200 días es la referencia más usada para saber si el mercado está, de fondo, en subida o en bajada.</p>
              <p>
                <b>Por encima</b>: tendencia alcista; las caídas suelen ser oportunidades. <b>Por debajo</b>: tendencia bajista; los rebotes suelen quedarse cortos. Cuando el
                precio la cruza, el mercado suele cambiar de humor.
              </p>
            </>
          }
        >
          {b ? (
            <div className="space-y-2">
              <Spark
                points={b.history.map((h) => ({ t: h.t, v: h.c }))}
                second={b.history.map((h) => h.ma200)}
                secondLabel="media 200"
                height={96}
                format={(v) => eur(v, 0)}
                label="Bitcoin, últimos 6 meses"
              />
              <div className="flex items-center gap-4 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-blue-600" />Precio</span>
                <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-slate-400" />Media de 200 días {b.ma200 !== null ? `(${eur(b.ma200, 0)})` : ""}</span>
              </div>
            </div>
          ) : (
            <Missing what="el precio de Bitcoin" />
          )}
        </Indicator>

        <Indicator
          title="RSI de Bitcoin"
          what="Lo rápido que ha subido o bajado en las últimas dos semanas, de 0 a 100."
          value={b?.rsi14 != null ? Math.round(b.rsi14) : "—"}
          zone={b?.rsi14 != null ? rsiZone(b.rsi14) : null}
          how={
            <>
              <p>Compara las subidas con las bajadas de los últimos 14 días.</p>
              <p>
                <b>Por debajo de {RSI_LOW}</b> (sobrevendido): ha caído muy deprisa y puede rebotar. <b>Por encima de {RSI_HIGH}</b> (sobrecomprado): ha subido muy deprisa y
                suele frenar.
              </p>
              <p>
                Ojo: en una tendencia bajista, lo sobrevendido puede seguir cayendo. Por eso se mira junto a la tendencia, nunca solo. Comprar solo porque está sobrevendido es
                lo que hacían los «rebotes» de FARO, y no funcionó.
              </p>
            </>
          }
        >
          {b?.rsi14 != null ? (
            <div className="space-y-3">
              <Gauge
                value={b.rsi14}
                ticks={[0, RSI_LOW, RSI_HIGH, 100]}
                stops={[
                  { to: RSI_LOW, cls: "bg-amber-300" },
                  { to: RSI_HIGH, cls: "bg-slate-200" },
                  { to: 100, cls: "bg-amber-300" },
                ]}
              />
              <Spark points={b.rsiHistory} format={(v) => String(Math.round(v))} bands={[RSI_LOW, RSI_HIGH]} label="RSI de Bitcoin, últimos 3 meses" />
            </div>
          ) : (
            <Missing what="el RSI" />
          )}
        </Indicator>

        <Indicator
          title="Liquidez y actividad"
          what="Cuánto dinero se está moviendo hoy y cuánto vale todo el mercado."
          value={b?.volRatio != null ? <>{nf(1).format(b.volRatio)}×<span className="ml-1 text-sm font-medium text-slate-400">lo normal</span></> : "—"}
          zone={b?.volRatio != null ? volumeZone(b.volRatio) : null}
          how={
            <>
              <p>El primer número es el volumen de Bitcoin en euros de las últimas 24 h comparado con la media del último mes (1× = un día normal).</p>
              <p>
                Un movimiento con <b>mucho volumen</b> es más fiable que uno con poco: hay mucha gente detrás. Con <b>poco volumen</b>, cualquier compra o venta grande mueve
                el precio con facilidad.
              </p>
              <p>
                El <b>peso de Bitcoin</b> es qué parte del valor de todas las cripto es Bitcoin. Si sube, el dinero se refugia en Bitcoin; si baja, se anima con monedas más
                pequeñas (y arriesgadas).
              </p>
            </>
          }
        >
          {b || p.global ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Small label="Volumen de Bitcoin (24 h, €)">{b?.volume24hEur != null ? big(b.volume24hEur) : "—"}</Small>
              <Small label="Volumen de todas las cripto (24 h)">{p.global ? big(p.global.volumeEur) : "—"}</Small>
              <Small label="Valor de todas las cripto">{p.global ? big(p.global.marketCapEur) : "—"}</Small>
              <Small label="Peso de Bitcoin">{p.global ? `${nf(1).format(p.global.btcDominance)} %` : "—"}</Small>
            </div>
          ) : (
            <Missing what="el volumen" />
          )}
        </Indicator>

        <Indicator
          title="Funding de los futuros"
          what="Lo que pagan los que apuestan a que sube a los que apuestan a que baja."
          value={p.funding ? `${nf(3).format(p.funding.ratePct)} %` : "—"}
          zone={p.funding ? fundingZone(p.funding.ratePct) : null}
          how={
            <>
              <p>
                En los futuros de Bitcoin, cada 8 horas un lado le paga al otro para que el precio no se aleje del real. Nosotros no operamos futuros, pero es un buen
                termómetro de cómo está apostando el resto.
              </p>
              <p>
                <b>Alrededor de +0,01 %</b> es lo normal. <b>Desde +{nf(2).format(FUNDING_HIGH)} %</b>: demasiada gente apostando a que sube, y suelen venir sacudidas a la baja.{" "}
                <b>Negativo</b>: dominan los que apuestan a que baja; si el precio aguanta, pueden tener que cerrar y empujarlo hacia arriba.
              </p>
              {p.funding && <p className="text-xs text-slate-400">Fuente: {p.funding.source}.</p>}
            </>
          }
        >
          {p.funding ? (
            <Spark points={p.funding.history} format={(v) => `${nf(3).format(v)} %`} bands={[0, FUNDING_HIGH]} label="Funding, último mes" />
          ) : (
            <Missing what="el funding" />
          )}
        </Indicator>

        <Indicator
          title="El dólar"
          what="Índice del dólar (DXY): el dólar frente a las grandes monedas."
          value={p.dollar ? nf(2).format(p.dollar.value) : "—"}
          zone={p.dollar?.ch30d != null ? dollarZone(p.dollar.ch30d) : null}
          how={
            <>
              <p>Cuando el dólar se fortalece, el dinero suele salir de lo arriesgado (como las cripto) hacia lo seguro. Cuando se debilita, suele pasar lo contrario.</p>
              <p>Es una relación floja y de fondo: sirve para entender semanas o meses, no el día a día.</p>
            </>
          }
        >
          {p.dollar ? (
            <div className="space-y-3">
              <Small label="En el último mes">{p.dollar.ch30d != null ? pct(p.dollar.ch30d, 1) : "—"}</Small>
              <Spark points={p.dollar.history} format={(v) => nf(2).format(v)} label="Índice del dólar, últimos meses" />
            </div>
          ) : (
            <Missing what="el dólar" />
          )}
        </Indicator>
      </div>

      {p.phase && (
        <section className="border-t border-slate-100 pt-4 text-sm text-slate-600">
          <h3 className="text-[15px] font-semibold text-slate-900">Fase del mercado (detector de CAMALEÓN)</h3>
          <p className="mt-1">
            El mercado está en <b className="text-slate-900">modo {p.phase.mode}</b> desde hace {p.phase.days} {p.phase.days === 1 ? "día" : "días"}
            {p.phase.typicalDays !== null && p.phase.samples >= 5 ? ` (estas fases suelen durar unos ${p.phase.typicalDays} días)` : ""}. Cambiaría si Bitcoin cierra el día
            {p.phase.mode === "ataque" ? " por debajo" : " por encima"} de {eur(p.phase.flipPrice, 0)} ({pct(p.phase.flipPct, 1)} desde ahora).
          </p>
        </section>
      )}

      {/* Cómo usarlos: lo que da confianza es saber sus límites. */}
      <section className="rounded-2xl bg-slate-50 px-5 py-4 text-sm leading-relaxed text-slate-600">
        <h3 className="text-[15px] font-semibold text-slate-900">Cómo usar estos indicadores</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <b>Ninguno decide solo.</b> Lo que pesa es cuando varios dicen lo mismo: por ejemplo, miedo extremo + RSI sobrevendido + precio por encima de su media de 200 días
            es muy distinto que lo mismo con el precio por debajo.
          </li>
          <li>Describen cómo está el mercado, no lo que va a hacer. No son una recomendación de compra o venta.</li>
          <li>Guardamos su valor cada día para medir, con las ideas de FARO, cuáles ayudan de verdad a acertar. Los que demuestren servir pasarán a sus reglas.</li>
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          Fuentes: Bitvavo (Bitcoin en euros), alternative.me (miedo y codicia), CoinGecko (mercado total), Binance u OKX (funding) y Yahoo Finance (índice del dólar).
        </p>
      </section>
    </>
  );
}
