"use client";
// Plan: objetivo de ahorro, límites de gasto, «¿me lo puedo permitir?», ahorro previsto y gastos fijos.
import { useEffect, useState } from "react";
import { Loader2, Pencil, PiggyBank, Plus, Repeat, Target, Trash2 } from "lucide-react";
import type { budgetView } from "@/lib/finance/service";
import { EXPENSE_CATEGORIES, categoryLabel } from "@/lib/finance/categories";
import { card, eur, field, flat, ghost, primary } from "@/components/trading/format";
import { CardHeader, ErrorNote, Modal, Pill, SectionTitle } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { errorText, fapi, refreshFinance, shortDay, useFinance } from "./api";
import { BudgetBar } from "./charts";
import { WhatIfCard } from "./whatif-card";

type View = Awaited<ReturnType<typeof budgetView>>;
type Budget = View["budgets"][number];

function GoalCard({ view }: { view: View }) {
  const [goal, setGoal] = useState(view.settings.savingsGoal?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setGoal(view.settings.savingsGoal?.toString() ?? ""), [view.settings.savingsGoal]);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await fapi("settings", { savingsGoal: goal.trim() === "" ? null : Number(goal.replace(",", ".")) });
      refreshFinance();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const p = view.projection;
  const g = view.settings.savingsGoal;
  return (
    <section className={`${card} ${flat} p-4 sm:p-6`}>
      <SectionTitle icon={Target} tint="emerald" size="base">Objetivo de ahorro por ciclo</SectionTitle>
      <form className="mt-4 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <input inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="P. ej. 500" className={`${field} w-36`} />
        <span className="text-sm text-slate-500">€ cada ciclo</span>
        <button type="submit" disabled={busy} className={ghost}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar</button>
      </form>
      {err && <div className="mt-2"><ErrorNote>{err}</ErrorNote></div>}
      {g !== null && (
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
          <p className="text-slate-700">
            Llevas <b className="tabular-nums">{eur(view.current.net, 2)}</b> ahorrados este ciclo y la previsión es acabar con <b className={`tabular-nums ${p.projectedNet >= g ? "text-emerald-700" : "text-red-700"}`}>{eur(p.projectedNet, 2)}</b>.
          </p>
          <p className="mt-1 text-slate-500">
            {p.projectedNet >= g ? `Cumples el objetivo con ${eur(p.projectedNet - g, 2)} de margen.` : `Te faltarían ${eur(g - p.projectedNet, 2)}: recorta gasto variable o aplaza algo.`}
          </p>
        </div>
      )}
    </section>
  );
}

function BudgetModal({ budget, open, onClose, averages }: { budget: Budget | null; open: boolean; onClose: () => void; averages: Record<string, number | null> }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setName(budget?.name ?? "");
    setAmount(budget?.amount.toString() ?? "");
    setCats(new Set(budget?.categories ?? []));
    setErr(null);
  }, [open, budget]);
  const avg = [...cats].reduce((s, c) => s + (averages[c] ?? 0), 0);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await fapi("budget", { id: budget?.id, name, amount: Number(amount.replace(",", ".")), categories: [...cats] });
      refreshFinance();
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={budget ? "Editar límite" : "Nuevo límite de gasto"}
      subtitle="Un límite por ciclo para un grupo de categorías (sin categorías = todo el gasto)."
      footer={<><button type="button" onClick={onClose} className={ghost}>Cancelar</button><button type="button" onClick={() => void save()} disabled={busy} className={primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar</button></>}
    >
      <div className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block font-medium text-slate-800">Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gastos variables" className={`${field} w-full`} /></label>
          <label className="block"><span className="mb-1.5 block font-medium text-slate-800">Límite por ciclo (€)</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="650" className={`${field} w-full`} /></label>
        </div>
        <div>
          <p className="mb-1.5 font-medium text-slate-800">Categorías</p>
          <div className="flex flex-wrap gap-1.5">
            {EXPENSE_CATEGORIES.map((c) => {
              const on = cats.has(c.key);
              return (
                <button key={c.key} type="button" onClick={() => setCats((s) => { const n = new Set(s); if (on) n.delete(c.key); else n.add(c.key); return n; })} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                  {c.label}
                </button>
              );
            })}
          </div>
          {cats.size > 0 && avg > 0 && <p className="mt-2 text-xs text-slate-500">Media de los últimos ciclos en estas categorías: {eur(avg, 2)}</p>}
        </div>
        {err && <ErrorNote>{err}</ErrorNote>}
      </div>
    </Modal>
  );
}

