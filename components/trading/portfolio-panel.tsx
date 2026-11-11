"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Briefcase, History, TrendingUp, ListChecks, Loader2, Pencil, RotateCcw, ShieldCheck, Wallet, X } from "lucide-react";
import type { accountDetail, PositionView } from "@/lib/trading/accounts";
import { PATTERN_LIBRARY } from "@/lib/trading/library";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { card, ErrorNote, LoadingCard, ReturnPill } from "./ui";
import { CopiesPanel } from "./copies-panel";
import { EquityChart, withLivePoint } from "./equity-chart";
import { AssetIcon } from "./asset-icon";
import { OpenAccount } from "./open-account";
import { PATTERN_SHORT, api, dayFmt, errorText, eur, eur0, field, ghost, int, num, panel, pct, primary, th, tone } from "./format";

type Detail = Awaited<ReturnType<typeof accountDetail>>;
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
  { key: "global", label: "Posición global" },
  { key: "abiertas", label: "Posiciones abiertas" },
  { key: "historial", label: "Historial" },
  { key: "caja", label: "Movimientos de caja" },
];

export function PortfolioPanel({ onOpenChart }: { onOpenChart: (symbol: string) => void }) {
  const onChanged = refreshTrading;
  const params = useSearchParams();
  const [view, setView] = useState<PortfolioView>(() => {
    const v = params.get("vista");
    return VIEWS.some((x) => x.key === v) ? (v as PortfolioView) : "global";
  });
  const pickView = (v: PortfolioView) => {
    setView(v);
    window.history.replaceState(null, "", v === "global" ? "/trading/cartera" : `/trading/cartera?vista=${v}`);
  };
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<PositionView | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Detail>("account"));
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
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (!data)
    return error ? (
      <ErrorNote>{error}</ErrorNote>
    ) : (
      <LoadingCard height="h-40" />
    );

  const s = data.summary;
  if (!s.opened) return <OpenAccount />;
  const active = data.positions.filter((p) => p.status === "abierta" || p.status === "pendiente");
  const history = data.positions.filter((p) => p.status === "cerrada" || p.status === "cancelada");

  return (
    <div className="space-y-6">
      {error && <ErrorNote>{error}</ErrorNote>}

      <div role="tablist" aria-label="Partes de tu cartera" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {VIEWS.map((v) => {
          const count = v.key === "abiertas" ? active.length : v.key === "historial" ? history.length : null;
          return (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              onClick={() => pickView(v.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium ${view === v.key ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              {v.label}
              {count ? <span className="rounded-full bg-slate-200/70 px-1.5 text-[11px] font-semibold tabular-nums text-slate-600">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {view === "global" && (
      <>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Patrimonio", eur0(s.equity), pct(s.returnPct), tone(s.returnPct)],
          ["Invertido", eur0(s.invested), `${num(s.equity ? (s.invested / s.equity) * 100 : 0, 0)} % de la cartera`, "text-slate-500"],
          ["Resultado cerrado", eur0(s.realized), `${s.stats.closed} operaciones`, tone(s.realized)],
          ["Latente", eur0(s.unrealized), `${active.filter((p) => p.status === "abierta").length} abiertas`, tone(s.unrealized)],
          ["Acierto", s.stats.closed ? `${num(s.stats.winRate * 100, 0)} %` : "—", `R medio ${num(s.stats.avgR, 2)}`, tone(s.stats.avgR)],
          ["Factor de beneficio", s.stats.profitFactor ? num(s.stats.profitFactor, 2) : "—", `mejor ${eur0(s.stats.bestTrade)} · peor ${eur0(s.stats.worstTrade)}`, "text-slate-500"],
        ].map(([label, value, sub, cls]) => (
          <div key={label} className={`${card} px-5 py-4`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-bold tracking-tight tabular-nums text-slate-900">{value}</div>
            {label === "Patrimonio" ? (
              <div className="mt-1">
                <ReturnPill value={s.returnPct} />
              </div>
            ) : (
              <div className={`mt-0.5 text-xs ${cls}`}>{sub}</div>
            )}
          </div>
        ))}
      </div>

      <section className={panel}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <TrendingUp className="h-5 w-5 text-blue-600" /> Evolución del patrimonio
              </h2>
          <span className="text-xs text-slate-500">Capital inicial {eur0(s.initialCapital)}</span>
        </header>
        <EquityChart points={withLivePoint(data.equity, s.equity)} initial={s.initialCapital} />
      </section>
      <CopiesPanel />
      </>
      )}

      {view === "abiertas" && (

      <section className={`${panel} overflow-x-auto`}>
        <header className="border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Briefcase className="h-5 w-5 text-blue-600" /> Posiciones abiertas y órdenes pendientes
              </h2>
          <p className="text-xs text-slate-500">
            Se revisan cada día al cierre: si el precio toca el stop o el objetivo, la posición se cierra sola
            {s.settings.breakeven ? "; al ganar 1 R el stop sube a precio de entrada" : ""}.
          </p>
        </header>
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr>
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
          <tbody>
            {active.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  Sin posiciones. Abre una desde «Oportunidades» o activa el modo automático en «Reglas y riesgo».
                </td>
              </tr>
            ) : (
              active.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2.5">
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
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_TONE[p.status]}`}>{p.status}</span>
                    {p.status === "pendiente" && <div className="mt-0.5 text-xs text-slate-500">próxima apertura</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{int(p.quantity)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {eur(p.entryPrice ?? p.plannedEntry)}
                    <div className="text-xs text-slate-500">{p.entryDay ? dayFmt(p.entryDay) : "prevista"}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{eur(p.lastPrice)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-700">
                    {eur(p.stop)}
                    {p.stop !== p.initialStop && <div className="text-xs text-slate-500">inicial {eur(p.initialStop)}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{eur(p.target)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${tone(p.unrealized)}`}>
                    {p.unrealized !== null ? eur0(p.unrealized) : "—"}
                    {p.unrealizedR !== null && <div className="text-xs">{num(p.unrealizedR, 2)} R</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
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
                  <td className="px-3 py-2.5">
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
      </section>
      )}

      {view === "historial" && (
      <section className={`${panel} overflow-x-auto`}>
        <header className="border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <History className="h-5 w-5 text-blue-600" /> Historial de operaciones
              </h2>
        </header>
        <table className="w-full min-w-[880px] text-sm">
          <thead>
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
            {history.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Aún no hay operaciones cerradas.
                </td>
              </tr>
            ) : (
              history.map((p) => (
                <tr key={p.id} className={`border-t border-slate-100 ${p.status === "cancelada" ? "text-slate-400" : ""}`}>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2.5">
                      <AssetIcon symbol={p.symbol} name={p.name} size="sm" />
                      <span>
                        <span className="block font-medium">{p.name}</span>
                        <span className="block text-xs text-slate-500">{p.direction === "long" ? "largo" : "corto"}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2">{p.pattern ? PATTERN_SHORT[p.pattern] : "manual"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {p.entryPrice !== null ? `${eur(p.entryPrice)} · ${dayFmt(p.entryDay)}` : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{p.exitPrice !== null ? `${eur(p.exitPrice)} · ${dayFmt(p.exitDay)}` : "—"}</td>
                  <td className="px-3 py-2 text-xs">{p.status === "cancelada" ? `Cancelada: ${p.exitReason ?? ""}` : p.exitReason}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(p.quantity)}</td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${tone(p.pnl)}`}>{p.pnl !== null ? eur0(p.pnl) : "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${tone(p.rMultiple)}`}>{p.rMultiple !== null ? num(p.rMultiple, 2) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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

      {editing && (
        <EditStops
          position={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
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

export function UniversePanel() {
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
      onChanged();
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
            <span className="flex min-w-0 items-center gap-2.5">
              <AssetIcon symbol={i.symbol} name={i.name} size="sm" />
              <span className="min-w-0">
              <span className="block truncate font-medium text-slate-800">{i.name}</span>
              <span className="text-xs text-slate-500">
                {i.symbol} · {i.lastError ? <span className="text-red-600">error</span> : i.lastCandle ? dayFmt(i.lastCandle) : "sin datos"}
              </span>
            </span>
            </span>
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
