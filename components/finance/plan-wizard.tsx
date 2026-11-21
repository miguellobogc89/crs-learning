"use client";
// Asistente «Configurar plan»: ingreso → ahorro → gastos fijos → partidas variables → resumen. Todo se guarda de una
// vez al final (plan/save). Nada viene configurado: solo se proponen los datos detectados en los movimientos.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2 } from "lucide-react";
import type { budgetView } from "@/lib/finance/service";
import { fixedPartidas, type FixedDraft } from "@/lib/finance/plan";
import { EXPENSE_CATEGORIES, categoryLabel } from "@/lib/finance/categories";
import { eur, field, ghost, primary } from "@/components/trading/format";
import { ErrorNote, Modal } from "@/components/trading/ui";
import { errorText, fapi, refreshFinance } from "./api";

type View = Awaited<ReturnType<typeof budgetView>>;
type Account = View["plan"]["accounts"][number];
type VariableDraft = { id: string | null; name: string; amount: string; categories: string[]; accountId: string };
type FixedRow = FixedDraft & { id: string | null; amountText: string };

const STEPS = ["Ingreso", "Ahorro", "Gastos fijos", "Partidas", "Resumen"] as const;

/** «1.234,56», «1234,56» o «1234.56». */
export const parseAmount = (v: string) => {
  const t = v.trim().replace(/\s|€/g, "");
  if (!t) return NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};
export const amountText = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

