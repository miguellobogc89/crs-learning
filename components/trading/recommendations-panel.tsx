"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Eye, Info, LineChart, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Recommendation } from "@/lib/trading/recommend";
import type { Overview } from "./trading-workspace";
import { ACTION_LABEL, ACTION_TONE, PATTERN_SHORT, STATUS_LABEL, dayFmt, eur, eur0, ghost, int, num, panel, pct, primary, th } from "./format";
import { ConfirmOrderModal, TradeInfoModal, ideaFromRecommendation } from "./trade-modals";
import { Rich } from "./ui";

const FILTERS = [
  { key: "accion", label: "Para actuar" },
  { key: "vigilar", label: "En vigilancia" },
  { key: "todas", label: "Todas" },
] as const;

function ScoreBar({ score, strong }: { score: number; strong: boolean }) {
  return (
    <div className="w-20" title="Nota de la señal: calidad de la figura, historial, tendencia y beneficio/riesgo">
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

/** Tarjeta de una operación propuesta, pensada para leerse en 10 segundos. */
function TradeCard({ r, onOrder, onInfo, onChart }: { r: Recommendation; onOrder: () => void; onInfo: () => void; onChart: () => void }) {
  const long = r.direction === "long";
  const q = r.sizing?.quantity ?? 0;
  const loss = r.sizing?.riskAmount ?? 0;
  const gain = q * Math.abs(r.target - r.entry);
  return (
    <article className={`${panel} flex flex-col`}>
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-900">{r.name}</div>
          <div className="text-xs text-slate-500">
            {r.symbol} · {r.patternName}
          </div>
        </div>
        <span className={`shrink-0 border px-2 py-0.5 text-xs font-semibold ${ACTION_TONE[r.action]}`}>{ACTION_LABEL[r.action]}</span>
      </header>
      <div className="px-4 pt-3">
        <p className="text-[15px] font-medium text-slate-900">
          {long ? "Compra" : "Vende en corto"} {int(q)} {/-EUR$/.test(r.symbol) ? r.symbol.replace(/-EUR$/, "") : "acciones"} <span className="font-normal text-slate-500">(≈ {eur0(r.sizing?.notional)})</span>
        </p>
        <p className="text-xs text-slate-500">a la apertura de la próxima sesión</p>
      </div>
      <dl className="mx-4 mt-3 grid grid-cols-3 gap-px border border-slate-200 bg-slate-200 text-center">
        <div className="bg-white px-2 py-2">
          <dt className="text-[11px] text-slate-500">Precio ahora</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{eur(r.entry)}</dd>
        </div>
        <div className="bg-white px-2 py-2">
          <dt className="text-[11px] text-red-700">Si sale mal, vende a</dt>
          <dd className="font-semibold tabular-nums text-red-700">{eur(r.stop)}</dd>
          <dd className="text-[11px] tabular-nums text-red-700">−{eur0(loss)}</dd>
        </div>
        <div className="bg-white px-2 py-2">
          <dt className="text-[11px] text-emerald-700">Si sale bien, vende a</dt>
          <dd className="font-semibold tabular-nums text-emerald-700">{eur(r.target)}</dd>
          <dd className="text-[11px] tabular-nums text-emerald-700">+{eur0(gain)}</dd>
        </div>
      </dl>
      <ul className="mx-4 mt-3 flex-1 space-y-0.5 text-xs text-slate-600">
        {r.pros.slice(0, 3).map((p) => (
          <li key={p} className="flex gap-1.5">
            <ThumbsUp className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> {p}
          </li>
        ))}
        {r.cons.slice(0, 1).map((p) => (
          <li key={p} className="flex gap-1.5">
            <ThumbsDown className="mt-0.5 h-3 w-3 shrink-0 text-red-600" /> {p}
          </li>
        ))}
      </ul>
      <footer className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
        <ScoreBar score={r.score} strong={r.strong} />
        <div className="flex gap-2">
          <button type="button" className={ghost} onClick={onChart} aria-label="Ver gráfico">
            <LineChart className="h-4 w-4" />
          </button>
          <button type="button" className={ghost} onClick={onInfo}>
            <Info className="h-4 w-4" /> Más info
          </button>
          <button type="button" className={primary} onClick={onOrder} disabled={!q}>
            Ejecutar orden
          </button>
        </div>
      </footer>
    </article>
  );
}

export function RecommendationsPanel({ data, onOpenChart }: { data: Overview; onOpenChart: (symbol: string) => void }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("accion");
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Recommendation | null>(null);
  const [info, setInfo] = useState<Recommendation | null>(null);

  const recs = data.recommendations;
  const top = recs.filter((r) => r.strong && !r.held && (r.action === "comprar" || r.action === "vender_corto")).slice(0, 3);
  const watch = recs.filter((r) => r.action === "vigilar" && r.score >= data.account.settings.minScore - 10).slice(0, 6);
  const warnings = recs.filter((r) => r.action === "cerrar" || (r.action === "evitar" && r.strong)).slice(0, 6);

  const list = useMemo(() => {
    if (filter === "accion") return recs.filter((r) => r.action !== "vigilar");
    if (filter === "vigilar") return recs.filter((r) => r.action === "vigilar");
    return recs;
  }, [recs, filter]);

  return (
    <div className="space-y-5">

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            {top.length ? `${top.length === 1 ? "1 figura" : `${top.length} figuras`} con entrada para la próxima sesión` : "Ninguna figura con entrada clara hoy"}
          </h2>
          <span className="text-xs text-slate-500">
            Con tu regla de arriesgar el {num(data.account.settings.riskPerTradePct, 1)} % ({eur0((data.account.equity * data.account.settings.riskPerTradePct) / 100)}) por operación ·
            nota mínima {data.account.settings.minScore}
          </span>
        </div>
        {top.length === 0 ? (
          <div className={`${panel} px-4 py-5 text-sm text-slate-600`}>
            Ninguna señal supera tu nota mínima. No operar también es una decisión: abajo tienes los valores a vigilar y a qué
            precio entrarías si rompen.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {top.map((r) => (
              <TradeCard key={r.key} r={r} onOrder={() => setConfirm(r)} onInfo={() => setInfo(r)} onChart={() => onOpenChart(r.symbol)} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={panel}>
          <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <Eye className="h-4 w-4 text-slate-500" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Atento a estos</h3>
              <p className="text-xs text-slate-500">La figura está hecha, falta la ruptura. Si se cumple, la app te lo dirá.</p>
            </div>
          </header>
          {watch.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">Nada en vigilancia ahora mismo.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {watch.map((r) => (
                <li key={r.key}>
                  <button type="button" onClick={() => onOpenChart(r.symbol)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
                    {r.direction === "long" ? (
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 shrink-0 text-red-600" />
                    )}
                    <span className="min-w-0 flex-1">
                      Si <b className="font-semibold text-slate-900">{r.name}</b> cierra {r.direction === "long" ? "por encima" : "por debajo"} de{" "}
                      <b className="tabular-nums">{eur(r.entry)}</b>
                      <span className="block text-xs text-slate-500">
                        {PATTERN_SHORT[r.pattern]} · ahora {eur(r.lastClose)} ({pct(((r.entry - r.lastClose) / r.lastClose) * 100)} hasta la ruptura)
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-slate-500">{r.score}/100</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={panel}>
          <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <ArrowDownRight className="h-4 w-4 text-red-600" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Señales de bajada</h3>
              <p className="text-xs text-slate-500">Mejor no comprar estos; si tienes alguno, plantéate salir.</p>
            </div>
          </header>
          {warnings.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">Ninguna señal bajista fuerte.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {warnings.map((r) => (
                <li key={r.key}>
                  <button type="button" onClick={() => onOpenChart(r.symbol)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
                    <span className={`shrink-0 border px-1.5 py-0.5 text-xs font-medium ${ACTION_TONE[r.action]}`}>{ACTION_LABEL[r.action]}</span>
                    <span className="min-w-0 flex-1">
                      <b className="font-semibold text-slate-900">{r.name}</b>
                      <span className="block text-xs text-slate-500">
                        {PATTERN_SHORT[r.pattern]} · objetivo de la caída {eur(r.target)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-xs text-slate-500">
        ¿No sabes qué es un doble suelo o un hombro-cabeza-hombro?{" "}
        <Link href="/trading/patrones" className="font-medium text-blue-700 hover:underline">
          Aprende los patrones
        </Link>
        . ¿Te fías del sistema?{" "}
        <Link href="/trading/simulador" className="font-medium text-blue-700 hover:underline">
          Mira cómo te habría ido
        </Link>
        .
      </p>

      <section>
        <button type="button" onClick={() => setShowAll(!showAll)} className={ghost}>
          <ChevronDown className={`h-4 w-4 transition-transform ${showAll ? "rotate-180" : ""}`} />
          {showAll ? "Ocultar todas las señales" : `Ver todas las señales (${recs.length})`}
        </button>
        {showAll && (
          <div className="mt-3 space-y-3">
            <div className="flex border border-slate-200 bg-white" style={{ width: "fit-content" }}>
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
                    <th className={th}>Nota</th>
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
                            {r.vetoed && (r.action === "comprar" || r.action === "vender_corto") ? (
                              <span className="inline-block border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-500" title="Esta figura ha perdido dinero en el IBEX">
                                No recomendada
                              </span>
                            ) : (
                              <span className={`inline-block border px-1.5 py-0.5 text-xs font-medium ${ACTION_TONE[r.action]}`}>{ACTION_LABEL[r.action]}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="text-slate-800">{PATTERN_SHORT[r.pattern]}</div>
                            <div className="text-xs text-slate-500">
                              {STATUS_LABEL[r.status]}
                              {r.signalDate ? ` · ${dayFmt(r.signalDate)}` : ""}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{eur(r.entry)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-red-700">{eur(r.stop)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{eur(r.target)}</td>
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
                                  <p className="text-sm leading-relaxed text-slate-700">
                                    <Rich text={r.plan} />
                                  </p>
                                  {(r.action === "comprar" || r.action === "vender_corto" || r.action === "vigilar") && (
                                    <button type="button" className={`${primary} mt-3`} onClick={() => setConfirm(r)} disabled={!r.sizing?.quantity}>
                                      {r.action === "vigilar" ? "Entrar ya (anticipado)" : "Ejecutar orden"}
                                    </button>
                                  )}
                                </div>
                                <ul className="space-y-1 text-sm text-slate-700">
                                  {r.pros.map((p) => (
                                    <li key={p} className="flex gap-1.5">
                                      <ThumbsUp className="mt-1 h-3 w-3 shrink-0 text-emerald-600" /> {p}
                                    </li>
                                  ))}
                                </ul>
                                <ul className="space-y-1 text-sm text-slate-700">
                                  {r.cons.map((p) => (
                                    <li key={p} className="flex gap-1.5">
                                      <ThumbsDown className="mt-1 h-3 w-3 shrink-0 text-red-600" /> {p}
                                    </li>
                                  ))}
                                </ul>
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
          </div>
        )}
      </section>

      {info && (
        <TradeInfoModal
          idea={ideaFromRecommendation(info)}
          onClose={() => setInfo(null)}
          onExecute={
            info.sizing?.quantity && (info.action === "comprar" || info.action === "vender_corto")
              ? () => {
                  setConfirm(info);
                  setInfo(null);
                }
              : undefined
          }
        />
      )}
      {confirm && <ConfirmOrderModal idea={{ ...ideaFromRecommendation(confirm), action: confirm.action === "vigilar" ? "comprar" : confirm.action }} cash={data.account.cash} onClose={() => setConfirm(null)} />}
    </div>
  );
}
