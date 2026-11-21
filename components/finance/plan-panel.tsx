"use client";
// Plan (la hucha): cuadre del ciclo y transferencias del día de cobro, objetivo de ahorro, partidas con su límite
// semanal, lista de deseos, «¿me lo puedo permitir?» y gastos fijos. Todo lo decide el usuario: partidas,
// importes, categorías y cuenta que paga cada una.
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Check, ExternalLink, Gift, Loader2, Pencil, PiggyBank, Plus, Repeat, Scale, Target, Trash2 } from "lucide-react";
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
type Plan = View["plan"];
type Account = Plan["accounts"][number];
type Wish = View["wishlist"][number];
type Week = Plan["weeks"][string][number];

/** «1.234,56», «1234,56» o «1234.56». */
const parseAmount = (v: string) => {
  const t = v.trim().replace(/\s|€/g, "");
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};
const amountText = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
const accountName = (accounts: Account[], id: string | null | undefined) => (id ? accounts.find((a) => a.id === id)?.name ?? "Cuenta" : null);

function useSave() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      refreshFinance();
      after?.();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, run, setErr };
}

function AccountSelect({ value, onChange, accounts, empty }: { value: string; onChange: (v: string) => void; accounts: Account[]; empty: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${field} w-full`}>
      <option value="">{empty}</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.last4 ? ` ···${a.last4}` : ""}</option>)}
    </select>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Tu plan del ciclo: cuadre y transferencias
// ---------------------------------------------------------------------------------------------------------

function PlanSettingsModal({ plan, open, onClose }: { plan: Plan; open: boolean; onClose: () => void }) {
  const [income, setIncome] = useState("");
  const [incomeAccount, setIncomeAccount] = useState("");
  const [savingsAccount, setSavingsAccount] = useState("");
  const { busy, err, run, setErr } = useSave();
  useEffect(() => {
    if (!open) return;
    setIncome(plan.balance.incomeSource === "manual" ? amountText(plan.balance.income) : "");
    setIncomeAccount(plan.incomeAccountDetected ? "" : plan.incomeAccountId ?? "");
    setSavingsAccount(plan.savingsAccountId ?? "");
    setErr(null);
  }, [open, plan, setErr]);
  const save = () => run(() => fapi("settings", {
    expectedIncome: income.trim() === "" ? null : parseAmount(income),
    incomeAccountId: incomeAccount || null,
    savingsAccountId: savingsAccount || null,
  }), onClose);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ingreso y cuentas del plan"
      subtitle="Deja un campo vacío para usar lo que se detecta en tus movimientos."
      footer={<><button type="button" onClick={onClose} className={ghost}>Cancelar</button><button type="button" onClick={() => void save()} disabled={busy} className={primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar</button></>}
    >
      <div className="space-y-4 text-sm">
        <label className="block">
          <span className="mb-1.5 block font-medium text-slate-800">Ingreso del ciclo (€)</span>
          <input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} placeholder={plan.detectedIncome !== null ? `Detectado: ${eur(plan.detectedIncome, 2)}` : "P. ej. 2.000"} className={`${field} w-full`} />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-medium text-slate-800">Cuenta donde cobras</span>
          <AccountSelect value={incomeAccount} onChange={setIncomeAccount} accounts={plan.accounts} empty={plan.incomeAccountDetected && plan.incomeAccountId ? `Detectada: ${accountName(plan.accounts, plan.incomeAccountId)}` : "Detectar automáticamente"} />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-medium text-slate-800">Cuenta de ahorro</span>
          <AccountSelect value={savingsAccount} onChange={setSavingsAccount} accounts={plan.accounts} empty="Sin cuenta de ahorro" />
          <span className="mt-1 block text-xs text-slate-500">El objetivo de ahorro se propone como transferencia a esta cuenta.</span>
        </label>
        {err && <ErrorNote>{err}</ErrorNote>}
      </div>
    </Modal>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false);
  const b = plan.balance;
  const rows: { label: string; value: number | null; hint?: string; sign: string }[] = [
    { label: "Ingreso", value: b.income, hint: b.incomeSource === "detectado" ? "detectado" : b.incomeSource === "manual" ? "fijado por ti" : undefined, sign: "" },
    { label: "Gastos fijos", value: b.fixed, hint: b.fixedSource === "detectado" ? "recibos detectados" : "partidas fijas", sign: "−" },
    { label: "Partidas variables", value: b.variable, sign: "−" },
    { label: "Ahorro", value: b.savings, sign: "−" },
  ];
  const over = b.unassigned !== null && b.unassigned < 0;
  return (
    <section className={`${card} ${flat}`}>
      <CardHeader actions={<button type="button" onClick={() => setOpen(true)} className={ghost}><Pencil className="h-4 w-4" /> Ingreso y cuentas</button>}>
        <SectionTitle icon={Scale} tint="blue" size="base">Tu plan del ciclo <span className="ml-1 text-sm font-normal text-slate-500">{shortDay(plan.cycle.start)} – {shortDay(plan.cycle.end)}</span></SectionTitle>
      </CardHeader>
      <div className="grid gap-6 px-6 pb-6 pt-2 lg:grid-cols-2">
        <dl className="text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-slate-600">{r.label}{r.hint && <span className="ml-1.5 text-xs text-slate-400">{r.hint}</span>}</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{r.value === null ? "—" : `${r.sign}${eur(r.value, 2)}`}</dd>
            </div>
          ))}
          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-slate-100 pt-2.5">
            <dt className="font-medium text-slate-800">{over ? "Te faltan" : "Sin asignar"}</dt>
            <dd className={`text-base font-bold tabular-nums ${b.unassigned === null ? "text-slate-400" : over ? "text-red-700" : "text-emerald-700"}`}>
              {b.unassigned === null ? "—" : eur(Math.abs(b.unassigned), 2)}
            </dd>
          </div>
          {b.income === null && <p className="mt-2 text-xs text-slate-500">Aún no se detecta tu ingreso habitual. Fíjalo en «Ingreso y cuentas».</p>}
          {over && <p className="mt-2 text-xs text-red-700">El plan reparte más de lo que ingresas: baja alguna partida o el ahorro.</p>}
        </dl>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Al cobrar, mueve</p>
          {plan.transfers.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Asigna a cada partida la cuenta que la paga (y elige tu cuenta de ahorro) para ver aquí qué transferir el día de cobro.</p>
          ) : (
            <ul className="mt-2 space-y-2.5">
              {plan.transfers.map((t) => (
                <li key={t.accountId} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5 text-slate-700">
                      <span className="truncate text-slate-500">{accountName(plan.accounts, plan.incomeAccountId) ?? "Tu cuenta de cobro"}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate font-medium text-slate-900">{accountName(plan.accounts, t.accountId)}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">{eur(t.amount, 2)}</span>
                  </div>
                  <div className="mt-0.5 flex justify-between gap-3 text-xs text-slate-500">
                    <span className="truncate">{t.items.join(" · ")}</span>
                    <span className={`shrink-0 ${t.pending === 0 ? "text-emerald-700" : ""}`}>
                      {t.pending === 0 ? <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> hecho</span> : t.done > 0 ? `faltan ${eur(t.pending, 2)}` : "pendiente"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <PlanSettingsModal plan={plan} open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Objetivo de ahorro
// ---------------------------------------------------------------------------------------------------------

function GoalCard({ view }: { view: View }) {
  const [goal, setGoal] = useState(amountText(view.settings.savingsGoal));
  const { busy, err, run } = useSave();
  useEffect(() => setGoal(amountText(view.settings.savingsGoal)), [view.settings.savingsGoal]);
  const save = () => run(() => fapi("settings", { savingsGoal: goal.trim() === "" ? null : parseAmount(goal) }));
  const p = view.projection;
  const g = view.projection.savingsGoal;
  return (
    <section className={`${card} ${flat} p-4 sm:p-6`}>
      <SectionTitle icon={Target} tint="emerald" size="base">Objetivo de ahorro</SectionTitle>
      <form className="mt-4 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <input inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="P. ej. 500" className={`${field} w-36`} />
        <span className="text-sm text-slate-500">€ {view.settings.savingsFrequency === "semanal" ? "por semana" : "por ciclo"}</span>
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

// ---------------------------------------------------------------------------------------------------------
// Partidas (límites) con su semana
// ---------------------------------------------------------------------------------------------------------

function BudgetModal({ budget, open, onClose, averages, accounts }: { budget: Budget | null; open: boolean; onClose: () => void; averages: Record<string, number | null>; accounts: Account[] }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"fijo" | "variable">("variable");
  const [accountId, setAccountId] = useState("");
  const [cats, setCats] = useState<Set<string>>(new Set());
  const { busy, err, run, setErr } = useSave();
  useEffect(() => {
    if (!open) return;
    setName(budget?.name ?? "");
    setAmount(amountText(budget?.amount));
    setKind(budget?.kind === "fijo" ? "fijo" : "variable");
    setAccountId(budget?.accountId ?? "");
    setCats(new Set(budget?.categories ?? []));
    setErr(null);
  }, [open, budget, setErr]);
  const avg = [...cats].reduce((s, c) => s + (averages[c] ?? 0), 0);
  const save = () => run(() => fapi("budget", { id: budget?.id, name, amount: parseAmount(amount), kind, accountId: accountId || null, categories: [...cats] }), onClose);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={budget ? "Editar partida" : "Nueva partida"}
      subtitle="Cuenta el gasto de sus categorías, lo pagues con la tarjeta que lo pagues (sin categorías = todo el gasto)."
      footer={<><button type="button" onClick={onClose} className={ghost}>Cancelar</button><button type="button" onClick={() => void save()} disabled={busy} className={primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar</button></>}
    >
      <div className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block font-medium text-slate-800">Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ocio" className={`${field} w-full`} /></label>
          <label className="block"><span className="mb-1.5 block font-medium text-slate-800">Importe por ciclo (€)</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className={`${field} w-full`} /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 font-medium text-slate-800">Tipo</p>
            <div className="inline-flex rounded-xl border border-slate-200 p-0.5">
              {(["variable", "fijo"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${kind === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                  {k === "variable" ? "Variable (con semana)" : "Fijo"}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block font-medium text-slate-800">Cuenta que la paga</span>
            <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} empty="Sin cuenta asignada" />
          </label>
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

const WEEK_TONE: Record<Week["status"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cerca: "border-amber-200 bg-amber-50 text-amber-800",
  superado: "border-red-200 bg-red-50 text-red-800",
  previsto: "border-dashed border-slate-200 bg-white text-slate-500",
};

function WeekStrip({ weeks }: { weeks: Week[] }) {
  const now = weeks.find((w) => w.current);
  return (
    <div className="mt-3">
      {now && (
        <p className="text-xs text-slate-600">
          <CalendarDays className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-slate-400" />
          Esta semana: <b className="tabular-nums text-slate-900">{eur(now.spent, 2)}</b> de <span className="tabular-nums">{eur(now.limit, 2)}</span>
          {" · "}
          <span className={now.remaining >= 0 ? "text-emerald-700" : "text-red-700"}>{now.remaining >= 0 ? `te quedan ${eur(now.remaining, 2)}` : `te has pasado ${eur(-now.remaining, 2)}`}</span>
        </p>
      )}
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {weeks.map((w) => (
          <span key={w.start} className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] leading-tight ${WEEK_TONE[w.status]} ${w.current ? "ring-2 ring-blue-200" : ""}`} title={`${shortDay(w.start)} – ${shortDay(w.end)}`}>
            <span className="block font-medium">{shortDay(w.start)}</span>
            <span className="block tabular-nums">{w.status === "previsto" ? `≈ ${eur(w.limit, 2)}` : `${eur(w.spent, 2)} / ${eur(w.limit, 2)}`}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function BudgetsCard({ view, onEdit }: { view: View; onEdit: (b: Budget | null) => void }) {
  const { plan } = view;
  const remove = async (b: Budget) => {
    if (!window.confirm(`¿Borrar la partida «${b.name}»?`)) return;
    await fapi("budget/delete", { id: b.id });
    refreshFinance();
  };
  return (
    <section className={`${card} ${flat}`}>
      <CardHeader actions={<button type="button" onClick={() => onEdit(null)} className={ghost}><Plus className="h-4 w-4" /> Nueva</button>}>
        <SectionTitle icon={PiggyBank} tint="amber" size="base">Partidas</SectionTitle>
      </CardHeader>
      {view.budgets.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-slate-500">Crea tus partidas (por ejemplo, ocio, casa, comida…), con su importe, sus categorías y la cuenta que las paga.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {view.budgets.map((b) => {
            const weeks = plan.weeks[b.id];
            const pending = plan.unclassified[b.id];
            const account = accountName(plan.accounts, b.accountId);
            return (
              <li key={b.id} className="px-4 py-4 sm:px-6">
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-800">{b.name}</span>
                      <Pill color={b.kind === "fijo" ? "violet" : "blue"}>{b.kind === "fijo" ? "Fijo" : "Variable"}</Pill>
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {account ? `${account} · ` : ""}{b.categories.length ? b.categories.map(categoryLabel).join(", ") : "Todo el gasto"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="mr-2 tabular-nums text-slate-600"><b className="text-slate-900">{eur(b.spent, 2)}</b> / {eur(b.amount, 2)}</span>
                    <button type="button" onClick={() => onEdit(b)} aria-label="Editar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => void remove(b)} aria-label="Borrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                </div>
                <BudgetBar pct={b.pct} expectedPct={b.expectedPct} status={b.status} />
                <p className="mt-1 text-xs text-slate-500">
                  {b.remaining >= 0 ? `Quedan ${eur(b.remaining, 2)}` : `Te has pasado ${eur(-b.remaining, 2)}`} · {b.pct.toFixed(0)} % gastado con el {b.expectedPct.toFixed(0)} % del ciclo
                </p>
                {pending && pending.count > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    {pending.count} {pending.count === 1 ? "movimiento" : "movimientos"} sin clasificar en {account} ({eur(pending.amount, 2)}): clasifícalos en Movimientos para que cuenten aquí.
                  </p>
                )}
                {weeks && <WeekStrip weeks={weeks} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Lista de deseos
// ---------------------------------------------------------------------------------------------------------

const PRIORITY = { 1: "Alta", 2: "Media", 3: "Baja" } as const;

function WishModal({ wish, open, onClose }: { wish: Wish | null; open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [saved, setSaved] = useState("");
  const [url, setUrl] = useState("");
  const [priority, setPriority] = useState(2);
  const { busy, err, run, setErr } = useSave();
  useEffect(() => {
    if (!open) return;
    setTitle(wish?.title ?? "");
    setPrice(amountText(wish?.price));
    setSaved(wish && wish.saved > 0 ? amountText(wish.saved) : "");
    setUrl(wish?.url ?? "");
    setPriority(wish?.priority ?? 2);
    setErr(null);
  }, [open, wish, setErr]);
  const save = () => run(() => fapi("wishlist", { id: wish?.id, title, price: parseAmount(price), saved: saved.trim() === "" ? 0 : parseAmount(saved), url, priority }), onClose);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={wish ? "Editar deseo" : "Nuevo deseo"}
      footer={<><button type="button" onClick={onClose} className={ghost}>Cancelar</button><button type="button" onClick={() => void save()} disabled={busy} className={primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar</button></>}
    >
      <div className="space-y-4 text-sm">
        <label className="block"><span className="mb-1.5 block font-medium text-slate-800">Qué quieres</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} w-full`} /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="mb-1.5 block font-medium text-slate-800">Precio (€)</span><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" className={`${field} w-full`} /></label>
          <label className="block"><span className="mb-1.5 block font-medium text-slate-800">Ya apartado (€)</span><input inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0,00" className={`${field} w-full`} /></label>
          <label className="block">
            <span className="mb-1.5 block font-medium text-slate-800">Prioridad</span>
            <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} className={`${field} w-full`}>
              {([1, 2, 3] as const).map((p) => <option key={p} value={p}>{PRIORITY[p]}</option>)}
            </select>
          </label>
        </div>
        <label className="block"><span className="mb-1.5 block font-medium text-slate-800">Enlace (opcional)</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={`${field} w-full`} /></label>
        {err && <ErrorNote>{err}</ErrorNote>}
      </div>
    </Modal>
  );
}

function WishlistCard({ wishlist, safeToSpend }: { wishlist: Wish[]; safeToSpend: number | null }) {
  const [editing, setEditing] = useState<Wish | null>(null);
  const [open, setOpen] = useState(false);
  const pendingItems = wishlist.filter((w) => !w.purchasedAt);
  const bought = wishlist.filter((w) => w.purchasedAt);
  const mark = async (w: Wish, purchased: boolean) => {
    await fapi("wishlist", { id: w.id, title: w.title, price: w.price, saved: w.saved, url: w.url ?? "", priority: w.priority, purchased });
    refreshFinance();
  };
  const remove = async (w: Wish) => {
    if (!window.confirm(`¿Borrar «${w.title}» de tus deseos?`)) return;
    await fapi("wishlist/delete", { id: w.id });
    refreshFinance();
  };
  return (
    <section className={`${card} ${flat}`}>
      <CardHeader actions={<button type="button" onClick={() => { setEditing(null); setOpen(true); }} className={ghost}><Plus className="h-4 w-4" /> Añadir</button>}>
        <SectionTitle icon={Gift} tint="violet" size="base">Lista de deseos</SectionTitle>
        {safeToSpend !== null && pendingItems.length > 0 && <span className="text-sm text-slate-500">Disponible sin tocar el ahorro: <b className="tabular-nums text-slate-900">{eur(Math.max(0, safeToSpend), 2)}</b></span>}
      </CardHeader>
      {wishlist.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-slate-500">Apunta lo que te quieres comprar y te diremos cuándo te lo puedes permitir sin romper el plan.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {[...pendingItems, ...bought].map((w) => (
            <li key={w.id} className={`flex items-center gap-3 px-4 py-3 sm:px-6 ${w.purchasedAt ? "opacity-60" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <span className={`truncate ${w.purchasedAt ? "line-through" : ""}`}>{w.title}</span>
                  {w.url && <a href={w.url} target="_blank" rel="noreferrer" className="shrink-0 text-slate-400 hover:text-blue-600" aria-label="Abrir enlace"><ExternalLink className="h-3.5 w-3.5" /></a>}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Pill color={w.priority === 1 ? "rose" : w.priority === 2 ? "amber" : "slate"}>{PRIORITY[w.priority as 1 | 2 | 3] ?? "Media"}</Pill>
                  {w.purchasedAt ? <span>comprado el {shortDay(w.purchasedAt.slice(0, 10))}</span> : w.affordableNow ? <span className="font-medium text-emerald-700">te lo puedes permitir ya</span> : <span>faltan {eur(w.missing, 2)}</span>}
                  {!w.purchasedAt && w.saved > 0 && <span>{w.progress.toFixed(0)} % apartado</span>}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">{eur(w.price, 2)}</span>
              <span className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => void mark(w, !w.purchasedAt)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">{w.purchasedAt ? "Deshacer" : "Comprado"}</button>
                <button type="button" onClick={() => { setEditing(w); setOpen(true); }} aria-label="Editar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => void remove(w)} aria-label="Borrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <WishModal wish={editing} open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------------------------------------

export function PlanPanel() {
  const { data, error } = useFinance<View>("budget");
  const [editing, setEditing] = useState<Budget | null>(null);
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={8} />;
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
      <PlanCard plan={data.plan} />
      <div className="grid gap-4 lg:grid-cols-2">
        <BudgetsCard view={data} onEdit={(b) => { setEditing(b); setOpen(true); }} />
        <div className="space-y-4">
          <GoalCard view={data} />
          <WishlistCard wishlist={data.wishlist} safeToSpend={data.projection.safeToSpend} />
        </div>
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
      <BudgetModal budget={editing} open={open} onClose={() => setOpen(false)} averages={data.categoryAverages} accounts={data.plan.accounts} />
    </div>
  );
}
