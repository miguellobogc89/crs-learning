"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, FlaskConical, Loader2, Save } from "lucide-react";
import type { accountDetail } from "@/lib/trading/accounts";
import { PATTERN_LIBRARY } from "@/lib/trading/library";
import type { SimResult, SimTrade } from "@/lib/trading/simulate";
import { PATTERN_SHORT, api, dayFmt, errorText, eur, eur0, field, ghost, int, num, panel, pct, primary, th, tone } from "./format";
import { refreshTrading } from "./navigation";

type Detail = Awaited<ReturnType<typeof accountDetail>>;
type Response = { months: number; market: "bolsa" | "crypto"; result: SimResult };

const PERIODS = [
  { months: 1, label: "1 mes" },
  { months: 3, label: "3 meses" },
  { months: 6, label: "6 meses" },
  { months: 12, label: "1 año" },
  { months: 24, label: "2 años" },
  { months: 36, label: "3 años" },
];

const REASON: Record<string, string> = {
  stop: "Stop (salió mal)",
  objetivo: "Objetivo (salió bien)",
  "break-even": "Stop en la entrada",
  tiempo: "Por tiempo",
  manual: "Manual",
  abierta: "Sigue abierta",
};

type Form = {
  market: "bolsa" | "crypto";
  months: number;
  capital: number;
  riskPct: number;
  minScore: number;
  maxOpen: number;
  maxPositionPct: number;
  allowShort: boolean;
  breakeven: boolean;
  patterns: string[];
};