export function PlanPanel() {
  const { data, error } = useFinance<View>("budget");
  const [editing, setEditing] = useState<Budget | null>(null);
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={8} />;
  const remove = async (b: Budget) => {
    if (!window.confirm(`¿Borrar el límite «${b.name}»?`)) return;
    await fapi("budget/delete", { id: b.id });
    refreshFinance();
  };
  const toggle = async (key: string, cancelled: boolean) => {
    setBusyKey(key);
    try {
      await fapi("recurring", { key, cancelled });
      refreshFinance();
    } finally {
      setBusyKey(null);
    }
  };
  const expenses = data.recurring.filter((r) => r.amount < 0);
  const incomes = data.recurring.filter((r) => r.amount > 0);
  const monthly = expenses.filter((r) => r.active && !r.cancelled).reduce((s, r) => s + Math.abs(r.amount) * (30 / r.intervalDays), 0);
  return (
    <div className="space-y-4 pb-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <GoalCard view={data} />
        <section className={`${card} ${flat}`}>
          <CardHeader actions={<button type="button" onClick={() => { setEditing(null); setOpen(true); }} className={ghost}><Plus className="h-4 w-4" /> Nuevo</button>}>
            <SectionTitle icon={PiggyBank} tint="amber" size="base">Límites de gasto</SectionTitle>
          </CardHeader>
          {data.budgets.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-slate-500">Crea un límite, por ejemplo «Gastos variables: 650 €» con alimentación, restaurantes, ocio y compras.</p>
          ) : (
            <ul className="space-y-5 px-6 pb-6 pt-2">
              {data.budgets.map((b) => (
                <li key={b.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">{b.name}</span>
                      <span className="block truncate text-xs text-slate-500">{b.categories.length ? b.categories.map(categoryLabel).join(", ") : "Todo el gasto"}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="mr-2 tabular-nums text-slate-600"><b className="text-slate-900">{eur(b.spent, 2)}</b> / {eur(b.amount, 2)}</span>
                      <button type="button" onClick={() => { setEditing(b); setOpen(true); }} aria-label="Editar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => void remove(b)} aria-label="Borrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </span>
                  </div>
                  <BudgetBar pct={b.pct} expectedPct={b.expectedPct} status={b.status} />
                  <p className="mt-1 text-xs text-slate-500">
                    {b.remaining >= 0 ? `Quedan ${eur(b.remaining, 2)}` : `Te has pasado ${eur(-b.remaining, 2)}`} · {b.pct.toFixed(0)} % gastado con el {b.expectedPct.toFixed(0)} % del ciclo
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <WhatIfCard />

      <section className={`${card} ${flat}`}>
        <CardHeader divider>
          <SectionTitle icon={Repeat} tint="violet" size="base">Gastos fijos y suscripciones</SectionTitle>
          <span className="text-sm text-slate-500">≈ <b className="tabular-nums text-slate-900">{eur(monthly, 2)}</b> al mes</span>
        </CardHeader>
        {expenses.length === 0 ? <p className="px-6 py-6 text-sm text-slate-500">Aún no se han detectado pagos que se repitan. Con unos meses de movimientos aparecerán aquí.</p> : (
          <ul className="divide-y divide-slate-100">
            {expenses.map((r) => (
              <li key={r.key} className={`flex items-center gap-3 px-4 py-3 sm:px-6 ${r.cancelled || !r.active ? "opacity-60" : ""}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{r.label}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Pill>{categoryLabel(r.category)}</Pill>
                    <span>{r.frequency}</span>
                    <span>{r.cancelled ? "cancelada" : r.active ? `próximo: ${shortDay(r.nextDate)}` : `último: ${shortDay(r.lastDate)}`}</span>
                    {r.previousAmount !== null && Math.abs(r.lastAmount) > Math.abs(r.previousAmount) * 1.05 && <span className="text-red-700">ha subido</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">{eur(Math.abs(r.amount), 2)}</span>
                <button
                  type="button"
                  disabled={busyKey === r.key}
                  onClick={() => void toggle(r.key, !r.cancelled)}
                  className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  title={r.cancelled ? "Volver a contar con este pago" : "Ya no lo pago: no se proyecta más"}
                >
                  {r.cancelled ? "Reactivar" : "La cancelé"}
                </button>
              </li>
            ))}
          </ul>
        )}
        {incomes.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3 text-sm sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cobros periódicos</p>
            <ul className="mt-2 space-y-1.5">
              {incomes.map((r) => (
                <li key={r.key} className="flex justify-between gap-3"><span className="truncate text-slate-700">{r.label} · {r.frequency}</span><span className="shrink-0 font-semibold tabular-nums text-emerald-700">{eur(r.amount, 2)}</span></li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <BudgetModal budget={editing} open={open} onClose={() => setOpen(false)} averages={data.categoryAverages} />
    </div>
  );
}
