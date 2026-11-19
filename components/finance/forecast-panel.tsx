"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronRight, PiggyBank, Plus, Trash2, X } from "lucide-react";
import type { forecastSource, overview } from "@/lib/finance/service";
import { forecastPlanOccurrences, type ForecastFrequency, type ForecastItem } from "@/lib/finance/logic";
import { card, eur, flat } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CycleBars } from "./charts";
import { fapi, longDay, refreshFinance, shortDay } from "./api";

type View = Awaited<ReturnType<typeof overview>>;
type Suggestion = View["forecastSuggestions"][number];
type Reference = NonNullable<Awaited<ReturnType<typeof forecastSource>>>;
type ForecastEvent = View["forecastNextWeeks"][number]["events"][number];
type ForecastWeek = { start: string; end: string };
const forecastFrequencies: { value: ForecastFrequency; label: string }[] = [
  { value: "puntual", label: "Una vez" }, { value: "semanal", label: "Cada semana" },
  { value: "mensual", label: "Cada mes" }, { value: "trimestral", label: "Cada 3 meses" }, { value: "anual", label: "Cada año" },
];
const frequencyLabel = (value: ForecastFrequency) => forecastFrequencies.find((option) => option.value === value)?.label ?? "Una vez";

function planTitle(item: ForecastItem) {
  const extra = /^forecast-extra:(\d{4})-(\d{2})$/.exec(item.sourceKey ?? "");
  if (item.title !== "Posible paga extra" || !extra) return item.title;
  const month = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" }).format(new Date(`${extra[1]}-${extra[2]}-01T00:00:00Z`));
  return `Paga extra · ${month} ${extra[1]}`;
}

function ForecastReferenceSheet({ referenceKey, onClose }: { referenceKey: string | null; onClose: () => void }) {
  const [reference, setReference] = useState<Reference | null>(null);
  const [loading, setLoading] = useState(referenceKey !== null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!referenceKey) return;
    let active = true;
    fapi<Reference>(`forecast/source?key=${encodeURIComponent(referenceKey)}`)
      .then((data) => { if (active) setReference(data); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "No se pudo cargar el detalle"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [referenceKey]);
  const open = referenceKey !== null;
  return <Sheet open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
    <SheetContent side="right" showCloseButton={false} className="w-screen max-w-none gap-0 overflow-y-auto p-0 sm:max-w-lg">
      <SheetHeader className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} aria-label="Volver a previsión" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0"><SheetTitle className="font-semibold text-slate-900">Detalle de la sugerencia</SheetTitle>
            <SheetDescription>De dónde sale este cálculo</SheetDescription></div>
        </div>
      </SheetHeader>
      <div className="space-y-5 p-5">
        {loading && <p className="text-sm text-slate-500">Buscando el movimiento original…</p>}
        {error && <ErrorNote>{error}</ErrorNote>}
        {!loading && reference && !error && <>
          <div><p className="text-sm font-semibold text-slate-900">{reference.title}</p>
            <p className="mt-1 text-xs text-slate-500">Fecha prevista · {longDay(reference.targetDate)}</p>
            {reference.estimate !== null && <p className={`amount mt-3 text-2xl font-bold tabular-nums ${reference.kind === "ingreso" ? "text-blue-700" : "text-rose-700"}`}>{reference.kind === "ingreso" ? "+" : "−"}{eur(reference.estimate, 2)}</p>}
          </div>
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{reference.source.type === "payslip" ? "Nómina de referencia" : "Movimiento de referencia"}</h3>
            <p className="mt-3 text-sm font-semibold text-slate-900">{reference.source.label}</p>
            <p className="mt-1 text-xs text-slate-500">{reference.source.type === "payslip" ? reference.source.date : longDay(reference.source.date)}</p>
            <p className="amount mt-2 text-base font-semibold text-slate-900">{eur(reference.source.amount, 2)}</p>
            <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">{reference.source.description}</p>
            {"account" in reference.source && reference.source.account && <p className="mt-2 text-xs text-slate-500">Cuenta · {reference.source.account}</p>}
          </section>
          {"related" in reference && (reference.related?.length ?? 0) > 0 && <section>
            <h3 className="text-sm font-semibold text-slate-900">Otros recibos que apoyan la estimación</h3>
            <div className="mt-2 divide-y divide-slate-100">{(reference.related ?? []).map((tx) => <div key={`${tx.date}:${tx.amount}`} className="py-3">
              <div className="flex justify-between gap-3 text-xs"><span className="text-slate-500">{longDay(tx.date)}</span><b className="amount shrink-0 text-slate-900">{eur(tx.amount, 2)}</b></div>
              <p className="mt-1 break-words text-xs text-slate-600">{tx.description}</p>
            </div>)}</div>
          </section>}
          <section><h3 className="text-sm font-semibold text-slate-900">Cómo se ha calculado</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{reference.explanation}</p>
            <div className="mt-3 divide-y divide-slate-100">{reference.breakdown.map((row) => <div key={row.label} className="flex items-baseline justify-between gap-3 py-2 text-xs">
              <span className="text-slate-500">{row.label}</span><span className="shrink-0 font-semibold tabular-nums text-slate-800">{row.value === null ? "Sin datos" : "format" in row && row.format === "count" ? row.value : eur(row.value, 2)}</span>
            </div>)}</div>
          </section>
          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">{reference.caution}</p>
        </>}
      </div>
    </SheetContent>
  </Sheet>;
}

