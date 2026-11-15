"use client";
import type { getPortfolio } from "@/lib/trading/agents/copy";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Briefcase, ChevronRight, Flame, History, TrendingUp, ListChecks, Loader2, Pencil, RotateCcw, ShieldCheck, Wallet, X } from "lucide-react";
import type { accountDetail, PositionView } from "@/lib/trading/accounts";
import { PATTERN_LIBRARY } from "@/lib/trading/library";
import { refreshTrading, useTradingRefresh, useWarmStart } from "./navigation";
import { ErrorNote, LoadingCard } from "./ui";
import { CopiesPanel } from "./copies-panel";
import { PortfolioBalance, PortfolioColumns, PortfolioOpportunities } from "./portfolio-layout";
import { withLivePoint } from "./equity-chart";
import { AssetIcon } from "./asset-icon";
import { OpenAccount } from "./open-account";
import { PATTERN_SHORT, api, dayFmt, errorText, eur, eur0, field, ghost, int, num, panel, primary, th, tone } from "./format";

type Detail = Awaited<ReturnType<typeof accountDetail>>;
type VirtualPortfolio = Awaited<ReturnType<typeof getPortfolio>>;
type Instruments = {
  items: { symbol: string; name: string; sector: string | null; isIndex: boolean; active: boolean; lastCandle: string | null; lastError: string | null }[];
  canManage: boolean;
};

const STATUS_TONE: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-800 border-amber-200",
  abierta: "bg-blue-50 text-blue-700 border-blue-200",
  cerrada: "bg-slate-50 text-slate-700 border-slate-200",
  cancelada: "bg-slate-50 text-slate-400 border-slate-200",
};

export { EquityCurve } from "./equity-chart";

type PortfolioView = "global" | "abiertas" | "historial" | "caja";
const VIEWS: { key: PortfolioView; label: string }[] = [
  { key: "global", label: "Todas" },
  { key: "abiertas", label: "Abiertas" },
  { key: "historial", label: "Historial" },
  { key: "caja", label: "Caja" },
];

