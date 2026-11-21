"use client";
// Plan (la hucha): seguimiento. Cómo va el plan del ciclo, cada partida (semana a semana) y la lista de deseos.
// La configuración (ingreso, ahorro, fijos y partidas) se hace en el asistente (plan-wizard.tsx).
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Check, ChevronDown, ExternalLink, Gift, Loader2, Pencil, PiggyBank, Plus, Scale, Settings2, Trash2 } from "lucide-react";
import type { budgetView } from "@/lib/finance/service";
import { categoryLabel } from "@/lib/finance/categories";
import { card, eur, field, flat, ghost, primary } from "@/components/trading/format";
import { CardHeader, ErrorNote, Modal, Pill, SectionTitle } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { errorText, fapi, refreshFinance, shortDay, useFinance } from "./api";
import { BudgetBar } from "./charts";
import { WhatIfCard } from "./whatif-card";
import { PlanWizard, amountText, parseAmount } from "./plan-wizard";

type View = Awaited<ReturnType<typeof budgetView>>;
type Budget = View["budgets"][number];
type Plan = View["plan"];
type Account = Plan["accounts"][number];
type Wish = View["wishlist"][number];
type Week = Plan["weeks"][string][number];
type Movement = Plan["movements"][string][number];

const accountName = (accounts: Account[], id: string | null | undefined) => (id ? accounts.find((a) => a.id === id)?.name ?? "Cuenta" : null);

// ---------------------------------------------------------------------------------------------------------
// Sin plan todavía
// ---------------------------------------------------------------------------------------------------------