function AccountSelect({ value, onChange, accounts, empty }: { value: string; onChange: (v: string) => void; accounts: Account[]; empty: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${field} w-full`}>
      <option value="">{empty}</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.last4 ? ` ···${a.last4}` : ""}</option>)}
    </select>
  );
}

function Label({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-medium text-slate-800">{title}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function PlanWizard({ view, open, onClose }: { view: View; open: boolean; onClose: () => void }) {
  const { plan } = view;
  const accounts = plan.accounts;
  const nameOf = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? "Cuenta" : "sin cuenta");
  const expenses = useMemo(() => view.recurring.filter((r) => r.amount < 0 && r.active && !r.cancelled), [view.recurring]);

  const [step, setStep] = useState(0);
  const [income, setIncome] = useState("");
  const [incomeAccount, setIncomeAccount] = useState("");
  const [goal, setGoal] = useState("");
  const [savingsAccount, setSavingsAccount] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [fixed, setFixed] = useState<FixedRow[]>([]);
  const [variables, setVariables] = useState<VariableDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Al abrir: el plan guardado o, si no hay, lo detectado (sin partidas inventadas).
  useEffect(() => {
    if (!open) return;
    const b = plan.balance;
    setStep(0);
    setErr(null);
    setIncome(amountText(b.income));
    setIncomeAccount(plan.incomeAccountId ?? "");
    setGoal(amountText(view.settings.savingsGoal));
    setSavingsAccount(plan.savingsAccountId ?? "");
    const savedFixed = view.budgets.filter((x) => x.kind === "fijo");
    const keys = savedFixed.flatMap((x) => x.recurringKeys ?? []);
    setPicked(new Set(keys.length ? keys : savedFixed.length ? [] : expenses.map((r) => r.key)));
    setFixed(savedFixed.map((x) => ({ id: x.id, name: x.name, amount: x.amount, amountText: amountText(x.amount), categories: x.categories, accountId: x.accountId ?? null, recurringKeys: x.recurringKeys ?? [] })));
    setVariables(view.budgets.filter((x) => x.kind !== "fijo").map((x) => ({ id: x.id, name: x.name, amount: amountText(x.amount), categories: x.categories, accountId: x.accountId ?? "" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Recalcula las partidas fijas desde los recibos marcados, conservando el id y el nombre de la de cada cuenta. */
  const rebuildFixed = (keys: Set<string>) => {
    const drafts = fixedPartidas(expenses.filter((r) => keys.has(r.key)).map((r) => ({ key: r.key, label: r.label, category: r.category, monthly: r.monthly, accountId: r.accountId })), nameOf);
    setFixed((prev) => drafts.map((d) => {
      const old = prev.find((p) => p.accountId === d.accountId);
      return { ...d, id: old?.id ?? null, name: old?.name ?? d.name, amountText: amountText(d.amount) };
    }));
  };
  const toggleRecurring = (key: string) => {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
    rebuildFixed(next);
  };

  const fixedCats = new Set(fixed.flatMap((f) => f.categories));
  const catOwner = (cat: string, self: number) => fixed.some((f) => f.categories.includes(cat)) ? "fijos" : variables.findIndex((v, i) => i !== self && v.categories.includes(cat)) >= 0 ? "otra" : null;

  const incomeN = parseAmount(income);
  const goalN = goal.trim() === "" ? 0 : parseAmount(goal);
  const fixedSum = fixed.reduce((s, f) => s + (parseAmount(f.amountText) || 0), 0);
  const varSum = variables.reduce((s, v) => s + (parseAmount(v.amount) || 0), 0);
  const left = Number.isFinite(incomeN) ? Math.round((incomeN - fixedSum - varSum - (goalN || 0)) * 100) / 100 : null;

  const transfers = useMemo(() => {
    const map = new Map<string, { amount: number; items: string[] }>();
    const add = (id: string | null, amount: number, label: string) => {
      if (!id || id === incomeAccount || !(amount > 0)) return;
      const t = map.get(id) ?? { amount: 0, items: [] };
      t.amount += amount;
      t.items.push(label);
      map.set(id, t);
    };
    fixed.forEach((f) => add(f.accountId, parseAmount(f.amountText), f.name));
    variables.forEach((v) => add(v.accountId || null, parseAmount(v.amount), v.name || "Partida"));
    add(savingsAccount || null, goalN, "Ahorro");
    return [...map.entries()].map(([id, t]) => ({ id, ...t }));
  }, [fixed, variables, savingsAccount, goalN, incomeAccount]);

  const problem = (() => {
    if (step === 0 && !(incomeN > 0)) return "Indica cuánto ingresas en un ciclo.";
    if (step === 1 && goal.trim() !== "" && !(goalN >= 0)) return "El ahorro no es un importe válido.";
    if (step === 2 && fixed.some((f) => !(parseAmount(f.amountText) > 0) || !f.name.trim())) return "Cada partida fija necesita nombre e importe.";
    if (step === 3 && variables.some((v) => !v.name.trim() || !(parseAmount(v.amount) > 0))) return "Cada partida necesita nombre e importe.";
    if (step === 3 && variables.some((v) => v.categories.length === 0)) return "Cada partida necesita al menos una categoría.";
    return null;
  })();

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await fapi("plan/save", {
        expectedIncome: plan.detectedIncome !== null && Math.abs(incomeN - plan.detectedIncome) < 0.01 ? null : incomeN,
        incomeAccountId: incomeAccount || null,
        savingsGoal: goal.trim() === "" ? null : goalN,
        savingsAccountId: savingsAccount || null,
        budgets: [
          ...fixed.map((f) => ({ id: f.id, name: f.name, amount: parseAmount(f.amountText), kind: "fijo", categories: f.categories, accountId: f.accountId, recurringKeys: f.recurringKeys })),
          ...variables.map((v) => ({ id: v.id, name: v.name, amount: parseAmount(v.amount), kind: "variable", categories: v.categories, accountId: v.accountId || null })),
        ],
      });
      refreshFinance();
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const setVar = (i: number, patch: Partial<VariableDraft>) => setVariables((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const last = step === STEPS.length - 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title="Configurar tu plan"
      subtitle={
        <span className="flex flex-wrap gap-1.5 pt-1">
          {STEPS.map((s, i) => (
            <button key={s} type="button" onClick={() => i < step && setStep(i)} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${i === step ? "bg-blue-600 text-white" : i < step ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : "bg-slate-100 text-slate-400"}`}>
              {i + 1}. {s}
            </button>
          ))}
        </span>
      }
      footer={
        <>
          {step > 0 ? <button type="button" onClick={() => setStep(step - 1)} className={ghost}><ArrowLeft className="h-4 w-4" /> Atrás</button> : <button type="button" onClick={onClose} className={ghost}>Cancelar</button>}
          {last
            ? <button type="button" onClick={() => void save()} disabled={busy} className={primary}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar plan</button>
            : <button type="button" onClick={() => { setErr(null); if (problem) setErr(problem); else setStep(step + 1); }} className={primary}>Siguiente <ArrowRight className="h-4 w-4" /></button>}
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {step === 0 && (
          <>
            <p className="text-slate-600">Lo que entra en tu cuenta cada ciclo (nómina u otros ingresos fijos).</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Label title="Ingreso del ciclo (€)" hint={plan.detectedIncome !== null ? `Detectado en tus últimos ciclos: ${eur(plan.detectedIncome, 2)}` : "No se ha podido detectar: escríbelo tú."}>
                <input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} className={`${field} w-full`} />
              </Label>
              <Label title="Cuenta donde cobras" hint="Desde aquí se reparte el dinero al resto de cuentas.">
                <AccountSelect value={incomeAccount} onChange={setIncomeAccount} accounts={accounts} empty="Elige una cuenta" />
              </Label>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-slate-600">Lo que quieres apartar cada ciclo. Déjalo vacío si de momento no quieres un objetivo.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Label title="Ahorro por ciclo (€)"><input inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="0,00" className={`${field} w-full`} /></Label>
              <Label title="Cuenta de ahorro" hint="Se propondrá como transferencia el día de cobro."><AccountSelect value={savingsAccount} onChange={setSavingsAccount} accounts={accounts} empty="Sin cuenta de ahorro" /></Label>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-slate-600">
              Estos son los recibos que se repiten en tus movimientos. Marca los que son gastos fijos de verdad. Se agrupan en una partida fija por cada cuenta que los paga.
              Lo puntual (IBI, una avería, una multa…) no va aquí: márcalo como extraordinario desde la partida y no contará.
            </p>
            {expenses.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-slate-500">Aún no se detectan recibos que se repitan.</p> : (
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
                {expenses.map((r) => (
                  <li key={r.key}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                      <input type="checkbox" checked={picked.has(r.key)} onChange={() => toggleRecurring(r.key)} className="h-4 w-4 rounded border-slate-300" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">{r.label}</span>
                        <span className="block truncate text-xs text-slate-500">{categoryLabel(r.category)} · {r.frequency} · {nameOf(r.accountId)}</span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="block font-semibold text-slate-900">{eur(r.monthly, 2)}</span>
                        <span className="block text-[11px] text-slate-400">al mes</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {fixed.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Tus partidas fijas</p>
                <ul className="space-y-2">
                  {fixed.map((f, i) => (
                    <li key={f.accountId ?? `none-${i}`} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_8rem]">
                      <div>
                        <input value={f.name} onChange={(e) => setFixed((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={`${field} w-full`} />
                        <p className="mt-1 text-xs text-slate-500">Paga: {nameOf(f.accountId)} · {f.categories.map(categoryLabel).join(", ")}</p>
                      </div>
                      <input inputMode="decimal" value={f.amountText} onChange={(e) => setFixed((xs) => xs.map((x, j) => (j === i ? { ...x, amountText: e.target.value } : x)))} className={`${field} w-full text-right tabular-nums`} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-slate-600">Tu dinero para el día a día (ocio, comida, compras…). Cada partida cuenta el gasto de sus categorías, lo pagues con la tarjeta que lo pagues, y te dice cuánto te queda cada semana.</p>
            {variables.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-slate-500">Aún no tienes partidas. Añade la primera.</p>}
            <ul className="space-y-3">
              {variables.map((v, i) => (
                <li key={v.id ?? `new-${i}`} className="rounded-xl border border-slate-100 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_8rem_12rem_auto]">
                    <input value={v.name} onChange={(e) => setVar(i, { name: e.target.value })} placeholder="Nombre (p. ej. Ocio)" className={`${field} w-full`} />
                    <input inputMode="decimal" value={v.amount} onChange={(e) => setVar(i, { amount: e.target.value })} placeholder="€ por ciclo" className={`${field} w-full text-right tabular-nums`} />
                    <AccountSelect value={v.accountId} onChange={(id) => setVar(i, { accountId: id })} accounts={accounts} empty="Cuenta que la paga" />
                    <button type="button" onClick={() => setVariables((vs) => vs.filter((_, j) => j !== i))} aria-label="Quitar" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {EXPENSE_CATEGORIES.map((c) => {
                      const on = v.categories.includes(c.key);
                      const owner = on ? null : catOwner(c.key, i);
                      return (
                        <button
                          key={c.key}
                          type="button"
                          disabled={!!owner}
                          title={owner === "fijos" ? "Ya está en tus gastos fijos" : owner ? "Ya está en otra partida" : undefined}
                          onClick={() => setVar(i, { categories: on ? v.categories.filter((x) => x !== c.key) : [...v.categories, c.key] })}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? "border-blue-600 bg-blue-600 text-white" : owner ? "cursor-not-allowed border-slate-100 text-slate-300" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  {v.categories.length === 0 && <p className="mt-1.5 text-xs text-amber-700">Elige al menos una categoría.</p>}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setVariables((vs) => [...vs, { id: null, name: "", amount: "", categories: [], accountId: "" }])} className={ghost}><Plus className="h-4 w-4" /> Añadir partida</button>
            {fixedCats.size > 0 && <p className="text-xs text-slate-500">Las categorías en gris ya están en tus gastos fijos o en otra partida: así ningún gasto cuenta dos veces.</p>}
          </>
        )}

        {step === 4 && (
          <div className="grid gap-6 sm:grid-cols-2">
            <dl>
              {[
                ["Ingreso", incomeN],
                ["Gastos fijos", -fixedSum],
                ["Partidas variables", -varSum],
                ["Ahorro", -(goalN || 0)],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-3 py-1.5"><dt className="text-slate-600">{label}</dt><dd className="font-semibold tabular-nums text-slate-900">{eur(value as number, 2)}</dd></div>
              ))}
              <div className="mt-1 flex justify-between gap-3 border-t border-slate-100 pt-2.5">
                <dt className="font-medium text-slate-800">{left !== null && left < 0 ? "Te faltan" : "Sin asignar"}</dt>
                <dd className={`text-base font-bold tabular-nums ${left !== null && left < 0 ? "text-red-700" : "text-emerald-700"}`}>{left === null ? "—" : eur(Math.abs(left), 2)}</dd>
              </div>
              {left !== null && left < 0 && <p className="mt-2 text-xs text-red-700">Repartes más de lo que ingresas. Vuelve atrás y baja alguna partida o el ahorro.</p>}
              {left !== null && left > 0 && <p className="mt-2 text-xs text-slate-500">Lo que quede sin asignar se queda disponible en tus cuentas.</p>}
            </dl>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Al cobrar, mueve</p>
              {transfers.length === 0 ? <p className="mt-2 text-slate-500">No hay transferencias: todo se paga desde la cuenta donde cobras o no has elegido cuentas.</p> : (
                <ul className="mt-2 space-y-2">
                  {transfers.map((t) => (
                    <li key={t.id}>
                      <div className="flex justify-between gap-3"><span className="truncate font-medium text-slate-900">{nameOf(t.id)}</span><span className="shrink-0 font-semibold tabular-nums">{eur(t.amount, 2)}</span></div>
                      <p className="truncate text-xs text-slate-500">{t.items.join(" · ")}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {err && <ErrorNote>{err}</ErrorNote>}
      </div>
    </Modal>
  );
}