export function PortfolioPanel({ onOpenChart }: { onOpenChart: (symbol: string) => void }) {
  const params = useSearchParams();
  const view = VIEWS.find(({ key }) => key === params.get("vista"))?.key ?? "global";
  const pickView = (v: PortfolioView) => {
    const url = new URL(window.location.href);
    if (v === "global") url.searchParams.delete("vista");
    else url.searchParams.set("vista", v);
    window.history.replaceState(null, "", url);
  };
  const [data, setData] = useState<Detail | null>(null);
  const [portfolio, setPortfolio] = useState<VirtualPortfolio | null>(null);
  const [chartPeriod, setChartPeriod] = useState<"7d" | "all">("7d");
  const [refreshing, setRefreshing] = useState(false);
  useWarmStart<Detail>("account", setData);
  useWarmStart<VirtualPortfolio>("portfolio", setPortfolio);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<PositionView | null>(null);

  const load = useCallback(async () => {
    try {
      const [account, totals] = await Promise.all([api<Detail>("account"), api<VirtualPortfolio>("portfolio")]);
      setData(account);
      setPortfolio(totals);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  const act = async (id: string, path: string, body: unknown) => {
    setBusy(id);
    setError(null);
    try {
      await api(path, body);
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (!data || !portfolio)
    return error ? (
      <ErrorNote>{error}</ErrorNote>
    ) : (
      <LoadingCard height="h-40" />
    );

  const s = data.summary;
  if (!s.opened) return <OpenAccount />;
  const total = portfolio.total;
  const points = withLivePoint(portfolio.equity, total.equity);
  const cutoff = Date.parse(points.at(-1)?.day ?? "") - 6 * 86_400_000;
  const recent = points.filter(({ day }) => new Date(day).getTime() >= cutoff);
  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };
  const active = data.positions.filter((p) => p.status === "abierta" || p.status === "pendiente");
  const history = data.positions.filter((p) => p.status === "cerrada" || p.status === "cancelada");

  return (
    <div className="space-y-5">
      {error && <ErrorNote>{error}</ErrorNote>}
      <PortfolioBalance
        title="Tu dinero virtual"
        total={total.equity}
        available={total.available}
        working={total.invested + total.reserved}
        opportunities={s.invested}
        earned={total.equity - total.initialCapital}
        returnPct={total.returnPct}
        points={chartPeriod === "7d" ? recent : points}
        initial={total.initialCapital}
        periods={[{ key: "7d", label: "7 días" }, { key: "all", label: "Todo" }]}
        period={chartPeriod}
        onPeriodChange={setChartPeriod}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        note="Evolución diaria de tu cartera virtual, incluidas las copias de agentes."
        empty="La gráfica se completará cuando haya dos lecturas de patrimonio."
      />

      <PortfolioColumns
        agents={<CopiesPanel data={portfolio} />}
        opportunities={(
          <PortfolioOpportunities>
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
              <h2 className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-lg font-semibold text-slate-900">
                <Flame className="h-5 w-5 text-orange-500" /> Mis oportunidades
                <span className={`text-sm font-semibold tabular-nums ${tone(s.realized + s.unrealized)}`}>
                  {s.realized + s.unrealized >= 0 ? "+" : ""}{eur(s.realized + s.unrealized, 2)}
                </span>
                {s.stats.closed > 0 && (
                  <span className="text-xs font-normal text-slate-400">· acierto {Math.round(s.stats.winRate * 100)} % ({s.stats.wins}/{s.stats.closed})</span>
                )}
              </h2>
              <div className="flex w-full flex-wrap gap-1 rounded-lg bg-slate-100 p-1 sm:w-auto" role="group" aria-label="Filtrar oportunidades">
                {VIEWS.map(({ key, label }) => {
                  const count = key === "global" ? active.length + history.length : key === "abiertas" ? active.length : key === "historial" ? history.length : null;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={view === key}
                      onClick={() => pickView(key)}
                      className={`flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium sm:flex-none sm:py-1 ${view === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                    >
                      {label}{count !== null ? ` · ${count}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-3">
              {(view === "global" || view === "abiertas") && (

              <section className="min-w-0 overflow-hidden rounded-xl border border-slate-100">
                <header className="border-b border-slate-100 px-5 py-4">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <Briefcase className="h-5 w-5 text-blue-600" /> Posiciones abiertas y órdenes pendientes
                      </h2>
                  <p className="text-xs text-slate-500">
                    Se revisan cada día al cierre: si el precio toca el stop o el objetivo, la posición se cierra sola
                    {s.settings.breakeven ? "; al ganar 1 R el stop sube a precio de entrada" : ""}.
                  </p>
                </header>
                <div className="max-h-[32rem] overflow-y-auto md:overflow-auto">
                <table className="block w-full text-sm md:table md:min-w-[690px]">
                  <thead className="hidden md:table-header-group">
                    <tr className="block md:table-row">
                      <th className={th}>Valor</th>
                      <th className={th}>Estado</th>
                      <th className={`${th} text-right`}>Cantidad</th>
                      <th className={`${th} text-right`}>Entrada</th>
                      <th className={`${th} text-right`}>Actual</th>
                      <th className={`${th} text-right`}>Stop</th>
                      <th className={`${th} text-right`}>Objetivo</th>
                      <th className={`${th} text-right`}>Latente</th>
                      <th className={th}>Origen</th>
                      <th className={th} />
                    </tr>
                  </thead>
                  <tbody className="block md:table-row-group">
                    {active.length === 0 ? (
                      <tr className="block md:table-row">
                        <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                          Sin posiciones. Abre una desde «Oportunidades» o activa el modo automático en «Reglas y riesgo».
                        </td>
                      </tr>
                    ) : (
                      active.map((p) => (
                        <tr key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 px-2 py-2 md:table-row md:p-0">
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2.5">
                            <button type="button" className="flex items-center gap-2.5 text-left" onClick={() => onOpenChart(p.symbol)}>
                              <AssetIcon symbol={p.symbol} name={p.name} />
                              <span>
                                <span className="block font-medium text-slate-900 hover:text-blue-700">{p.name}</span>
                                <span className="block text-xs text-slate-500">
                                  {p.symbol} · {p.direction === "long" ? "largo" : "corto"}
                                  {p.pattern ? ` · ${PATTERN_SHORT[p.pattern]}` : ""}
                                </span>
                              </span>
                            </button>
                          </td>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2.5">
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_TONE[p.status]}`}>{p.status}</span>
                            {p.status === "pendiente" && <div className="mt-0.5 text-xs text-slate-500">próxima apertura</div>}
                          </td>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2.5 text-right tabular-nums"><span className="block text-left text-[10px] text-slate-500 md:hidden">Cantidad</span>{int(p.quantity)}</td>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2.5 text-right tabular-nums"><span className="block text-left text-[10px] text-slate-500 md:hidden">Entrada</span>
                            {eur(p.entryPrice ?? p.plannedEntry)}
                            <div className="text-xs text-slate-500">{p.entryDay ? dayFmt(p.entryDay) : "prevista"}</div>
                          </td>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2.5 text-right tabular-nums"><span className="block text-left text-[10px] text-slate-500 md:hidden">Actual</span>{eur(p.lastPrice)}</td>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2.5 text-right tabular-nums text-red-700"><span className="block text-left text-[10px] text-slate-500 md:hidden">Stop</span>
                            {eur(p.stop)}
                            {p.stop !== p.initialStop && <div className="text-xs text-slate-500">inicial {eur(p.initialStop)}</div>}
                          </td>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2.5 text-right tabular-nums text-emerald-700"><span className="block text-left text-[10px] text-slate-500 md:hidden">Objetivo</span>{eur(p.target)}</td>
                          <td className={`min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2.5 text-right tabular-nums ${tone(p.unrealized)}`}><span className="block text-left text-[10px] text-slate-500 md:hidden">Latente</span>
                            {p.unrealized !== null ? eur0(p.unrealized) : "—"}
                            {p.unrealizedR !== null && <div className="text-xs">{num(p.unrealizedR, 2)} R</div>}
                          </td>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2.5 text-xs text-slate-600"><span className="block text-left text-[10px] text-slate-500 md:hidden">Origen</span>
                            {p.source === "auto" ? (
                              <span className="inline-flex items-center gap-1">
                                <Bot className="h-3.5 w-3.5" /> automático
                              </span>
                            ) : p.source === "comite" ? (
                              "comité de inversión"
                            ) : p.source === "agente" ? (
                              "idea de los agentes"
                            ) : (
                              "manual"
                            )}
                            {p.score !== null && <div>puntuación {p.score}</div>}
                          </td>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2.5">
                            <div className="flex justify-end gap-1">
                              <button type="button" title="Ver gráfico" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => onOpenChart(p.symbol)}>
                                <TrendingUp className="h-4 w-4" />
                              </button>
                              <button type="button" title="Cambiar stop y objetivo" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(p)}>
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className={ghost}
                                disabled={busy === p.id}
                                onClick={() => act(p.id, "close", { positionId: p.id })}
                              >
                                {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                                {p.status === "pendiente" ? "Cancelar" : "Cerrar"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                </div>
              </section>
              )}

              {(view === "global" || view === "historial") && (
              <section className="min-w-0 overflow-hidden rounded-xl border border-slate-100">
                <header className="border-b border-slate-100 px-5 py-4">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <History className="h-5 w-5 text-blue-600" /> Historial de operaciones
                      </h2>
                </header>
                <div className="max-h-[32rem] overflow-y-auto md:overflow-auto">
                <table className="block w-full text-sm md:table md:min-w-[650px]">
                  <thead className="hidden md:table-header-group">
                    <tr className="block md:table-row">
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
                  <tbody className="block md:table-row-group">
                    {history.length === 0 ? (
                      <tr className="block md:table-row">
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                          Aún no hay operaciones cerradas.
                        </td>
                      </tr>
                    ) : (
                      history.map((p) => (
                        <tr key={p.id} className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 px-2 py-2 md:table-row md:p-0 ${p.status === "cancelada" ? "text-slate-400" : ""}`}>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2">
                            <span className="flex items-center gap-2.5">
                              <AssetIcon symbol={p.symbol} name={p.name} size="sm" />
                              <span>
                                <span className="block font-medium">{p.name}</span>
                                <span className="block text-xs text-slate-500">{p.direction === "long" ? "largo" : "corto"}</span>
                              </span>
                            </span>
                          </td>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2"><span className="block text-left text-[10px] text-slate-500 md:hidden">Figura</span>{p.pattern ? PATTERN_SHORT[p.pattern] : "manual"}</td>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2 tabular-nums"><span className="block text-left text-[10px] text-slate-500 md:hidden">Entrada</span>
                            {p.entryPrice !== null ? `${eur(p.entryPrice)} · ${dayFmt(p.entryDay)}` : "—"}
                          </td>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2 tabular-nums"><span className="block text-left text-[10px] text-slate-500 md:hidden">Salida</span>{p.exitPrice !== null ? `${eur(p.exitPrice)} · ${dayFmt(p.exitDay)}` : "—"}</td>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2 text-xs"><span className="block text-left text-[10px] text-slate-500 md:hidden">Motivo</span>{p.status === "cancelada" ? `Cancelada: ${p.exitReason ?? ""}` : p.exitReason}</td>
                          <td className="min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2 text-right tabular-nums"><span className="block text-left text-[10px] text-slate-500 md:hidden">Cantidad</span>{int(p.quantity)}</td>
                          <td className={`min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2 text-right font-medium tabular-nums ${tone(p.pnl)}`}><span className="block text-left text-[10px] text-slate-500 md:hidden">Resultado</span>{p.pnl !== null ? eur0(p.pnl) : "—"}</td>
                          <td className={`min-w-0 max-w-full px-1 py-1 md:px-3 md:py-2 text-right tabular-nums ${tone(p.rMultiple)}`}><span className="block text-left text-[10px] text-slate-500 md:hidden">R</span>{p.rMultiple !== null ? num(p.rMultiple, 2) : "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                </div>
              </section>
              )}

              {view === "caja" && (
              <section className={panel}>
                <header className="border-b border-slate-100 px-5 py-4">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <Wallet className="h-5 w-5 text-blue-600" /> Movimientos de caja
                      </h2>
                </header>
                <ul className="divide-y divide-slate-100 overflow-y-auto text-sm">
                  {data.transactions.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-4 px-5 py-3">
                      <span className="text-slate-700">
                        <span className="mr-2 text-xs text-slate-500">{dayFmt(t.day)}</span>
                        {t.description}
                      </span>
                      <span className={`shrink-0 tabular-nums ${tone(t.amount)}`}>{eur(t.amount, 2)}</span>
                    </li>
                  ))}
                </ul>
              </section>
              )}
            </div>
          </PortfolioOpportunities>
        )}
      />

      {editing && (
        <EditStops
          position={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refreshTrading();
          }}
        />
      )}
    </div>
  );
}

function EditStops({ position, onClose, onSaved }: { position: PositionView; onClose: () => void; onSaved: () => void }) {
  const [stop, setStop] = useState(position.stop.toFixed(3));
  const [target, setTarget] = useState(position.target.toFixed(3));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api("stops", { positionId: position.id, stop: Number(stop.replace(",", ".")), target: Number(target.replace(",", ".")) });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">
          Stop y objetivo · {position.name}
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-red-700">Stop</span>
            <input className={`${field} w-full`} value={stop} onChange={(e) => setStop(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-emerald-700">Objetivo</span>
            <input className={`${field} w-full`} value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
        </div>
        {error && <p className="mx-5 mb-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" className={ghost} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={primary} onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function Settings({ summary, onSaved }: { summary: Detail["summary"]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(summary.settings);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [capital, setCapital] = useState(String(Math.round(summary.initialCapital)));
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => setForm(summary.settings), [summary.settings]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api("settings", form);
      await onSaved();
      setMsg("Ajustes guardados");
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    setSaving(true);
    try {
      await api("reset", { confirm: true, capital: Number(capital) });
      setConfirmReset(false);
      await onSaved();
      setMsg("Cartera reiniciada");
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const numInput = (k: "riskPerTradePct" | "maxPositionPct" | "maxOpenPositions" | "commissionPct" | "commissionMin" | "slippageBps" | "minScore", label: string, hint: string, step = "0.1") => (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      <input type="number" step={step} className={`${field} w-full tabular-nums`} value={form[k]} onChange={(e) => set(k, Number(e.target.value))} />
      <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
    </label>
  );

  return (
    <section className={panel}>
      <header className="border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <ShieldCheck className="h-5 w-5 text-blue-600" /> Reglas de la cartera
              </h2>
        <p className="text-xs text-slate-500">Deciden el tamaño de cada operación, qué señales cuentan y si el sistema opera solo.</p>
      </header>
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
        {numInput("riskPerTradePct", "Riesgo por operación (%)", "Lo que pierdes si salta el stop. Lo habitual: 0,5 – 2 %.")}
        {numInput("maxPositionPct", "Tamaño máximo por posición (%)", "Tope de la cartera en un solo valor.", "1")}
        {numInput("maxOpenPositions", "Posiciones abiertas máximas", "Diversificación mínima.", "1")}
        {numInput("minScore", "Puntuación mínima (0-100)", "Por debajo, las señales se muestran pero no se recomiendan.", "1")}
        {numInput("commissionPct", "Comisión (%)", "Por operación, sobre el importe.", "0.01")}
        {numInput("commissionMin", "Comisión mínima (€)", "Por operación.", "0.5")}
        {numInput("slippageBps", "Deslizamiento (pb)", "Diferencia frente al precio teórico. 5 pb = 0,05 %.", "1")}
        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={form.breakeven} onChange={(e) => set("breakeven", e.target.checked)} />
            <span>
              Stop a break-even
              <span className="block text-xs text-slate-500">Al ganar 1 R, el stop sube a la entrada.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={form.allowShort} onChange={(e) => set("allowShort", e.target.checked)} />
            <span>
              Permitir cortos
              <span className="block text-xs text-slate-500">Si no, las señales bajistas se tratan como «evitar / vender».</span>
            </span>
          </label>
        </div>
      </div>
      <div className="border-t border-slate-100 px-4 py-4">
        <div className="mb-2 text-xs font-medium text-slate-700">Figuras que se operan (ninguna marcada = todas)</div>
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
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 bg-slate-50/60 px-4 py-4">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={form.autoTrade} onChange={(e) => set("autoTrade", e.target.checked)} />
          <span>
            <b className="inline-flex items-center gap-1 font-semibold text-slate-900">
              <Bot className="h-4 w-4" /> Modo automático
            </b>
            <span className="block max-w-xl text-xs text-slate-600">
              Cada día al cierre, el sistema programa órdenes para la próxima apertura con las señales que superen tu puntuación
              mínima, respetando tus límites. Las cierra solo en stop, objetivo o por tiempo.
            </span>
          </span>
        </label>
        <div className="ml-auto flex items-center gap-3">
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
          <button type="button" className={primary} onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar reglas
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm">
        <RotateCcw className="h-4 w-4 text-slate-500" />
        <span className="text-slate-700">Reiniciar la cartera (y las copias) con</span>
        <input className={`${field} w-32 tabular-nums`} value={capital} onChange={(e) => setCapital(e.target.value)} inputMode="numeric" />
        <span className="text-slate-700">€</span>
        {confirmReset ? (
          <>
            <span className="text-red-700">Se borran todas las posiciones y el historial.</span>
            <button type="button" className="inline-flex items-center gap-1.5 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700" onClick={reset} disabled={saving}>
              Sí, reiniciar
            </button>
            <button type="button" className={ghost} onClick={() => setConfirmReset(false)}>
              No
            </button>
          </>
        ) : (
          <button type="button" className={ghost} onClick={() => setConfirmReset(true)}>
            Reiniciar
          </button>
        )}
      </div>
    </section>
  );
}

export function UniversePanel({ onSelect }: { onSelect?: (symbol: string) => void }) {
  const onChanged = refreshTrading;
  const [data, setData] = useState<Instruments | null>(null);
  const [symbol, setSymbol] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Instruments>("instruments").then(setData).catch((e) => setMsg(errorText(e))), []);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (body: unknown, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await api("instruments", body);
      setMsg(ok);
      await load();
      refreshTrading();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (!data) return null;
  const canManage = data.canManage;
  return (
    <section className={panel}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <ListChecks className="h-5 w-5 text-blue-600" /> Valores que se siguen
              </h2>
          <p className="text-xs text-slate-500">
            {data.items.filter((i) => i.active).length} activos. Símbolos de Yahoo Finance: «.MC» para la Bolsa de Madrid (p. ej. CIE.MC).
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <input className={`${field} w-36`} placeholder="Símbolo" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
            <button type="button" className={ghost} disabled={busy || !symbol.trim()} onClick={() => run({ op: "add", symbol }, `${symbol.toUpperCase()} añadido; se descargará en la próxima actualización`)}>
              Añadir
            </button>
          </div>
        )}
      </header>
      {msg && <p className="border-b border-slate-100 px-4 py-2 text-sm text-slate-600">{msg}</p>}
      <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
        {data.items.map((i) => (
          <div key={i.symbol} className={`flex items-center justify-between gap-2 bg-white px-3 py-2 text-sm ${i.active ? "" : "opacity-50"}`}>
            <button
              type="button"
              onClick={() => onSelect?.(i.symbol)}
              disabled={!onSelect}
              aria-label={`Ver gráfico y figuras de ${i.name}`}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 text-left enabled:cursor-pointer enabled:hover:text-blue-700 disabled:cursor-default"
            >
              <AssetIcon symbol={i.symbol} name={i.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-800">{i.name}</span>
                <span className="block text-xs text-slate-500">
                  {i.symbol} · {i.lastError ? <span className="text-red-600">error</span> : i.lastCandle ? dayFmt(i.lastCandle) : "sin datos"}
                </span>
              </span>
              {onSelect && <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
            </button>
            {canManage && !i.isIndex && (
              <button
                type="button"
                className="text-xs text-blue-700 hover:underline disabled:opacity-50"
                disabled={busy}
                onClick={() => run({ op: "toggle", symbol: i.symbol, active: !i.active }, i.active ? `${i.symbol} desactivado` : `${i.symbol} activado`)}
              >
                {i.active ? "Quitar" : "Activar"}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Página de reglas: ajustes de la cartera y reinicio. */
export function RulesPanel() {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<Detail>("account"));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data)
    return (
      <LoadingCard height="h-40" />
    );
  return <Settings summary={data.summary} onSaved={async () => refreshTrading()} />;
}
