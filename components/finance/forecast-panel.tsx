"use client";

import { useState } from "react";
import { CalendarDays, Check, PiggyBank, Plus, Trash2, X } from "lucide-react";
import type { overview } from "@/lib/finance/service";
import type { ForecastItem } from "@/lib/finance/logic";
import { card, eur, flat } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { CycleBars } from "./charts";
import { fapi, refreshFinance, shortDay } from "./api";

type View = Awaited<ReturnType<typeof overview>>;
type Suggestion = View["forecastSuggestions"][number];

function SavingsGoal({ settings }: { settings: View["settings"] }) {
  const [amount, setAmount] = useState(settings.savingsGoal?.toString() ?? "");
  const [frequency, setFrequency] = useState<"mensual" | "semanal">(settings.savingsFrequency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await fapi("settings", { savingsGoal: amount.trim() === "" ? null : Number(amount.replace(",", ".")), savingsFrequency: frequency });
      refreshFinance();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setSaving(false); }
  };
  return <section className={`${card} ${flat} p-4 sm:p-6`}>
    <div className="flex items-center gap-2"><PiggyBank className="h-5 w-5 text-emerald-600" /><h2 className="font-semibold text-slate-900">Mi objetivo de ahorro</h2></div>
    <p className="mt-1 text-xs text-slate-500">Dinero que quieres reservar, sin contabilizarlo como gasto.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 text-xs font-medium text-slate-600">Importe (€)
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900" />
      </label>
      <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Frecuencia del ahorro">
        {(["mensual", "semanal"] as const).map((f) => <button key={f} type="button" aria-pressed={frequency === f} onClick={() => setFrequency(f)}
          className={`rounded-lg px-3 py-2 text-xs font-semibold ${frequency === f ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{f === "mensual" ? "Mensual" : "Semanal"}</button>)}
      </div>
      <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Guardando…" : "Guardar"}</button>
    </div>
    {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
  </section>;
}

function ForecastSuggestions({ suggestions }: { suggestions: Suggestion[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (item: Suggestion, include: boolean) => {
    setBusy(item.key);
    setError(null);
    try {
      if (include) await fapi("forecast/item", { title: item.title, kind: item.kind, amount: item.amount,
        startDate: item.startDate, sourceKey: item.key });
      else await fapi("dismiss", { key: item.key });
      refreshFinance();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setBusy(null); }
  };
  return <section className={`${card} ${flat} p-4 sm:p-6`}>
    <h2 className="font-semibold text-slate-900">Quizá debas tener en cuenta…</h2>
    <p className="mt-1 text-xs text-slate-500">Posibles cobros y pagos de otros años. Solo entran en tu previsión si los confirmas.</p>
    {suggestions.length ? <ul className="mt-3 divide-y divide-slate-100">{suggestions.map((s) => <li key={s.key} className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{s.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{s.detail}</p>
          <p className="mt-1 text-xs text-slate-500">{shortDay(s.startDate)}</p></div>
        <b className={`amount shrink-0 text-sm tabular-nums ${s.kind === "ingreso" ? "text-blue-700" : "text-rose-700"}`}>{s.kind === "ingreso" ? "+" : "−"}{eur(s.amount, 2)}</b>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void act(s, true)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" />Incluir</button>
        <button type="button" disabled={busy !== null} onClick={() => void act(s, false)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-50"><X className="h-3.5 w-3.5" />No este año</button>
      </div>
    </li>)}</ul> : <p className="mt-4 text-sm text-slate-500">No hay nuevas sugerencias pendientes.</p>}
    {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
  </section>;
}

function MyPlans({ items }: { items: ForecastItem[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"ingreso" | "gasto">("gasto");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = (item?: ForecastItem) => {
    setEditing(item?.id ?? null);
    setTitle(item?.title ?? ""); setKind(item?.kind ?? "gasto"); setAmount(item?.amount.toString() ?? "");
    setStartDate(item?.startDate ?? ""); setEndDate(item?.endDate ?? ""); setError(null); setOpen(true);
  };
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await fapi("forecast/item", { id: editing, title, kind, amount: Number(amount.replace(",", ".")), startDate, endDate: endDate || null });
      setOpen(false); refreshFinance();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setBusy(true); setError(null);
    try { await fapi("forecast/item/delete", { id }); refreshFinance(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo eliminar"); }
    finally { setBusy(false); }
  };
  return <section className={`${card} ${flat} p-4 sm:p-6`}>
    <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">Mis próximos planes</h2>
      <p className="mt-1 text-xs text-slate-500">Eventos que quieres presupuestar. No alteran el histórico real.</p></div>
      <button type="button" onClick={() => edit()} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><Plus className="h-4 w-4" />Añadir</button>
    </div>
    {items.length ? <ul className="mt-3 divide-y divide-slate-100">{items.map((item) => <li key={item.id} className="flex items-center gap-3 py-3">
      <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
      <button type="button" onClick={() => edit(item)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
        <p className="text-xs text-slate-500">{shortDay(item.startDate)}{item.endDate ? ` – ${shortDay(item.endDate)}` : ""} · {item.source === "suggested" ? "Confirmado" : "Planificado"}</p></button>
      <b className={`amount shrink-0 text-sm tabular-nums ${item.kind === "ingreso" ? "text-blue-700" : "text-rose-700"}`}>{item.kind === "ingreso" ? "+" : "−"}{eur(item.amount, 2)}</b>
      <button type="button" disabled={busy} onClick={() => void remove(item.id)} aria-label={`Eliminar ${item.title}`} className="rounded-lg p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
    </li>)}</ul> : <p className="mt-4 text-sm text-slate-500">Todavía no has añadido planes.</p>}
    {open && <div className="mt-4 space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
      <label className="block text-xs font-medium text-slate-600">¿Qué tienes previsto?<input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Regalos de Navidad" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
      <div className="flex gap-2">{(["gasto", "ingreso"] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${kind === k ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}>{k === "gasto" ? "Gasto" : "Ingreso"}</button>)}</div>
      <label className="block text-xs font-medium text-slate-600">Presupuesto (€)<input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-slate-600">Desde<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm" /></label>
        <label className="text-xs font-medium text-slate-600">Hasta (opcional)<input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm" /></label>
      </div>
      <p className="text-xs text-slate-500">Si indicas un rango, el importe se reserva en el primer día. Puedes ajustarlo después.</p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Guardando…" : "Guardar plan"}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600">Cancelar</button></div>
    </div>}
    {!open && error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
  </section>;
}

export function ForecastPanel({ view }: { view: View }) {
  const [range, setRange] = useState<3 | 6 | 12>(3);
  const forecast = view.forecastCashflow;
  const points = forecast?.points.slice(0, range) ?? [];
  const last = points.at(-1);
  const total = points.reduce((s, p) => ({ income: s.income + p.income, expenses: s.expenses + p.expenses }), { income: 0, expenses: 0 });
  const goal = view.settings.savingsGoal ?? 0;
  const goalPerCycle = view.settings.savingsFrequency === "semanal" ? goal * 52 / 12 : goal;
  return <div className="space-y-4">
    <section className={`${card} ${flat} space-y-4 p-4 sm:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-900">Lo que viene</h2>
        <p className="mt-1 text-xs text-slate-500">Cada ciclo parte del dinero disponible al cerrar el anterior.</p></div>
        <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Periodo de previsión">{([3, 6, 12] as const).map((n) => <button key={n} type="button" aria-pressed={range === n} onClick={() => setRange(n)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${range === n ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{n}M</button>)}</div></div>
      {points.length ? <>
        <CycleBars height={235} balanceLabel="Saldo inicial" data={points.map((p) => ({
          label: p.current ? "Ahora" : new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" }).format(new Date(`${p.cycle.end}T00:00:00Z`)).replace(".", ""),
          title: p.current ? `Desde hoy · ${p.cycle.label}` : `Previsto · ${p.cycle.label}`,
          income: p.income, expenses: p.expenses, net: p.net, available: p.openingBalance, current: p.current,
        }))} />
        <div className="grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Ingresos previstos</p><p className="amount mt-1 text-lg font-bold text-blue-700">{eur(total.income, 2)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Gastos previstos</p><p className="amount mt-1 text-lg font-bold text-rose-700">{eur(total.expenses, 2)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Saldo previsto al cierre</p><p className={`amount mt-1 text-lg font-bold ${(last?.closingBalance ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{last?.closingBalance === null ? "Sin saldo bancario" : eur(last?.closingBalance, 2)}</p></div>
        </div>
        {goal > 0 && <p className="text-xs text-slate-600">Objetivo a reservar en {range} ciclos: <b>{eur(goalPerCycle * range, 2)}</b>. No se resta como gasto ni se mueve de tu cuenta.</p>}
        <p className="text-xs leading-relaxed text-slate-500">El primer ciclo parte del saldo bancario de hoy y solo suma cobros y pagos futuros. Los demás usan recurrencias y gasto variable medio ({eur(forecast.variableDaily, 2)}/día). Los planes añadidos se incluyen únicamente en esta previsión.</p>
        {!forecast.hasExpectedIncome && <p className="text-xs font-medium text-amber-700">Sin ingresos periódicos suficientes: puede faltar dinero por estimar.</p>}
      </> : <p className="py-6 text-sm text-slate-500">La previsión todavía no está disponible.</p>}
    </section>
    <SavingsGoal key={`${view.settings.savingsGoal}:${view.settings.savingsFrequency}`} settings={view.settings} />
    <ForecastSuggestions suggestions={view.forecastSuggestions ?? []} />
    <MyPlans items={view.forecastItems ?? []} />
  </div>;
}
