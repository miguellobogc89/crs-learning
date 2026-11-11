"use client";
// Oportunidades: una sola tabla con las ideas cripto del analista común (vivas primero), qué habría
// pasado siguiéndolas al pie de la letra y quién entró en cada una. Paginada.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Play } from "lucide-react";
import type { faroView } from "@/lib/trading/faro/engine";
import { api, errorText, eur, ghost, panel, pct, th } from "./format";
import { OpenAccount } from "./open-account";
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
const signed = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${eur(v, 2)}`);
const SIZES = [10, 15, 25, 50];
const TH = `${th} whitespace-normal px-2 leading-tight`;
const TD = "px-2 py-3";

export function FaroPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(15);
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

  const all = useMemo(() => (data ? [...data.live, ...data.past] : []), [data]);
  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <LoadingCard />;
  const PAGE = perPage;
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const current = Math.min(page, pages - 1);
  const rows = all.slice(current * PAGE, current * PAGE + PAGE);

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
    <div className="space-y-4">
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data.account.opened && <OpenAccount compact />}
    <section className={`${panel} flex min-h-[calc(100dvh-15rem)] flex-col`}>
      {rows.length === 0 ? (
        <p className="flex-1 px-6 py-8 text-center text-sm text-slate-500">Todavía no hay ideas. La primera tanda llega en el próximo análisis (cada {data.everyMinutes} min).</p>
      ) : (
        <div className="flex-1">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              {[12, 8, 7, 9, 9, 9, 9, 9, 11, 7, 10].map((w, n) => (
                <col key={n} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className={TH}>Activo</th>
                <th className={TH}>Tipo</th>
                <th className={`${TH} text-center`}>Convicción</th>
                <th className={`${TH} text-right`}>Detectada a</th>
                <th className={`${TH} text-right`}>Invalidación</th>
                <th className={`${TH} text-right`}>Objetivo</th>
                <th className={`${TH} text-right`}>Precio ahora / salida</th>
                <th className={`${TH} text-right`}>Resultado por 100 €</th>
                <th className={TH}>Estado</th>
                <th className={`${TH} text-center`}>Participantes</th>
                <th className={TH} />
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
                      <td className={TD}>
                        <span className="flex items-center gap-2">
                          <AssetIcon symbol={i.symbol} name={i.symbol} size="sm" />
                          <span className="min-w-0">
                            <b className="block truncate font-semibold text-slate-900">{i.symbol.replace(/-EUR$/, "")}</b>
                            <span className="block text-xs text-slate-400">{ago(i.createdAt)}</span>
                          </span>
                        </span>
                      </td>
                      <td className={TD}>
                        <Pill color={k.color}>{k.label}</Pill>
                      </td>
                      <td className={`${TD} text-center tabular-nums text-slate-700`}>{i.conviction}/5</td>
                      <td className={`${TD} truncate text-right tabular-nums text-slate-700`}>{eur(i.price)}</td>
                      <td className={`${TD} truncate text-right tabular-nums text-rose-600`}>{eur(i.invalidation)}</td>
                      <td className={`${TD} truncate text-right tabular-nums text-emerald-600`}>{eur(i.target)}</td>
                      <td className={`${TD} truncate text-right tabular-nums text-slate-700`}>{eur(i.lastPrice)}</td>
                      <td className={`${TD} truncate text-right font-semibold tabular-nums ${tone(i.resultPct)}`}>{signed(i.resultPct)}</td>
                      <td className={TD}>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Pill color={st.color}>{st.label}</Pill>
                          {i.status === "viva" && <span className="text-xs text-slate-400">{left(i.validUntil)}</span>}
                        </span>
                      </td>
                      <td className={`${TD} text-center`}>
                        <span className={`inline-flex min-w-7 justify-center rounded-lg px-2 py-0.5 text-xs font-semibold tabular-nums ${i.participants.length ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-400"}`}>
                          {i.participants.length}
                        </span>
                      </td>
                      <td className={`${TD} text-right`}>
                        <span className="inline-flex items-center gap-2">
                          {i.status === "viva" && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                              disabled={!data.account.opened || mineIn}
                              title={!data.account.opened ? "Abre tu cuenta primero" : mineIn ? "Ya has entrado en esta idea" : "Ver la operación y ejecutarla"}
                              onClick={(e) => {
                                e.stopPropagation();
                                execute(i);
                              }}
                            >
                              <Play className="h-3.5 w-3.5" /> <span className="hidden xl:inline">Ejecutar</span>
                            </button>
                          )}
                          <ChevronDown className={`h-4 w-4 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} />
                        </span>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <td colSpan={11} className="px-6 py-4">
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
                                        {signed(p.result)}
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
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
        <span className="tabular-nums">{all.length ? `${current * PAGE + 1}–${Math.min(all.length, (current + 1) * PAGE)} de ${all.length}` : "0 ideas"}</span>
        <span className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            Ver
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value));
                setPage(0);
              }}
            >
              {SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            por página
          </label>
          <span className="flex items-center gap-1">
            <button type="button" className={`${ghost} !px-2 !py-1.5`} disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Página anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 tabular-nums">
              {current + 1} / {pages}
            </span>
            <button type="button" className={`${ghost} !px-2 !py-1.5`} disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Página siguiente">
              <ChevronRight className="h-4 w-4" />
            </button>
          </span>
        </span>
      </footer>
    </section>
      {confirm && <ConfirmOrderModal idea={confirm} cash={data.account.cash} onClose={() => setConfirm(null)} />}
    </div>
  );
}
