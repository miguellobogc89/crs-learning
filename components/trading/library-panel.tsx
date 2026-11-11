"use client";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import type { getLibrary } from "@/lib/trading/service";
import { PatternSketch } from "./candle-chart";
import { PATTERN_SHORT, api, dayFmt, errorText, int, num, panel, th, tone } from "./format";
import { ErrorNote, LoadingCard } from "./ui";
import { AssetIcon } from "./asset-icon";

type Library = Awaited<ReturnType<typeof getLibrary>>;

const FAMILY_TONE = {
  Giro: "bg-violet-50 text-violet-700 border-violet-200",
  Continuación: "bg-blue-50 text-blue-700 border-blue-200",
  Neutral: "bg-slate-50 text-slate-700 border-slate-200",
} as const;

export function LibraryPanel() {
  const [data, setData] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [market, setMarket] = useState<"bolsa" | "crypto">("bolsa");

  useEffect(() => {
    api<Library>(`library?market=${market}`).then(setData).catch((e) => setError(errorText(e)));
  }, [market]);
  const where = market === "crypto" ? "en crypto" : "en el IBEX";

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data)
    return (
      <LoadingCard height="h-40" />
    );

  const bt = data.backtest;
  const ranked = [...data.patterns].filter((p) => p.stats && p.stats.trades > 0).sort((a, b) => (b.stats!.adjustedExpectancy ?? 0) - (a.stats!.adjustedExpectancy ?? 0));

  return (
    <div className="space-y-6">
      <section className={panel}>
        <header className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">Qué ha funcionado {market === "crypto" ? "en las criptomonedas" : "en el IBEX 35"}</h2>
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
              {(["bolsa", "crypto"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMarket(m)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium ${market === m ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  {m === "bolsa" ? "Bolsa" : "Crypto"}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {bt
              ? `Backtest de ${int(bt.trades)} operaciones en ${bt.instruments} ${market === "crypto" ? "criptomonedas" : "valores"} hasta el ${dayFmt(bt.asOf)}. Entrada en la apertura siguiente a la ruptura, stop y objetivo de cada figura, comisión del 0,1 % por lado y deslizamiento. Una operación a la vez por valor.`
              : "Todavía no hay backtest: se calcula al terminar la primera descarga de cotizaciones."}
          </p>
        </header>
        {ranked.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Figura</th>
                  <th className={`${th} text-right`}>Operaciones</th>
                  <th className={`${th} text-right`}>Acierto</th>
                  <th className={`${th} text-right`}>R medio</th>
                  <th className={`${th} text-right`}>Factor de beneficio</th>
                  <th className={`${th} text-right`}>Resultado medio</th>
                  <th className={`${th} text-right`}>Duración media</th>
                  <th className={`${th} text-right`}>Peor racha</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((p) => (
                  <tr key={p.key} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {p.name}
                      {p.stats!.trades >= 30 && p.stats!.avgR < 0 && (
                        <span className="ml-2 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700" title="Con este historial la app no recomienda entrar con esta figura">
                          Vetada
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.stats!.trades}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(p.stats!.winRate * 100, 0)} %</td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${tone(p.stats!.avgR)}`}>
                      {p.stats!.avgR > 0 ? "+" : ""}
                      {num(p.stats!.avgR, 2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.stats!.profitFactor ? num(p.stats!.profitFactor, 2) : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${tone(p.stats!.avgPct)}`}>{num(p.stats!.avgPct, 2)} %</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(p.stats!.avgBars, 0)} ses.</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-700">−{num(p.stats!.maxDrawdownR, 1)} R</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              R = resultado en múltiplos del riesgo inicial (1 R es lo que pierdes si salta el stop). Una figura con R medio positivo
              ha ganado dinero en el pasado aunque acierte menos de la mitad de las veces. Las recomendaciones dan más peso a las
              figuras con mejor historial, y las que tienen R medio negativo con 30 operaciones o más quedan vetadas.
            </p>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.patterns.map((p) => (
          <article key={p.key} className={panel}>
            <div className="flex gap-4 border-b border-slate-100 p-4">
              <div className="shrink-0 rounded-xl border border-slate-100 bg-slate-50">
                <PatternSketch points={p.sketch} trigger={p.sketchTrigger} direction={p.direction} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[15px] font-semibold text-slate-900">{p.name}</h3>
                  <span className={`border px-1.5 py-0.5 text-xs ${FAMILY_TONE[p.family]}`}>{p.family}</span>
                  <span className={`text-xs font-medium ${p.direction === "long" ? "text-emerald-700" : "text-red-700"}`}>
                    {p.key === "triangle_sym" ? "Según tendencia" : p.direction === "long" ? "Alcista" : "Bajista"}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{p.summary}</p>
                {p.stats && p.stats.trades > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    {PATTERN_SHORT[p.key]} {where}: {p.stats.trades} operaciones · {num(p.stats.winRate * 100, 0)} % de acierto ·{" "}
                    <span className={tone(p.stats.avgR)}>{num(p.stats.avgR, 2)} R</span> de media
                  </p>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 px-4 py-3 text-sm">
              <dt className="font-medium text-blue-700">Entrada</dt>
              <dd className="text-slate-800">{p.entry}</dd>
              <dt className="font-medium text-red-700">Stop</dt>
              <dd className="text-slate-800">{p.stop}</dd>
              <dt className="font-medium text-emerald-700">Objetivo</dt>
              <dd className="text-slate-800">{p.target}</dd>
            </dl>
            <button
              type="button"
              onClick={() => setOpen(open === p.key ? null : p.key)}
              className="w-full border-t border-slate-100 px-4 py-2 text-left text-xs font-medium text-blue-700 hover:bg-slate-50"
            >
              {open === p.key ? "Ocultar detalles" : "Cómo se reconoce, cuánto invertir y errores típicos"}
            </button>
            {open === p.key && (
              <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-700">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Cómo se reconoce</div>
                  <ul className="space-y-1">
                    {p.identify.map((x) => (
                      <li key={x}>· {x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Con cuánto</div>
                  <p>{p.sizing}</p>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Errores típicos</div>
                  <ul className="space-y-1">
                    {p.pitfalls.map((x) => (
                      <li key={x}>· {x}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>

      {bt && bt.recent.length > 0 && (
        <section className={`${panel} overflow-x-auto`}>
          <header className="border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <History className="h-5 w-5 text-blue-600" /> Últimas operaciones del backtest
              </h2>
          </header>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th className={th}>Valor</th>
                <th className={th}>Figura</th>
                <th className={th}>Entrada</th>
                <th className={th}>Salida</th>
                <th className={th}>Motivo</th>
                <th className={`${th} text-right`}>Resultado</th>
                <th className={`${th} text-right`}>R</th>
              </tr>
            </thead>
            <tbody>
              {bt.recent.map((t, k) => (
                <tr key={k} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <span className="flex items-center gap-2">
                      <AssetIcon symbol={t.symbol} size="xs" />
                      {t.symbol}
                    </span>
                  </td>
                  <td className="px-3 py-2">{PATTERN_SHORT[t.pattern]}</td>
                  <td className="px-3 py-2 tabular-nums">{dayFmt(t.entryDay)}</td>
                  <td className="px-3 py-2 tabular-nums">{t.reason === "open" ? "abierta" : dayFmt(t.exitDay)}</td>
                  <td className="px-3 py-2 text-slate-600">{{ stop: "Stop", target: "Objetivo", time: "Tiempo", open: "En curso" }[t.reason]}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${tone(t.pct)}`}>{num(t.pct, 2)} %</td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${tone(t.r)}`}>{num(t.r, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