function ForecastEventBody({ event, plan, onClose }: { event: ForecastEvent; plan?: ForecastItem; onClose: () => void }) {
  const [amount, setAmount] = useState(event.amount.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recurring = event.origin === "recurrente" && event.kind === "gasto" && !!event.occurrenceKey;
  const editable = recurring || (event.origin === "plan" && !!plan);
  const act = async (value: number | null) => {
    if (!editable) return;
    setSaving(true); setError(null);
    try {
      if (recurring) await fapi("forecast/occurrence", { key: event.occurrenceKey, amount: value });
      else if (plan && value !== null) await fapi("forecast/item", { id: plan.id, title: plan.title, kind: plan.kind,
        amount: value, startDate: plan.startDate, endDate: plan.endDate, frequency: plan.frequency ?? "puntual" });
      refreshFinance(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar la previsión"); }
    finally { setSaving(false); }
  };
  const parsed = Number(amount.replace(",", "."));
  const valid = amount.trim() !== "" && Number.isFinite(parsed) && parsed >= (recurring ? 0 : 0.01) && parsed <= 1_000_000;
  const changed = valid && Math.round(parsed * 100) !== Math.round(event.amount * 100);
  return <div className="min-h-0 space-y-5 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
    <div><p className="text-xs text-slate-500">{event.origin === "recurrente" ? "Movimiento habitual" : event.origin === "plan" ? "Plan añadido" : "Estimación"} · {longDay(event.date)}</p>
      <h2 className="mt-2 break-words text-lg font-semibold text-slate-900">{event.label}</h2>
      <p className={`amount mt-2 text-2xl font-bold ${event.kind === "ingreso" ? "text-blue-700" : "text-rose-700"}`}>{event.modified && event.amount === 0 ? "Omitido este ciclo" : `${event.kind === "ingreso" ? "+" : "−"}${eur(event.amount, 2)}`}</p>
    </div>
    {event.origin === "recurrente" && <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">De dónde sale</h3>
      <div className="mt-3 space-y-2 text-sm text-slate-700">
        <p>Importe habitual: <b>{eur(event.originalAmount ?? event.amount, 2)}</b></p>
        {event.lastDate && <p>Último movimiento: <b>{longDay(event.lastDate)}</b></p>}
        {event.frequency && <p>Periodicidad detectada: <b>{event.frequency}</b></p>}
        {event.count && <p>Movimientos utilizados: <b>{event.count}</b></p>}
      </div>
    </section>}
    {event.origin === "plan" && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Este importe lo has añadido o confirmado en «Mis próximos planes».{plan?.frequency && plan.frequency !== "puntual" ? " Si lo modificas, se actualizarán todas sus repeticiones." : ""}</p>}
    {editable ? <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Ajustar esta previsión</h3>
      <label className="block text-xs font-medium text-slate-600">Importe previsto (€)
        <input type="number" min={recurring ? "0" : "0.01"} max="1000000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900" />
      </label>
      {recurring && <p className="text-xs leading-relaxed text-slate-500">Este cambio solo afecta al cargo del {longDay(event.date)}. Los siguientes meses mantienen el importe habitual.</p>}
      {error && <ErrorNote>{error}</ErrorNote>}
      {recurring && event.amount !== 0 && <button type="button" disabled={saving} onClick={() => void act(0)} className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50">No se cobrará este mes</button>}
      <button type="button" disabled={saving || !changed} onClick={() => void act(parsed)} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">{saving ? "Guardando…" : "Guardar cambios"}</button>
      {recurring && event.modified && <button type="button" disabled={saving} onClick={() => void act(null)} className="w-full px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50">Restaurar importe habitual</button>}
    </section> : <p className="text-sm text-slate-500">Esta estimación se calcula a partir de tu histórico y no tiene un cargo individual que cancelar.</p>}
  </div>;
}

function ForecastBottomSheet({ open, onClose, title, description, children }: {
  open: boolean; onClose: () => void; title: string; description: string; children: ReactNode;
}) {
  return <Sheet open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
    <SheetContent side="bottom" showCloseButton={false}
      className="mx-auto max-h-[90dvh] w-full max-w-xl gap-0 overflow-hidden rounded-t-2xl p-0 duration-300 data-[side=bottom]:data-open:slide-in-from-bottom-full data-[side=bottom]:data-closed:slide-out-to-bottom-full">
      <SheetHeader className="shrink-0 border-b border-slate-100 bg-white px-5 pb-3 pt-2">
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><SheetTitle className="font-semibold text-slate-900">{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription></div>
          <button type="button" onClick={onClose} aria-label="Cerrar detalle" className="shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
      </SheetHeader>
      {children}
    </SheetContent>
  </Sheet>;
}

function ForecastEventSheet({ event, plan, open, onClose }: { event: ForecastEvent | null; plan?: ForecastItem; open: boolean; onClose: () => void }) {
  return <ForecastBottomSheet open={open} onClose={onClose} title="Detalle del movimiento previsto" description="Solo afecta a tu previsión, no a la cuenta bancaria">
    {event && <ForecastEventBody key={event.occurrenceKey ?? `${event.date}:${event.planId ?? event.label}`} event={event} plan={plan} onClose={onClose} />}
  </ForecastBottomSheet>;
}

function ForecastNewPlanSheet({ week, open, onClose }: { week: ForecastWeek | null; open: boolean; onClose: () => void }) {
  return <ForecastBottomSheet open={open} onClose={onClose} title="Añadir imprevisto" description="Gasto que quieres incluir en tu previsión, no en el banco">
    {week && <ForecastNewPlanForm key={week.start} week={week} onClose={onClose} />}
  </ForecastBottomSheet>;
}

function ForecastNewPlanForm({ week, onClose }: { week: ForecastWeek; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(week.start);
  const [frequency, setFrequency] = useState<ForecastFrequency>("puntual");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(amount.replace(",", "."));
  const valid = title.trim().length > 0 && amount.trim().length > 0 && Number.isFinite(value) && value >= 0.01
    && value <= 10_000_000 && date >= week.start && date <= week.end;
  const save = async () => {
    if (!valid) return;
    setSaving(true); setError(null);
    try {
      await fapi("forecast/item", { title: title.trim(), kind: "gasto", amount: value, startDate: date, frequency });
      refreshFinance(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo añadir el imprevisto"); }
    finally { setSaving(false); }
  };
  return <div className="min-h-0 space-y-4 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
    <p className="text-xs text-slate-500">Semana del {shortDay(week.start)} al {shortDay(week.end)}</p>
    <label className="block text-xs font-medium text-slate-600">Nombre
      <input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Cena de empresa, regalo, reparación…"
        className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900" />
    </label>
    <label className="block text-xs font-medium text-slate-600">Importe previsto (€)
      <input type="number" min="0.01" max="10000000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00"
        className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900" />
    </label>
    <label className="block text-xs font-medium text-slate-600">Fecha aproximada
      <input type="date" min={week.start} max={week.end} value={date} onChange={(e) => setDate(e.target.value)}
        className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900" />
    </label>
    <label className="block text-xs font-medium text-slate-600">Periodicidad
      <select value={frequency} onChange={(e) => setFrequency(e.target.value as ForecastFrequency)}
        className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900">
        {forecastFrequencies.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <p className="text-xs leading-relaxed text-slate-500">La fecha sirve para situarlo en el calendario. {frequency !== "puntual" ? "Se repetirá en los siguientes periodos de previsión." : "Es un gasto puntual y aproximado."}</p>
    {error && <ErrorNote>{error}</ErrorNote>}
    <div className="flex gap-2 pt-1">
      <button type="button" disabled={saving} onClick={onClose} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancelar</button>
      <button type="button" disabled={saving || !valid} onClick={() => void save()} className="min-w-0 flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400">{saving ? "Guardando…" : "Guardar"}</button>
    </div>
  </div>;
}

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

function NextCycleWeeks({ weeks, cycle, onEvent, onAdd }: { weeks: View["forecastNextWeeks"]; cycle: View["forecastCashflow"]["points"][number]; onEvent: (event: ForecastEvent) => void; onAdd: (week: ForecastWeek) => void }) {
  return <section className={`${card} ${flat} p-4 sm:p-6`}>
    <h2 className="font-semibold text-slate-900">Tu próximo mes, semana a semana</h2>
    <p className="mt-1 text-xs text-slate-500">{longDay(cycle.cycle.start)} – {longDay(cycle.cycle.end)} · ciclo de tu nómina</p>
    <div className="mt-4 divide-y divide-slate-100">{weeks.map((week, index) => <div key={week.start} className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-semibold text-slate-900">Semana {index + 1}</p>
          <p className="text-xs text-slate-500">{shortDay(week.start)} – {shortDay(week.end)}</p></div>
        <div className="text-right"><p className="text-[11px] text-slate-500">Disponible al cierre</p>
          <p className={`amount text-base font-bold tabular-nums ${week.closingBalance === null ? "text-slate-500" : week.closingBalance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{week.closingBalance === null ? "Sin saldo bancario" : eur(week.closingBalance, 2)}</p></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-blue-50 px-3 py-2"><p className="text-slate-500">Ingresos</p><b className="amount mt-1 block text-sm tabular-nums text-blue-700">+{eur(week.income, 2)}</b></div>
        <div className="rounded-lg bg-rose-50 px-3 py-2"><p className="text-slate-500">Gastos</p><b className="amount mt-1 block text-sm tabular-nums text-rose-700">−{eur(week.expenses, 2)}</b></div>
      </div>
      <details className="group mt-2" open={index === 0}>
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-blue-700 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" /> Cobros y pagos previstos</summary>
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
          {week.events.map((event, i) => <button type="button" key={`${event.date}:${event.label}:${i}`} onClick={() => onEvent(event)}
            className="flex w-full items-start justify-between gap-2 rounded-lg py-1 text-left text-xs hover:bg-white focus-visible:outline-2 focus-visible:outline-blue-500">
            <div className="min-w-0"><p className={`break-words font-medium ${event.modified && event.amount === 0 ? "text-slate-400 line-through" : "text-slate-700"}`}>{event.label}</p>
              <p className="text-slate-500">{shortDay(event.date)} · {event.modified ? event.amount === 0 ? "Omitido" : "Ajustado" : event.origin === "plan" ? "Planificado" : event.origin === "estimado" ? "Estimado" : "Habitual"}</p></div>
            <b className={`amount ml-auto shrink-0 tabular-nums ${event.kind === "ingreso" ? "text-blue-700" : event.amount === 0 ? "text-slate-400" : "text-rose-700"}`}>{event.modified && event.amount === 0 ? "Omitido" : `${event.kind === "ingreso" ? "+" : "−"}${eur(event.amount, 2)}`}</b>
          </button>)}
          {week.variable > 0 && <div className="flex justify-between gap-2 border-t border-slate-200 pt-2 text-xs text-slate-500"><span>Gastos cotidianos estimados</span><b className="amount shrink-0 tabular-nums text-rose-700">−{eur(week.variable, 2)}</b></div>}
          {!week.events.length && week.variable === 0 && <p className="text-xs text-slate-500">Sin movimientos previstos.</p>}
          <button type="button" onClick={() => onAdd({ start: week.start, end: week.end })}
            className="flex w-full items-center gap-1.5 border-t border-slate-200 pt-3 text-left text-xs font-semibold text-blue-700 hover:text-blue-900">
            <Plus className="h-4 w-4" /> Añadir imprevisto
          </button>
        </div>
      </details>
    </div>)}</div>
    <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">Los cobros y recibos habituales se sitúan en sus fechas esperadas. El gasto cotidiano se reparte como estimación; los importes semanales suman exactamente el mes mostrado arriba.</p>
  </section>;
}

function ForecastSuggestions({ suggestions, onDetail }: { suggestions: Suggestion[]; onDetail: (key: string) => void }) {
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
        <button type="button" onClick={() => onDetail(s.key)} className="ml-auto inline-flex items-center gap-0.5 rounded-lg px-1 py-1.5 text-xs font-semibold text-blue-700">Ver detalle <ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
    </li>)}</ul> : <p className="mt-4 text-sm text-slate-500">No hay sugerencias pendientes en este periodo.</p>}
    {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
  </section>;
}

function MyPlans({ items, hiddenCount, periodStart, periodEnd, onDetail }: {
  items: ForecastItem[]; hiddenCount: number; periodStart: string; periodEnd: string; onDetail: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"ingreso" | "gasto">("gasto");
  const [frequency, setFrequency] = useState<ForecastFrequency>("puntual");
  const [isSuggested, setIsSuggested] = useState(false);
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = (item?: ForecastItem) => {
    setEditing(item?.id ?? null);
    setTitle(item?.title ?? ""); setKind(item?.kind ?? "gasto"); setAmount(item?.amount.toString() ?? "");
    setFrequency(item?.frequency ?? "puntual"); setIsSuggested(item?.source === "suggested");
    setStartDate(item?.startDate ?? ""); setEndDate(item?.endDate ?? ""); setError(null); setOpen(true);
  };
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await fapi("forecast/item", { id: editing, title, kind, amount: Number(amount.replace(",", ".")), startDate,
        endDate: endDate || null, frequency });
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
    {items.length ? <ul className="mt-3 divide-y divide-slate-100">{items.map((item) => {
      const nextDate = forecastPlanOccurrences(item, periodStart, periodEnd)[0] ?? item.startDate;
      return <li key={item.id} className="flex items-center gap-3 py-3">
      <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1"><button type="button" onClick={() => edit(item)} className="w-full text-left"><p className="truncate text-sm font-medium text-slate-900">{planTitle(item)}</p>
        <p className="text-xs text-slate-500">{shortDay(nextDate)} {nextDate.slice(0, 4)}{item.endDate ? ` · hasta ${shortDay(item.endDate)}` : ""} · {item.source === "suggested" ? "Confirmado" : frequencyLabel(item.frequency ?? "puntual")}</p></button>
        {item.source === "suggested" && item.sourceKey && <button type="button" onClick={() => onDetail(item.sourceKey!)} className="mt-1 inline-flex items-center text-xs font-semibold text-blue-700">Ver detalle <ChevronRight className="h-3.5 w-3.5" /></button>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2"><b className={`amount text-sm tabular-nums ${item.kind === "ingreso" ? "text-blue-700" : "text-rose-700"}`}>{item.kind === "ingreso" ? "+" : "−"}{eur(item.amount, 2)}</b>
        <button type="button" disabled={busy} onClick={() => void remove(item.id)} aria-label={`Eliminar ${item.title}`} className="rounded-lg p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>
    </li>})}</ul> : <p className="mt-4 text-sm text-slate-500">{hiddenCount ? "No hay planes en este periodo." : "Todavía no has añadido planes."}</p>}
    {hiddenCount > 0 && <p className="mt-2 text-xs text-slate-500">{hiddenCount} {hiddenCount === 1 ? "plan fuera" : "planes fuera"} del periodo seleccionado. Amplía el plazo para verlo{hiddenCount === 1 ? "" : "s"}.</p>}
    {open && <div className="mt-4 space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
      <label className="block text-xs font-medium text-slate-600">¿Qué tienes previsto?<input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Regalos de Navidad" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
      <div className="flex gap-2">{(["gasto", "ingreso"] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${kind === k ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}>{k === "gasto" ? "Gasto" : "Ingreso"}</button>)}</div>
      <label className="block text-xs font-medium text-slate-600">Presupuesto (€)<input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
      {!isSuggested && <label className="block text-xs font-medium text-slate-600">Periodicidad
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as ForecastFrequency)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          {forecastFrequencies.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>}
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
  const [range, setRange] = useState<1 | 3 | 6 | 12>(3);
  const [selectedChart, setSelectedChart] = useState<{ range: number; index: number } | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ForecastEvent | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<ForecastWeek | null>(null);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const forecast = view.forecastCashflow;
  const weeklyMode = range === 1;
  const points = weeklyMode ? forecast.points.slice(1, 2) : forecast.points.slice(0, range);
  const last = points.at(-1);
  const periodStart = weeklyMode ? points[0]?.cycle.start ?? view.today : view.today;
  const periodEnd = last?.cycle.end ?? view.today;
  const visibleSuggestions = (view.forecastSuggestions ?? []).filter((s) => s.startDate >= periodStart && s.startDate <= periodEnd);
  const visiblePlans = (view.forecastItems ?? []).filter((item) => forecastPlanOccurrences(item, periodStart, periodEnd).length > 0);
  const total = points.reduce((s, p) => ({ income: s.income + p.income, expenses: s.expenses + p.expenses }), { income: 0, expenses: 0 });
  const goal = view.settings.savingsGoal ?? 0;
  const goalPerCycle = view.settings.savingsFrequency === "semanal" ? goal * 52 / 12 : goal;
  let savingsToAllocate = Math.max(0, goalPerCycle);
  const rawChartData = weeklyMode ? view.forecastNextWeeks.map((w, i) => {
    const fixedExpenses = Math.round(w.events.filter((event) => event.origin === "recurrente" && event.kind === "gasto")
      .reduce((sum, event) => sum + event.amount, 0) * 100) / 100;
    const reservedSavings = Math.round(Math.min(Math.max(0, w.income), savingsToAllocate) * 100) / 100;
    savingsToAllocate = Math.max(0, savingsToAllocate - reservedSavings);
    return { label: `Sem ${i + 1}`, title: `Semana ${i + 1} · ${shortDay(w.start)} – ${shortDay(w.end)}`,
      income: w.income, expenses: w.expenses, net: w.net, available: w.closingBalance,
      fixedExpenses, estimatedExpenses: Math.round((w.expenses - fixedExpenses) * 100) / 100, reservedSavings };
  }) : points.map((p) => ({
    label: p.current ? "Ahora" : new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" }).format(new Date(`${p.cycle.end}T00:00:00Z`)).replace(".", ""),
    title: p.current ? `Desde hoy · ${p.cycle.label}` : `Previsto · ${p.cycle.label}`,
    income: p.income, expenses: p.expenses, net: p.net, available: p.closingBalance, current: p.current,
    fixedExpenses: p.fixedExpenses, estimatedExpenses: p.estimatedExpenses,
    reservedSavings: Math.round(Math.min(Math.max(0, p.income), Math.max(0, goalPerCycle)) * 100) / 100,
  }));
  const chartData = rawChartData.reduce<Array<(typeof rawChartData)[number] & { accumulatedSavings: number }>>((items, point) => [
    ...items,
    { ...point, accumulatedSavings: Math.round(((items.at(-1)?.accumulatedSavings ?? 0) + point.reservedSavings) * 100) / 100 },
  ], []);
  const selectedIndex = selectedChart?.range === range ? selectedChart.index : null;
  const totalSavings = chartData.at(-1)?.accumulatedSavings ?? 0;
  const savedUntilSelected = selectedIndex === null ? totalSavings : (chartData[selectedIndex]?.accumulatedSavings ?? 0);
  return <><div className={`space-y-4 transition-transform duration-200 ${detailKey ? "-translate-x-3" : ""}`}>
    <section className={`${card} ${flat} space-y-3 p-4 sm:p-6`}>
      <div className="flex justify-end">
        <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Periodo de previsión">{([1, 3, 6, 12] as const).map((n) => <button key={n} type="button" aria-pressed={range === n} onClick={() => setRange(n)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${range === n ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{n}M</button>)}</div></div>
      {points.length ? <>
        <CycleBars key={range} height={235} balanceLabel="Disponible al cierre" data={chartData} showLegend={false} wideBars
          onSelect={(index) => setSelectedChart(index === null ? null : { range, index })} />
        <div className="grid grid-cols-4 gap-1 border-t border-slate-100 pt-3 text-center sm:gap-3" aria-label="Totales de la previsión">
          <div className="min-w-0" title={`Ingresos: ${eur(total.income, 2)}`} aria-label={`Ingresos: ${eur(total.income, 2)}`}>
            <p className="amount truncate text-[10px] font-bold tabular-nums tracking-tight text-blue-700 sm:text-sm">{eur(total.income, 2)}</p>
          </div>
          <div className="min-w-0" title={`Gastos: ${eur(total.expenses, 2)}`} aria-label={`Gastos: ${eur(total.expenses, 2)}`}>
            <p className="amount truncate text-[10px] font-bold tabular-nums tracking-tight text-rose-600 sm:text-sm">{eur(total.expenses, 2)}</p>
          </div>
          <div className="min-w-0" title={`Ahorro reservado: ${eur(totalSavings, 2)}`} aria-label={`Ahorro reservado: ${eur(totalSavings, 2)}`}>
            <p className="amount truncate text-[10px] font-bold tabular-nums tracking-tight text-blue-400 sm:text-sm">{eur(totalSavings, 2)}</p>
          </div>
          <div className="min-w-0" title={`Disponible al final: ${last?.closingBalance === null || !last ? "Sin saldo" : eur(last.closingBalance, 2)}`}
            aria-label={`Disponible al final: ${last?.closingBalance === null || !last ? "Sin saldo" : eur(last.closingBalance, 2)}`}>
            <p className={`amount truncate text-[10px] font-bold tabular-nums tracking-tight sm:text-sm ${(last?.closingBalance ?? 0) >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{last?.closingBalance === null || !last ? "" : eur(last.closingBalance, 2)}</p>
          </div>
        </div>
        <div className="flex items-baseline justify-end gap-2 text-xs text-slate-500" aria-live="polite">
          <span>Total ahorrado{selectedIndex === null ? "" : ` hasta ${chartData[selectedIndex]?.label ?? "este tramo"}`}</span>
          <strong className="amount text-sm font-semibold tabular-nums text-blue-500">{eur(savedUntilSelected, 2)}</strong>
        </div>
        {!forecast.hasExpectedIncome && <p className="text-xs font-medium text-amber-700">Sin ingresos periódicos suficientes: puede faltar dinero por estimar.</p>}
      </> : <p className="py-6 text-sm text-slate-500">La previsión todavía no está disponible.</p>}
    </section>
    {forecast.points[1] && <NextCycleWeeks weeks={view.forecastNextWeeks} cycle={forecast.points[1]}
      onEvent={(event) => { setSelectedEvent(event); setEventOpen(true); }}
      onAdd={(week) => { setSelectedWeek(week); setNewPlanOpen(true); }} />}
    <SavingsGoal key={`${view.settings.savingsGoal}:${view.settings.savingsFrequency}`} settings={view.settings} />
    <ForecastSuggestions suggestions={visibleSuggestions} onDetail={setDetailKey} />
    <MyPlans items={visiblePlans} hiddenCount={(view.forecastItems ?? []).length - visiblePlans.length}
      periodStart={periodStart} periodEnd={periodEnd} onDetail={setDetailKey} />
  </div><ForecastReferenceSheet key={`reference:${detailKey ?? "closed"}`} referenceKey={detailKey} onClose={() => setDetailKey(null)} />
    <ForecastEventSheet event={selectedEvent} open={eventOpen}
      plan={view.forecastItems.find((item) => item.id === selectedEvent?.planId)} onClose={() => setEventOpen(false)} />
    <ForecastNewPlanSheet week={selectedWeek} open={newPlanOpen} onClose={() => setNewPlanOpen(false)} /></>;
}