function CompareChart({ curve, capital, bench }: { curve: SimResult["curve"]; capital: number; bench: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 900;
  const h = 260;
  const L = 56;
  const R = 12;
  const T = 12;
  const B = 24;
  if (curve.length < 2) return null;
  const vals = curve.flatMap((p) => [p.equity, p.benchmark ?? p.equity]).concat(capital);
  const lo = Math.min(...vals) * 0.99;
  const hi = Math.max(...vals) * 1.01;
  const x = (i: number) => L + (i / (curve.length - 1)) * (w - L - R);
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (h - T - B);
  const line = (get: (p: SimResult["curve"][number]) => number | null) =>
    curve
      .map((p, i) => {
        const v = get(p);
        return v === null ? "" : `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      })
      .join("");
  const ticks = 5;
  const hp = hover !== null ? curve[hover] : curve[curve.length - 1];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 pt-3 text-xs text-slate-600">
        <span className="font-medium text-slate-900">{dayFmt(hp.day)}</span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-0.5 w-4 bg-blue-600" /> Siguiendo la app <b className="tabular-nums text-slate-900">{eur0(hp.equity)}</b>
        </span>
        {hp.benchmark !== null && (
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-0.5 w-4 bg-slate-400" /> Comprar {bench} y olvidarse <b className="tabular-nums text-slate-900">{eur0(hp.benchmark)}</b>
          </span>
        )}
        <span>Invertido {eur0(hp.invested)}</span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="block h-[260px] w-full"
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * w;
          const i = Math.round(((px - L) / (w - L - R)) * (curve.length - 1));
          setHover(i >= 0 && i < curve.length ? i : null);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: ticks + 1 }, (_, k) => lo + ((hi - lo) * k) / ticks).map((v) => (
          <g key={v}>
            <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke="#f1f5f9" />
            <text x={L - 6} y={y(v) + 3} fontSize="10" fill="#94a3b8" textAnchor="end">
              {int(Math.round(v))}
            </text>
          </g>
        ))}
        <line x1={L} x2={w - R} y1={y(capital)} y2={y(capital)} stroke="#cbd5e1" strokeDasharray="4 4" />
        <path d={line((p) => p.benchmark)} fill="none" stroke="#94a3b8" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <path d={line((p) => p.equity)} fill="none" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={h - B} stroke="#94a3b8" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        <text x={L} y={h - 6} fontSize="10" fill="#94a3b8">
          {dayFmt(curve[0].day)}
        </text>
        <text x={w - R} y={h - 6} fontSize="10" fill="#94a3b8" textAnchor="end">
          {dayFmt(curve[curve.length - 1].day)}
        </text>
      </svg>
    </div>
  );
}

function monthLabel(m: string) {
  return new Intl.DateTimeFormat("es-ES", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${m}-01`));
}

export function SimulatorPanel({ onOpenChart }: { onOpenChart: (symbol: string) => void }) {
  const [form, setForm] = useState<Form | null>(null);
  const [res, setRes] = useState<Response | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [showTrades, setShowTrades] = useState(false);

  const run = useCallback(async (f: Form) => {
    setRunning(true);
    setError(null);
    setSaved(null);
    try {
      setRes(await api<Response>("simulate", f));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRunning(false);
    }
  }, []);

  // Arranca con las reglas actuales de la cartera y un año hacia atrás.
  useEffect(() => {
    api<Detail>("account")
      .then((d) => {
        const s = d.summary.settings;
        const f: Form = {
          market: "bolsa",
          months: 12,
          capital: Math.round(d.summary.initialCapital),
          riskPct: s.riskPerTradePct,
          minScore: s.minScore,
          maxOpen: s.maxOpenPositions,
          maxPositionPct: s.maxPositionPct,
          allowShort: s.allowShort,
          breakeven: s.breakeven,
          patterns: s.patterns,
        };
        setForm(f);
        void run(f);
      })
      .catch((e) => setError(errorText(e)));
  }, [run]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const applyRules = async () => {
    if (!form) return;
    try {
      await api("settings", {
        riskPerTradePct: form.riskPct,
        minScore: form.minScore,
        maxOpenPositions: form.maxOpen,
        maxPositionPct: form.maxPositionPct,
        allowShort: form.allowShort,
        breakeven: form.breakeven,
        patterns: form.patterns,
      });
      setSaved("Reglas guardadas en tu cartera");
      refreshTrading();
    } catch (e) {
      setSaved(errorText(e));
    }
  };

  const r = res?.result;
  const simMarket = res?.market ?? form?.market ?? "bolsa";
  const bench = simMarket === "crypto" ? "Bitcoin" : "el IBEX 35";
  const benchShort = simMarket === "crypto" ? "Bitcoin" : "IBEX 35";
  const verdict = useMemo(() => {
    if (!r) return null;
    const gained = r.finalEquity - r.capital;
    const vs = r.benchmarkPct !== null ? r.returnPct - r.benchmarkPct : null;
    return { gained, vs };
  }, [r]);

  if (!form)
    return error ? (
      <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
    ) : (
      <div className="flex h-40 items-center justify-center border border-slate-200 bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );

  return (
    <div className="space-y-4">
      <section className={panel}>
        <div className="flex flex-wrap items-end gap-4 px-4 py-4">
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">Mercado</div>
            <div className="flex border border-slate-200">
              {(["bolsa", "crypto"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    const f = { ...form, market: m };
                    setForm(f);
                    void run(f);
                  }}
                  className={`px-3 py-2 text-sm ${form.market === m ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  {m === "bolsa" ? "Bolsa" : "Crypto"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">Empezando hace</div>
            <div className="flex border border-slate-200">
              {PERIODS.map((p) => (
                <button
                  key={p.months}
                  type="button"
                  onClick={() => {
                    const f = { ...form, months: p.months };
                    setForm(f);
                    void run(f);
                  }}
                  className={`px-3 py-2 text-sm ${form.months === p.months ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Con un capital de (€)</span>
            <input type="number" className={`${field} w-32 tabular-nums`} value={form.capital} onChange={(e) => set("capital", Number(e.target.value))} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Arriesgando por operación (%)</span>
            <input type="number" step="0.1" className={`${field} w-28 tabular-nums`} value={form.riskPct} onChange={(e) => set("riskPct", Number(e.target.value))} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Nota mínima de la señal</span>
            <input type="number" className={`${field} w-28 tabular-nums`} value={form.minScore} onChange={(e) => set("minScore", Number(e.target.value))} />
          </label>
          <button type="button" className={primary} onClick={() => run(form)} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            {running ? "Simulando…" : "Simular"}
          </button>
          <button type="button" className="ml-auto text-xs font-medium text-blue-700 hover:underline" onClick={() => setAdvanced(!advanced)}>
            {advanced ? "Menos opciones" : "Más opciones"}
          </button>
        </div>
        {advanced && (
          <div className="space-y-3 border-t border-slate-100 px-4 py-4">
            <div className="flex flex-wrap gap-4">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Posiciones a la vez</span>
                <input type="number" className={`${field} w-24`} value={form.maxOpen} onChange={(e) => set("maxOpen", Number(e.target.value))} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Máximo por posición (%)</span>
                <input type="number" className={`${field} w-24`} value={form.maxPositionPct} onChange={(e) => set("maxPositionPct", Number(e.target.value))} />
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={form.breakeven} onChange={(e) => set("breakeven", e.target.checked)} /> Stop a break-even
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={form.allowShort} onChange={(e) => set("allowShort", e.target.checked)} /> Permitir cortos
              </label>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-slate-600">Figuras (ninguna marcada = todas)</div>
              <div className="flex flex-wrap gap-2">
                {PATTERN_LIBRARY.map((p) => {
                  const on = form.patterns.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => set("patterns", on ? form.patterns.filter((x) => x !== p.key) : [...form.patterns, p.key])}
                      className={`border px-2.5 py-1 text-xs ${on ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {error && <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {r && verdict && (
        <div className={`space-y-4 ${running ? "opacity-60" : ""}`}>
          <section className={`${panel} border-l-4 ${verdict.gained >= 0 ? "border-l-emerald-500" : "border-l-red-500"} px-5 py-4`}>
            <p className="text-[15px] leading-relaxed text-slate-800">
              Si el <b>{dayFmt(r.start)}</b> hubieras empezado con <b>{eur0(r.capital)}</b> siguiendo la app con estas reglas, hoy tendrías{" "}
              <b className={tone(verdict.gained)}>{eur0(r.finalEquity)}</b>{" "}
              <span className={tone(verdict.gained)}>
                ({verdict.gained >= 0 ? "+" : ""}
                {eur0(verdict.gained)}, {pct(r.returnPct)})
              </span>
              .
              {r.benchmarkPct !== null && (
                <>
                  {" "}
                  Comprando {bench} ese día y sin tocarlo habrías hecho <b className={tone(r.benchmarkPct)}>{pct(r.benchmarkPct)}</b>
                  {verdict.vs !== null && (
                    <>
                      : la app {verdict.vs >= 0 ? "lo habría batido" : "habría quedado por debajo"} por{" "}
                      <b>{num(Math.abs(verdict.vs), 1)} puntos</b>
                    </>
                  )}
                  .
                </>
              )}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {r.trades + r.openTrades === 0
                ? "En ese periodo ninguna señal habría pasado tus filtros."
                : `${r.trades} operaciones cerradas (${num(r.winRate * 100, 0)} % ganadoras)${r.openTrades ? ` y ${r.openTrades} todavía abiertas` : ""}. En el peor momento la cartera llegó a caer un ${num(r.maxDrawdownPct, 1)} % desde su máximo. De media tuviste invertido el ${num(r.exposurePct, 0)} % del dinero.`}
            </p>
          </section>

          <div className="grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Resultado", pct(r.returnPct), eur0(r.finalEquity - r.capital), tone(r.returnPct)],
              [benchShort, pct(r.benchmarkPct), "comprar y mantener", tone(r.benchmarkPct)],
              ["Operaciones", int(r.trades), `${r.openTrades} abiertas`, "text-slate-500"],
              ["Acierto", r.trades ? `${num(r.winRate * 100, 0)} %` : "—", `R medio ${num(r.avgR, 2)}`, tone(r.avgR)],
              ["Peor caída", `−${num(r.maxDrawdownPct, 1)} %`, r.maxDrawdownDay ? `el ${dayFmt(r.maxDrawdownDay)}` : "", "text-red-700"],
              ["Comisiones", eur0(r.fees), `${num(r.avgDays, 0)} días por operación`, "text-slate-500"],
            ].map(([label, value, sub, cls]) => (
              <div key={label} className="bg-white px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
                <div className={`mt-1 text-lg font-semibold tabular-nums ${label === "Resultado" || label === benchShort ? cls : "text-slate-900"}`}>{value}</div>
                <div className={`text-xs ${cls}`}>{sub}</div>
              </div>
            ))}
          </div>

          <section className={panel}>
            <header className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Tu dinero día a día</h3>
            </header>
            <CompareChart curve={r.curve} capital={r.capital} bench={bench} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className={panel}>
              <header className="border-b border-slate-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Mes a mes</h3>
              </header>
              <div className="grid grid-cols-3 gap-px bg-slate-100 sm:grid-cols-4">
                {r.monthly.map((m) => (
                  <div key={m.month} className="bg-white px-3 py-2">
                    <div className="text-xs capitalize text-slate-500">{monthLabel(m.month)}</div>
                    <div className={`font-semibold tabular-nums ${tone(m.returnPct)}`}>{pct(m.returnPct)}</div>
                    {m.benchmarkPct !== null && <div className="text-[11px] tabular-nums text-slate-400">{benchShort} {pct(m.benchmarkPct)}</div>}
                  </div>
                ))}
              </div>
            </section>
            <section className={panel}>
              <header className="border-b border-slate-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Qué figuras te habrían dado dinero</h3>
              </header>
              {r.byPattern.length === 0 ? (
                <p className="px-4 py-4 text-sm text-slate-500">Sin operaciones cerradas.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>Figura</th>
                      <th className={`${th} text-right`}>Operaciones</th>
                      <th className={`${th} text-right`}>Acierto</th>
                      <th className={`${th} text-right`}>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.byPattern.map((p) => (
                      <tr key={p.pattern} className="border-t border-slate-100">
                        <td className="px-3 py-2">{PATTERN_SHORT[p.pattern]}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.trades}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{num((p.wins / p.trades) * 100, 0)} %</td>
                        <td className={`px-3 py-2 text-right font-medium tabular-nums ${tone(p.pnl)}`}>{eur0(p.pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          {(r.bestTrade || r.worstTrade) && (
            <div className="grid gap-4 md:grid-cols-2">
              {r.bestTrade && <TradeHighlight title="La mejor operación" t={r.bestTrade} onOpenChart={onOpenChart} />}
              {r.worstTrade && r.worstTrade !== r.bestTrade && <TradeHighlight title="La peor operación" t={r.worstTrade} onOpenChart={onOpenChart} />}
            </div>
          )}

          <section className={panel}>
            <button type="button" onClick={() => setShowTrades(!showTrades)} className="flex w-full items-center justify-between px-4 py-3 text-left">
              <span className="text-sm font-semibold text-slate-900">Todas las operaciones ({r.list.length})</span>
              <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${showTrades ? "rotate-180" : ""}`} />
            </button>
            {showTrades && (
              <div className="overflow-x-auto border-t border-slate-200">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>Valor</th>
                      <th className={th}>Figura</th>
                      <th className={th}>Entrada</th>
                      <th className={th}>Salida</th>
                      <th className={th}>Motivo</th>
                      <th className={`${th} text-right`}>Cantidad</th>
                      <th className={`${th} text-right`}>Resultado</th>
                      <th className={`${th} text-right`}>R</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.list.map((t, k) => (
                      <tr key={k} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => onOpenChart(t.symbol)} className="font-medium text-slate-900 hover:text-blue-700">
                            {t.name}
                          </button>
                          <div className="text-xs text-slate-500">nota {t.score}</div>
                        </td>
                        <td className="px-3 py-2">{PATTERN_SHORT[t.pattern]}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {eur(t.entryPrice)} <span className="text-xs text-slate-500">{dayFmt(t.entryDay)}</span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {eur(t.exitPrice)} <span className="text-xs text-slate-500">{t.exitDay ? dayFmt(t.exitDay) : "hoy"}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">{REASON[t.reason] ?? t.reason}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{int(t.quantity)}</td>
                        <td className={`px-3 py-2 text-right font-medium tabular-nums ${tone(t.pnl)}`}>{eur0(t.pnl)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${tone(t.r)}`}>{num(t.r, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={`${panel} flex flex-wrap items-center gap-3 px-4 py-3`}>
            <p className="flex-1 text-sm text-slate-600">¿Te convencen estas reglas? Guárdalas para tu cartera virtual y para las recomendaciones de cada día.</p>
            {saved && <span className="text-sm text-slate-600">{saved}</span>}
            <button type="button" className={ghost} onClick={applyRules}>
              <Save className="h-4 w-4" /> Usar estas reglas
            </button>
          </section>

          <p className="text-xs leading-relaxed text-slate-500">
            Cómo se calcula: la app recorre el pasado sesión a sesión. Cada tarde mira solo los datos disponibles hasta ese día,
            elige las señales igual que hoy y compra a la apertura del día siguiente, con comisiones y deslizamiento. El
            historial de cada figura solo cuenta operaciones ya terminadas en ese momento. Limitación: se usan las empresas que
            están hoy en el índice o en la lista de criptomonedas, y eso tiende a favorecer un poco el resultado (las que
            cayeron mucho y salieron no aparecen).
          </p>
        </div>
      )}
    </div>
  );
}

function TradeHighlight({ title, t, onOpenChart }: { title: string; t: SimTrade; onOpenChart: (s: string) => void }) {
  return (
    <section className={`${panel} px-4 py-3`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <button type="button" onClick={() => onOpenChart(t.symbol)} className="font-semibold text-slate-900 hover:text-blue-700">
          {t.name}
        </button>
        <span className={`text-lg font-semibold tabular-nums ${tone(t.pnl)}`}>{eur0(t.pnl)}</span>
      </div>
      <p className="text-sm text-slate-600">
        {PATTERN_SHORT[t.pattern]} · {int(t.quantity)} {/-EUR$/.test(t.symbol) ? t.symbol.replace(/-EUR$/, "") : "acciones"} de {eur(t.entryPrice)} a {eur(t.exitPrice)} ({dayFmt(t.entryDay)} → {t.exitDay ? dayFmt(t.exitDay) : "hoy"}) ·{" "}
        {REASON[t.reason] ?? t.reason}
      </p>
    </section>
  );
}