function EmptyPlan({ onStart }: { onStart: () => void }) {
  return (
    <section className={`${card} ${flat} flex flex-col items-center px-6 py-12 text-center`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><PiggyBank className="h-6 w-6" /></span>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">Monta tu plan del ciclo</h2>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        En cinco pasos: cuánto ingresas, cuánto quieres ahorrar, tus gastos fijos y tus partidas del día a día. Luego verás cada semana si vas bien y qué mover a cada cuenta al cobrar.
      </p>
      <button type="button" onClick={onStart} className={`${primary} mt-6`}><Settings2 className="h-4 w-4" /> Configurar mi plan</button>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Tu plan del ciclo: cuadre y transferencias
// ---------------------------------------------------------------------------------------------------------

function PlanCard({ plan, onEdit }: { plan: Plan; onEdit: () => void }) {
  const b = plan.balance;
  const rows: { label: string; value: number | null; sign: string }[] = [
    { label: "Ingreso", value: b.income, sign: "" },
    { label: "Gastos fijos", value: b.fixed, sign: "−" },
    { label: "Partidas variables", value: b.variable, sign: "−" },
    { label: "Ahorro", value: b.savings, sign: "−" },
  ];
  const over = b.unassigned !== null && b.unassigned < 0;
  return (
    <section className={`${card} ${flat}`}>
      <CardHeader actions={<button type="button" onClick={onEdit} className={ghost}><Settings2 className="h-4 w-4" /> Editar plan</button>}>
        <SectionTitle icon={Scale} tint="blue" size="base">Tu plan del ciclo <span className="ml-1 text-sm font-normal text-slate-500">{shortDay(plan.cycle.start)} – {shortDay(plan.cycle.end)}</span></SectionTitle>
      </CardHeader>
      <div className="grid gap-6 px-6 pb-6 pt-2 lg:grid-cols-2">
        <dl className="text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-slate-600">{r.label}</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{r.value === null ? "—" : `${r.sign}${eur(r.value, 2)}`}</dd>
            </div>
          ))}
          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-slate-100 pt-2.5">
            <dt className="font-medium text-slate-800">{over ? "Te faltan" : "Sin asignar"}</dt>
            <dd className={`text-base font-bold tabular-nums ${b.unassigned === null ? "text-slate-400" : over ? "text-red-700" : "text-emerald-700"}`}>
              {b.unassigned === null ? "—" : eur(Math.abs(b.unassigned), 2)}
            </dd>
          </div>
          {over && <p className="mt-2 text-xs text-red-700">El plan reparte más de lo que ingresas: edítalo y baja alguna partida o el ahorro.</p>}
        </dl>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Al cobrar, mueve</p>
          {plan.transfers.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No hay transferencias que hacer: todo se paga desde la cuenta donde cobras (o no has elegido cuentas en el plan).</p>
          ) : (
            <ul className="mt-2 space-y-2.5">
              {plan.transfers.map((t) => (
                <li key={t.accountId} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5">
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
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Partidas: ciclo, semana y movimientos (con «extraordinario: no cuenta»)
// ---------------------------------------------------------------------------------------------------------

const WEEK_TONE: Record<Week["status"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cerca: "border-amber-200 bg-amber-50 text-amber-800",
  superado: "border-red-200 bg-red-50 text-red-800",
  previsto: "border-dashed border-slate-200 bg-white text-slate-500",
};

function WeekStrip({ weeks, budget }: { weeks: Week[]; budget: Budget }) {
  const now = weeks.find((w) => w.current);
  const exhausted = budget.remaining <= 0;
  return (
    <div className="mt-3">
      {exhausted ? (
        <p className="text-xs font-medium text-red-700">Partida agotada: te has pasado {eur(-budget.remaining, 2)} este ciclo. Lo que gastes hasta el cobro suma a ese exceso.</p>
      ) : now && (
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
            <span className="block tabular-nums">
              {w.status === "previsto" ? (w.limit > 0 ? `≈ ${eur(w.limit, 2)}` : "sin margen") : w.limit > 0 ? `${eur(w.spent, 2)} / ${eur(w.limit, 2)}` : `${eur(w.spent, 2)} · sin margen`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function MovementRow({ m }: { m: Movement }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await fapi("transaction", { id: m.id, category: m.category, kind: m.kind, extraordinary: !m.extraordinary, applyToSimilar: false });
      refreshFinance();
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={`flex items-center gap-3 py-2 text-sm ${m.extraordinary ? "text-slate-400" : ""}`}>
      <span className="w-12 shrink-0 text-xs text-slate-400">{shortDay(m.date)}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${m.extraordinary ? "line-through" : "text-slate-800"}`}>{m.description}</span>
        <span className="block text-xs text-slate-400">{categoryLabel(m.category)}{m.extraordinary ? " · extraordinario, no cuenta" : ""}</span>
      </span>
      <span className={`shrink-0 tabular-nums ${m.extraordinary ? "line-through" : "font-semibold text-slate-900"}`}>{eur(-m.amount, 2)}</span>
      <button type="button" onClick={() => void toggle()} disabled={busy} className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50" title={m.extraordinary ? "Volver a contarlo en la partida" : "Es puntual (IBI, una avería…): que no cuente en la partida"}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : m.extraordinary ? "Contar" : "Extraordinario"}
      </button>
    </li>
  );
}

function BudgetRow({ b, plan }: { b: Budget; plan: Plan }) {
  const [open, setOpen] = useState(false);
  const weeks = plan.weeks[b.id];
  const pending = plan.unclassified[b.id];
  const movements = plan.movements[b.id] ?? [];
  const account = accountName(plan.accounts, b.accountId);
  const excluded = movements.filter((m) => m.extraordinary).length;
  return (
    <li className="px-4 py-4 sm:px-6">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-slate-800">{b.name}</span>
            <Pill color={b.kind === "fijo" ? "violet" : "blue"}>{b.kind === "fijo" ? "Fija" : "Variable"}</Pill>
          </span>
          <span className="block truncate text-xs text-slate-500">{account ? `${account} · ` : ""}{b.categories.map(categoryLabel).join(", ") || "Todo el gasto"}</span>
        </span>
        <span className="shrink-0 tabular-nums text-slate-600"><b className="text-slate-900">{eur(b.spent, 2)}</b> / {eur(b.amount, 2)}</span>
      </div>
      <BudgetBar pct={b.pct} expectedPct={b.expectedPct} status={b.status} />
      <p className="mt-1 text-xs text-slate-500">
        {b.remaining >= 0 ? `Quedan ${eur(b.remaining, 2)}` : `Te has pasado ${eur(-b.remaining, 2)}`} · {b.pct.toFixed(0)} % gastado con el {b.expectedPct.toFixed(0)} % del ciclo
      </p>
      {pending && pending.count > 0 && (
        <p className="mt-1 text-xs text-amber-700">{pending.count} {pending.count === 1 ? "movimiento" : "movimientos"} sin clasificar en {account} ({eur(pending.amount, 2)}): clasifícalos en Movimientos para que cuenten donde toca.</p>
      )}
      {b.kind !== "fijo" && weeks && <WeekStrip weeks={weeks} budget={b} />}
      <button type="button" onClick={() => setOpen(!open)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "Ocultar movimientos" : `Ver movimientos (${movements.length})`}{excluded > 0 ? ` · ${excluded} extraordinario${excluded === 1 ? "" : "s"} sin contar` : ""}
      </button>
      {open && (
        movements.length === 0
          ? <p className="mt-2 text-xs text-slate-500">Sin movimientos este ciclo.</p>
          : <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto">{movements.map((m) => <MovementRow key={m.id} m={m} />)}</ul>
      )}
    </li>
  );
}

function BudgetsCard({ view, onEdit }: { view: View; onEdit: () => void }) {
  const ordered = [...view.budgets].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "fijo" ? 1 : -1));
  return (
    <section className={`${card} ${flat}`}>
      <CardHeader actions={<button type="button" onClick={onEdit} className={ghost}><Pencil className="h-4 w-4" /> Cambiar</button>}>
        <SectionTitle icon={PiggyBank} tint="amber" size="base">Partidas</SectionTitle>
      </CardHeader>
      {ordered.length === 0
        ? <p className="px-6 pb-6 text-sm text-slate-500">Aún no tienes partidas. Créalas en «Editar plan».</p>
        : <ul className="divide-y divide-slate-100">{ordered.map((b) => <BudgetRow key={b.id} b={b} plan={view.plan} />)}</ul>}
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setTitle(wish?.title ?? "");
    setPrice(amountText(wish?.price));
    setSaved(wish && wish.saved > 0 ? amountText(wish.saved) : "");
    setUrl(wish?.url ?? "");
    setPriority(wish?.priority ?? 2);
    setErr(null);
  }, [open, wish]);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await fapi("wishlist", { id: wish?.id, title, price: parseAmount(price), saved: saved.trim() === "" ? 0 : parseAmount(saved), url, priority });
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
  const [wizard, setWizard] = useState(false);
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={8} />;
  const configured = data.budgets.length > 0;
  return (
    <div className="space-y-4 pb-4">
      {configured ? (
        <>
          <PlanCard plan={data.plan} onEdit={() => setWizard(true)} />
          <div className="grid gap-4 lg:grid-cols-2">
            <BudgetsCard view={data} onEdit={() => setWizard(true)} />
            <WishlistCard wishlist={data.wishlist} safeToSpend={data.projection.safeToSpend} />
          </div>
          <WhatIfCard />
        </>
      ) : (
        <EmptyPlan onStart={() => setWizard(true)} />
      )}
      <PlanWizard view={data} open={wizard} onClose={() => setWizard(false)} />
    </div>
  );
}
