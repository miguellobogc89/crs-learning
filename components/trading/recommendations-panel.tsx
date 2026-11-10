"use client";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, LineChart, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Recommendation } from "@/lib/trading/recommend";
import type { Overview } from "./trading-workspace";
import { ACTION_LABEL, ACTION_TONE, PATTERN_SHORT, STATUS_LABEL, dayFmt, eur, eur0, ghost, int, num, panel, pct, primary, th } from "./format";
import { OrderDialog, type OrderDraft } from "./order-dialog";

const FILTERS = [
  { key: "accion", label: "Para actuar hoy" },
  { key: "vigilar", label: "En vigilancia" },
  { key: "todas", label: "Todas" },
] as const;

function ScoreBar({ score, strong }: { score: number; strong: boolean }) {
  return (
    <div className="w-20">
      <div className="flex items-baseline justify-between text-xs">
        <b className={strong ? "text-slate-900" : "text-slate-500"}>{score}</b>
        <span className="text-slate-400">/100</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full bg-slate-100">
        <div className={`h-1.5 ${score >= 70 ? "bg-emerald-500" : score >= 55 ? "bg-amber-500" : "bg-slate-400"}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function RecommendationsPanel({
  data,
  onChanged,
  onOpenChart,
}: {
  data: Overview;
  onChanged: () => void;
  onOpenChart: (symbol: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("accion");
  const [onlyStrong, setOnlyStrong] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const list = useMemo(() => {
    let l = data.recommendations;
    if (filter === "accion") l = l.filter((r) => r.action !== "vigilar");
    if (filter === "vigilar") l = l.filter((r) => r.action === "vigilar");
    if (onlyStrong) l = l.filter((r) => r.strong);
    return l;
  }, [data.recommendations, filter, onlyStrong]);

  const top = data.recommendations.filter((r) => r.strong && (r.action === "comprar" || r.action === "vender_corto")).slice(0, 3);

  const toOrder = (r: Recommendation) =>
    setDraft({
      symbol: r.symbol,
      name: r.name,
      direction: r.direction,
      reference: r.lastClose,
      quantity: r.sizing?.quantity ?? 0,
      stop: r.stop,
      target: r.target,
      pattern: r.pattern,
      signalKey: r.key,
      score: r.score,
      maxHoldDays: r.maxHoldDays,
      notes: r.plan,
    });

  return (
    <div className="space-y-4">
      {notice && <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      <section className={panel}>
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Plan para la próxima sesión</h2>
          <p className="text-xs text-slate-500">
            Las mejores señales que pasan tu umbral ({data.account.settings.minScore}/100), con el tamaño calculado para arriesgar el{" "}
            {num(data.account.settings.riskPerTradePct, 1)} % de la cartera en cada una.
          </p>
        </header>
        {top.length === 0 ? (
          <p className="px-4 py-5 text-sm text-slate-600">
            Hoy no hay ninguna entrada que pase el filtro. No operar también es una decisión: revisa las figuras en vigilancia, que te
            dicen a qué precio entrarías si rompen.
          </p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {top.map((r, k) => (
              <li key={r.key} className="flex flex-wrap items-start gap-4 px-4 py-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-slate-900 text-sm font-semibold text-white">{k + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{r.name}</span>
                    <span className="text-xs text-slate-500">{r.symbol}</span>
                    <span className={`border px-1.5 py-0.5 text-xs font-medium ${ACTION_TONE[r.action]}`}>{ACTION_LABEL[r.action]}</span>
                    <span className="text-xs text-slate-600">{r.patternName}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">{r.plan}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <ScoreBar score={r.score} strong={r.strong} />
                  <button type="button" className={ghost} onClick={() => onOpenChart(r.symbol)}>
                    <LineChart className="h-4 w-4" /> Gráfico
                  </button>
                  <button type="button" className={primary} onClick={() => toOrder(r)} disabled={!r.sizing?.quantity}>
                    Ejecutar en cartera
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border border-slate-200 bg-white">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-sm ${filter === f.key ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={onlyStrong} onChange={(e) => setOnlyStrong(e.target.checked)} />
          Solo por encima de mi umbral
        </label>
        <span className="ml-auto text-xs text-slate-500">{list.length} señales</span>
      </div>

      <div className={`${panel} overflow-x-auto`}>
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Valor</th>
              <th className={th}>Acción</th>
              <th className={th}>Figura</th>
              <th className={`${th} text-right`}>Entrada</th>
              <th className={`${th} text-right`}>Stop</th>
              <th className={`${th} text-right`}>Objetivo</th>
              <th className={`${th} text-right`}>B/R</th>
              <th className={`${th} text-right`}>Tamaño</th>
              <th className={th}>Puntuación</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                  No hay señales con este filtro.
                </td>
              </tr>
            ) : (
              list.map((r) => (
                <Fragment key={r.key}>
                  <tr className={`border-t border-slate-100 align-top hover:bg-slate-50/60 ${r.strong ? "" : "text-slate-500"}`}>
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => onOpenChart(r.symbol)} className="text-left">
                        <div className="font-medium text-slate-900 hover:text-blue-700">{r.name}</div>
                        <div className="text-xs text-slate-500">
                          {r.symbol} · {eur(r.lastClose)}
                        </div>
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block border px-1.5 py-0.5 text-xs font-medium ${ACTION_TONE[r.action]}`}>{ACTION_LABEL[r.action]}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-slate-800">{PATTERN_SHORT[r.pattern]}</div>
                      <div className="text-xs text-slate-500">
                        {STATUS_LABEL[r.status]}
                        {r.signalDate ? ` · ${dayFmt(r.signalDate)}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {eur(r.entry)}
                      {r.action === "vigilar" && <div className="text-xs text-slate-500">si cierra {r.direction === "long" ? "por encima" : "por debajo"}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-700">
                      {eur(r.stop)}
                      <div className="text-xs text-slate-500">{pct(((r.stop - r.entry) / r.entry) * 100)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                      {eur(r.target)}
                      <div className="text-xs text-slate-500">{pct(((r.target - r.entry) / r.entry) * 100)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{num(r.rr, 1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.sizing && r.sizing.quantity > 0 ? (
                        <>
                          {int(r.sizing.quantity)} acc.
                          <div className="text-xs text-slate-500">{eur0(r.sizing.notional)}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ScoreBar score={r.score} strong={r.strong} />
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        aria-label="Ver el porqué"
                        aria-expanded={open === r.key}
                        onClick={() => setOpen(open === r.key ? null : r.key)}
                        className="flex h-8 w-8 items-center justify-center text-slate-500 hover:bg-slate-100"
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${open === r.key ? "rotate-180" : ""}`} />
                      </button>
                    </td>
                  </tr>
                  {open === r.key && (
                    <tr className="border-t border-slate-100 bg-slate-50/60">
                      <td colSpan={10} className="px-4 py-4">
                        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr_1fr]">
                          <div>
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Plan</div>
                            <p className="text-sm leading-relaxed text-slate-800">{r.plan}</p>
                            <p className="mt-2 text-xs text-slate-500">
                              Calidad de la figura {r.quality}/100
                              {r.history ? ` · historial ${r.history.trades} operaciones, ${num(r.history.winRate * 100, 0)} % de acierto` : ""}
                              {` · salida por tiempo a las ${r.maxHoldDays} sesiones`}
                            </p>
                            <div className="mt-3 flex gap-2">
                              <button type="button" className={ghost} onClick={() => onOpenChart(r.symbol)}>
                                <LineChart className="h-4 w-4" /> Ver en el gráfico
                              </button>
                              {(r.action === "comprar" || r.action === "vender_corto" || r.action === "vigilar") && (
                                <button type="button" className={primary} onClick={() => toOrder(r)} disabled={!r.sizing?.quantity}>
                                  {r.action === "vigilar" ? "Entrar ya (anticipado)" : "Ejecutar en cartera"}
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                              <ThumbsUp className="h-3.5 w-3.5" /> A favor
                            </div>
                            <ul className="space-y-1 text-sm text-slate-700">
                              {r.pros.length ? r.pros.map((p) => <li key={p}>· {p}</li>) : <li className="text-slate-400">—</li>}
                            </ul>
                          </div>
                          <div>
                            <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-red-700">
                              <ThumbsDown className="h-3.5 w-3.5" /> En contra
                            </div>
                            <ul className="space-y-1 text-sm text-slate-700">
                              {r.cons.length ? r.cons.map((p) => <li key={p}>· {p}</li>) : <li className="text-slate-400">—</li>}
                            </ul>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {draft && (
        <OrderDialog
          draft={draft}
          cash={data.account.cash}
          equity={data.account.equity}
          commissionPct={data.account.settings.commissionPct}
          commissionMin={data.account.settings.commissionMin}
          onClose={() => setDraft(null)}
          onDone={(status) => {
            setNotice(
              status === "pendiente"
                ? `Orden de ${draft.name} programada: se ejecutará a la apertura de la próxima sesión.`
                : `Posición en ${draft.name} abierta en la cartera virtual.`,
            );
            setDraft(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
