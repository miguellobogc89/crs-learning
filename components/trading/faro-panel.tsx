"use client";
// Tablón de ideas al momento (cripto): lo que publica el analista común cada ~30 min, quién entró en
// cada idea y, una vez resuelta, qué habría pasado siguiéndola al pie de la letra.
import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, Play, Radar } from "lucide-react";
import type { faroView } from "@/lib/trading/faro/engine";
import { api, errorText, eur, ghost, panel, pct, th } from "./format";
import { ago } from "./home-panel";
import { AgentAvatar, ErrorNote, LoadingCard, Pill, Rich } from "./ui";
import { useTradingRefresh } from "./navigation";
import { ConfirmOrderModal, type TradeIdea } from "./trade-modals";
import { AssetIcon } from "./asset-icon";

type Data = Awaited<ReturnType<typeof faroView>>;
type Idea = Data["live"][number];

const KIND: Record<string, { label: string; color: string }> = {
  impulso: { label: "Impulso", color: "orange" },
  ruptura: { label: "Ruptura", color: "violet" },
  rebote: { label: "Rebote", color: "blue" },
  noticia: { label: "Noticia", color: "amber" },
};
const STATUS: Record<string, { label: string; color: string }> = {
  viva: { label: "Viva", color: "blue" },
  acierto: { label: "Acierto", color: "emerald" },
  fallo: { label: "Fallo", color: "rose" },
  caducada: { label: "Caducada", color: "slate" },
};
const tone = (v: number | null) => (v === null ? "text-slate-400" : v > 0.05 ? "text-emerald-600" : v < -0.05 ? "text-rose-600" : "text-slate-600");
const left = (iso: string) => {
  const h = (new Date(iso).getTime() - Date.now()) / 3_600_000;
  return h <= 0 ? "caducada" : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${Math.round(h)} h`;
};

export function FaroPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"vivas" | "historial">("vivas");
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<TradeIdea | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>("faro"));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <LoadingCard />;
  const rows = view === "vivas" ? data.live : data.past;

  const execute = (i: Idea) => {
    const a = data.account;
    const px = i.lastPrice ?? i.price;
    const risk = (a.equity * a.riskPct) / 100;
    const q = Math.floor((Math.min(risk / Math.max(px - i.invalidation, px * 0.01), (a.cash * 0.98) / px) || 0) * 1e6) / 1e6;
    setConfirm({
      key: `faro-${i.id}`,
      source: "comite",
      symbol: i.symbol,
      name: i.symbol.replace(/-EUR$/, ""),
      market: "crypto",
      action: "comprar",
      direction: "long",
      price: px,
      stop: i.invalidation,
      target: i.target,
      quantity: q > 0 ? q : null,
      rationale: i.rationale,
      pros: [],
      cons: i.risks ? [i.risks] : [],
      evidence: [],
      origin: `Idea de ${KIND[i.kind]?.label.toLowerCase() ?? i.kind}`,
      conviction: i.conviction,
      signalKey: `faro:${i.id}:tu`,
    });
  };

  return (
    <section className={panel}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-3 text-base font-semibold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Radar className="h-4 w-4" />
            </span>
            Ideas al momento · cripto
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Se renuevan cada {data.everyMinutes} min{data.lastRun ? ` · último análisis ${ago(data.lastRun.at)}` : " · aún sin análisis"}
          </p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
          {(["vivas", "historial"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-lg px-3 py-1.5 font-medium ${view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {v === "vivas" ? `Vivas (${data.live.length})` : "Historial"}
            </button>
          ))}
        </div>
      </header>

      {view === "vivas" && data.lastRun?.marketView && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-3 text-sm text-slate-700">
          <Rich text={data.lastRun.marketView} />
        </div>
      )}
      {view === "historial" && data.stats.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-6 py-3 text-xs text-slate-600">
          {data.stats.map((s) => (
            <span key={s.kind} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
              <b className="font-semibold text-slate-800">{KIND[s.kind]?.label ?? s.kind}</b>: {s.n} ideas · {Math.round((s.hits / s.n) * 100)} % aciertos ·{" "}
              <span className={tone(s.avgPct)}>{s.avgPct === null ? "—" : `${pct(s.avgPct, 1)} de media`}</span>
            </span>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-slate-500">{view === "vivas" ? "Ahora mismo no hay ideas vivas." : "Todavía no hay ideas resueltas."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={th}>Activo</th>
                <th className={th}>Tipo</th>
                <th className={`${th} text-center`}>Convicción</th>
                <th className={`${th} text-right`}>Detectada a</th>
                <th className={`${th} text-right`}>Invalidación</th>
                <th className={`${th} text-right`}>Objetivo</th>
                <th className={`${th} text-right`}>{view === "vivas" ? "Ahora" : "Resultado"}</th>
                <th className={`${th} text-right`}>Por cada 100 €</th>
                <th className={`${th} text-center`}>Participantes</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const k = KIND[i.kind] ?? { label: i.kind, color: "slate" };
                const st = STATUS[i.status];
                const expanded = open === i.id;
                const mineIn = i.participants.some((p) => p.who === "tu");
                return (
                  <Fragment key={i.id}>
                    <tr className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/60" onClick={() => setOpen(expanded ? null : i.id)}>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2">
                          <AssetIcon symbol={i.symbol} name={i.symbol} size="sm" />
                          <b className="font-semibold text-slate-900">{i.symbol.replace(/-EUR$/, "")}</b>
                          <span className="text-xs text-slate-400">{ago(i.createdAt)}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Pill color={k.color}>{k.label}</Pill>
                      </td>
                      <td className="px-3 py-3 text-center tabular-nums text-slate-700">{i.conviction}/5</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{eur(i.price)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-rose-600">{eur(i.invalidation)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{eur(i.target)}</td>
                      <td className="px-3 py-3 text-right">
                        {view === "vivas" ? (
                          <span className="tabular-nums text-slate-700">
                            {eur(i.lastPrice)} <span className="text-xs text-slate-400">· quedan {left(i.validUntil)}</span>
                          </span>
                        ) : (
                          <Pill color={st.color}>{st.label}</Pill>
                        )}
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${tone(i.resultPct)}`}>
                        {i.resultPct === null ? "—" : `${i.resultPct > 0 ? "+" : ""}${eur(i.resultPct)}`}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex min-w-7 justify-center rounded-lg px-2 py-0.5 text-xs font-semibold tabular-nums ${i.participants.length ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-400"}`}>
                          {i.participants.length}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="inline-flex items-center gap-2">
                          {view === "vivas" && (
                            <button
                              type="button"
                              className={ghost}
                              disabled={!data.account.opened || mineIn}
                              title={!data.account.opened ? "Abre tu cuenta primero" : mineIn ? "Ya has entrado en esta idea" : "Ver la operación y ejecutarla"}
                              onClick={(e) => {
                                e.stopPropagation();
                                execute(i);
                              }}
                            >
                              <Play className="h-3.5 w-3.5" /> Ejecutar
                            </button>
                          )}
                          <ChevronDown className={`h-4 w-4 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} />
                        </span>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <td colSpan={10} className="px-6 py-4">
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <div className="space-y-2 text-sm text-slate-700">
                              <Rich text={i.rationale} />
                              {i.risks && <p className="text-xs text-slate-500">Riesgos: {i.risks}</p>}
                              <p className="text-xs text-slate-500">
                                Lo mejor que llegó a ir: <span className={tone(i.bestPct)}>{pct(i.bestPct ?? 0, 1)}</span> · lo peor:{" "}
                                <span className={tone(i.worstPct)}>{pct(i.worstPct ?? 0, 1)}</span>
                                {i.resolvedAt && ` · resuelta ${ago(i.resolvedAt)}`}
                              </p>
                            </div>
                            <div>
                              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Quién entró</div>
                              {i.participants.length === 0 ? (
                                <p className="text-sm text-slate-500">Nadie entró en esta idea.</p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {i.participants.map((p, n) => (
                                    <li key={`${p.who}-${n}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm">
                                      <span className="flex items-center gap-2">
                                        <AgentAvatar color={p.color} size="sm" />
                                        <b className="font-semibold text-slate-900">{p.name}</b>
                                        <span className="text-xs text-slate-500">
                                          {eur(p.invested)}
                                          {p.entry ? ` a ${eur(p.entry)}` : ""} · {p.status}
                                        </span>
                                      </span>
                                      <span className={`font-semibold tabular-nums ${tone(p.result)}`}>
                                        {p.result === null ? "—" : `${p.result > 0 ? "+" : ""}${eur(p.result)}`}
                                        {p.resultPct !== null && <span className="ml-1 text-xs font-normal">({pct(p.resultPct, 1)})</span>}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {confirm && <ConfirmOrderModal idea={confirm} cash={data.account.cash} onClose={() => setConfirm(null)} />}
    </section>
  );
}
