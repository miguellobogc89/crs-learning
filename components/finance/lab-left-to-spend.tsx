"use client";
// Laboratorio · «Te quedan» (24/11/2026). Mi plan como un solo número, al estilo de Monarch (flex number) y Emma
// (left to spend), en tu ciclo de cobro (de nómina a nómina): lo que traías del ciclo anterior + lo cobrado en este −
// lo que se repite (fijos) − lo que quieres ahorrar = para gastar; menos lo ya gastado (y los extraordinarios) = te
// quedan X € (y cuánto al día). Los fijos se ajustan con casillas; debajo, como mucho 3 avisos de
// dónde se te está yendo (solo lo que se desvía de lo normal). Los extraordinarios van aparte. Prueba: no guarda nada.
import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { planView } from "@/lib/finance/service";
import { categoryLabel } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useFinance } from "./api";
import { CategoryIcon } from "./category-icon";

type Plan = Awaited<ReturnType<typeof planView>>;
const num = (s: string) => { const n = Number(s.replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : 0; };

export function LabLeftToSpend() {
  const { data, error } = useFinance<Plan>("plan");
  const [income, setIncome] = useState("");
  const [saving, setSaving] = useState("");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [showFixed, setShowFixed] = useState(false);

  // Lo que se repite cada mes (una línea por comercio) y lo que de eso falta por cobrar este mes.
  const fixed = useMemo(() => {
    if (!data) return [];
    const pending = new Set((data.pending ?? []).map((p) => p.key));
    const by = new Map<string, { key: string; title: string; amount: number; category: string; pending: boolean }>();
    for (const i of data.next?.items ?? []) {
      if (i.source !== "repite" || !i.key) continue;
      const x = by.get(i.key);
      if (x) x.amount += i.amount;
      else by.set(i.key, { key: i.key, title: i.title, amount: i.amount, category: i.category, pending: pending.has(i.key) });
    }
    return [...by.values()].sort((a, b) => b.amount - a.amount);
  }, [data]);

  useEffect(() => {
    if (!data) return;
    // Lo cobrado de verdad en este ciclo; si aún no ha entrado nada, lo que sueles cobrar.
    setIncome((v) => v || String(Math.round(data.budget.incomeNow > 0 ? data.budget.incomeNow : data.budget.income ?? 0)));
    setSaving((v) => v || (data.budget.savingsGoal !== null ? String(Math.round(data.budget.savingsGoal)) : "0"));
  }, [data]);

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={5} />;

  const cur = data.history[0];
  const closed = data.history.slice(1, 4);
  const on = fixed.filter((f) => !off.has(f.key));
  const fixedTotal = on.reduce((t, f) => t + f.amount, 0);
  // Lo gastado este mes que no es fijo: todo lo gastado (sin extraordinarios) menos los fijos ya cobrados.
  const spentAll = Object.values(cur?.atDay ?? {}).reduce((t, x) => t + x, 0);
  const fixedCharged = fixed.filter((f) => !f.pending).reduce((t, f) => t + f.amount, 0);
  const spent = Math.max(0, spentAll - fixedCharged);
  const inc = num(income);
  const save = num(saving);
  const carry = data.cash.atStart;
  const extras = Object.values(data.totals.extrasNow ?? {}).reduce((t, x) => t + x, 0);
  const forMonth = carry + inc - fixedTotal - save;
  const left = forMonth - spent - extras;
  const daysLeft = Math.max(1, data.cycle.totalDays - data.cycle.day + 1);
  const perDay = left / daysLeft;
  const fixedKeys = new Set(fixed.map((f) => f.category));

  // Dónde se te está yendo: categorías de gasto variable que van por encima de lo normal a estas alturas del mes.
  const drifts = Object.keys(cur?.atDay ?? {})
    .filter((k) => !fixedKeys.has(k))
    .map((k) => {
      const now = cur.atDay[k] ?? 0;
      const usual = closed.length ? closed.reduce((t, c) => t + (c.atDay[k] ?? 0), 0) / closed.length : 0;
      return { k, now, usual, over: now - usual };
    })
    .filter((x) => x.over >= 20 && x.now > x.usual * 1.25)
    .sort((a, b) => b.over - a.over)
    .slice(0, 3);

  const pct = forMonth > 0 ? Math.min(100, Math.max(0, ((spent + extras) / forMonth) * 100)) : 100;

  return (
    <div className="pb-4">
      <p className="text-sm text-slate-500">Te quedan hasta tu próximo cobro · {data.cycle.label}</p>
      <p className={`amount mt-0.5 text-[40px] font-semibold leading-none tracking-tight ${left < 0 ? "text-rose-700" : "text-slate-900"}`}>{eur(left, 0)}</p>
      <p className={`amount mt-2 text-[15px] font-medium ${left < 0 ? "text-rose-700" : "text-slate-600"}`}>
        {left < 0 ? `Te has pasado ${eur(-left, 0)} de lo que tenías para gastar (contando lo que querías ahorrar)` : `Unos ${eur(perDay, 0)} al día durante ${daysLeft} ${daysLeft === 1 ? "día" : "días"}`}
      </p>
      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${left < 0 ? "bg-rose-500" : pct > 85 ? "bg-amber-500" : "bg-blue-600"}`} style={{ width: `${pct}%` }} />
      </div>

      {/* La cuenta, a la vista: de dónde sale la cifra. */}
      <dl className="amount mt-5 space-y-2 text-[15px]">
        <div className="flex justify-between gap-3"><dt className="text-slate-600">Traías del ciclo anterior</dt><dd className={`font-semibold tabular-nums ${carry < 0 ? "text-rose-700" : "text-slate-900"}`}>{eur(carry, 0)}</dd></div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-600">+ Cobrado en el ciclo</dt>
          <dd className="flex items-center gap-1"><input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} aria-label="Lo que cobras al mes"
            className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right font-semibold tabular-nums text-slate-900 outline-none focus:border-blue-400" /><span className="text-slate-500">€</span></dd>
        </div>
        <div>
          <button type="button" onClick={() => setShowFixed((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
            <dt className="flex items-center gap-1 text-slate-600">− Gastos fijos <ChevronDown className={`h-4 w-4 transition-transform ${showFixed ? "rotate-180" : ""}`} /></dt>
            <dd className="font-semibold tabular-nums text-slate-900">{eur(fixedTotal, 0)}</dd>
          </button>
          {showFixed && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl bg-slate-50 px-3">
              {fixed.map((f) => (
                <li key={f.key}>
                  <label className="flex items-center gap-3 py-2">
                    <input type="checkbox" checked={!off.has(f.key)} onChange={(e) => setOff((s) => { const n = new Set(s); if (e.target.checked) n.delete(f.key); else n.add(f.key); return n; })} className="h-4 w-4 accent-blue-600" />
                    <span className={`min-w-0 flex-1 truncate text-sm ${off.has(f.key) ? "text-slate-400 line-through" : "text-slate-800"}`}>{f.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">{f.pending ? "por cobrar" : "cobrado"}</span>
                    <span className="shrink-0 text-sm tabular-nums text-slate-700">{eur(f.amount, 0)}</span>
                  </label>
                </li>
              ))}
              {!fixed.length && <li className="py-2 text-sm text-slate-500">No hay nada que se repita.</li>}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-600">− Quieres ahorrar</dt>
          <dd className="flex items-center gap-1"><input inputMode="decimal" value={saving} onChange={(e) => setSaving(e.target.value)} aria-label="Lo que quieres ahorrar al mes"
            className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right font-semibold tabular-nums text-slate-900 outline-none focus:border-blue-400" /><span className="text-slate-500">€</span></dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-slate-100 pt-2"><dt className="font-medium text-slate-800">= Para gastar en el ciclo</dt><dd className="font-semibold tabular-nums text-slate-900">{eur(forMonth, 0)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-600">− Ya gastado</dt><dd className="font-semibold tabular-nums text-slate-900">{eur(spent, 0)}</dd></div>
        {extras > 0 && <div className="flex justify-between gap-3"><dt className="text-slate-600">− Extraordinarios</dt><dd className="font-semibold tabular-nums text-slate-900">{eur(extras, 0)}</dd></div>}
      </dl>
      <p className="amount mt-2 text-xs text-slate-400">En tus cuentas hay ahora {eur(data.cash.now, 0)}.</p>

      {drifts.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-medium text-slate-500">Dónde se te está yendo</h3>
          <ul className="mt-1 divide-y divide-slate-100">
            {drifts.map((d) => (
              <li key={d.k} className="flex items-center gap-3 py-3">
                <CategoryIcon category={d.k} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-slate-900">{categoryLabel(d.k)}</span>
                  <span className="amount block truncate text-xs text-amber-700">{eur(d.over, 0)} más de lo normal a estas alturas</span>
                </span>
                <b className="amount shrink-0 text-[15px] font-semibold tabular-nums text-slate-900">{eur(d.now, 0)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-6 text-[11px] text-slate-400">Prueba: no guarda nada. Lo que cobras y lo que quieres ahorrar salen de tus ajustes; los fijos, de lo que la app detecta que se repite.</p>
    </div>
  );
}
