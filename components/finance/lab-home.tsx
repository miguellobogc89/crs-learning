"use client";
// Laboratorio · propuesta de Inicio (mockup con datos reales; no sustituye a Inicio hasta decidirlo).
// 1. Evolución del ciclo: saldo día a día con el tramo previsto hasta fin de ciclo y lo que se viene.
// 2. En qué se va el dinero, por grupos de Mi plan: barras horizontales; al tocar un grupo se despliegan sus
//    categorías con el mismo gráfico, y al tocar una categoría se abre su detalle (pantalla con «volver»).
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { overview } from "@/lib/finance/service";
import { categoryHex, categoryLabel } from "@/lib/finance/categories";
import { card, eur, flat } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList, SkeletonStats } from "@/components/trading/skeletons";
import { shortDay, useFinance } from "./api";
import { BalanceLine } from "./charts";
import { CategoryIcon } from "./category-icon";

type Overview = Awaited<ReturnType<typeof overview>>;
type Plan = {
  hasData: boolean;
  cycle: { start: string; end: string; label: string; day: number; totalDays: number };
  previous: { start: string; end: string } | null;
  groups: { id: string; name: string; categories: string[]; goal: number | null }[];
  totals: { now: Record<string, number>; before: Record<string, number> };
};
type Bar = { key: string; label: string; amount: number; prev: number | null; color: string; icon?: string };

const sumOf = (r: Record<string, number>, cats: string[]) => cats.reduce((s, c) => s + (r[c] ?? 0), 0);

function Delta({ now, prev }: { now: number; prev: number | null }) {
  if (prev === null || prev <= 0) return null;
  const d = ((now - prev) / prev) * 100;
  if (Math.abs(d) < 1) return null;
  return <span className={`text-xs tabular-nums ${d > 0 ? "text-rose-700" : "text-emerald-700"}`}>{d > 0 ? "+" : "−"}{Math.abs(d).toFixed(0)} %</span>;
}

/** Una fila de barra horizontal: nombre, importe, % del total y variación frente al ciclo anterior a la misma altura. */
function BarRow({ bar, max, total, onClick, open, nested = false }: { bar: Bar; max: number; total: number; onClick?: () => void; open?: boolean; nested?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open}
      className={`flex w-full items-center gap-3 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500 ${nested ? "py-2.5" : "py-3"}`}>
      {bar.icon && <CategoryIcon category={bar.icon} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className={`truncate ${nested ? "text-sm text-slate-700" : "text-[15px] font-semibold text-slate-900"}`}>{bar.label}</span>
          <span className="flex shrink-0 items-baseline gap-2">
            <Delta now={bar.amount} prev={bar.prev} />
            <b className={`amount tabular-nums text-slate-900 ${nested ? "text-sm font-semibold" : "text-[15px] font-semibold"}`}>{eur(bar.amount, 2)}</b>
          </span>
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className={`block flex-1 rounded-full bg-slate-100 ${nested ? "h-1" : "h-1.5"}`}>
            <span className="block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${Math.max(2, (bar.amount / max) * 100)}%`, backgroundColor: bar.color }} />
          </span>
          <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{total > 0 ? `${Math.round((bar.amount / total) * 100)} %` : ""}</span>
        </span>
      </span>
      {onClick && (nested
        ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
        : <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />)}
    </button>
  );
}

function GroupBars({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const { now, before } = plan.totals;
  const hasPrev = !!plan.previous;
  const grouped = new Set(plan.groups.flatMap((g) => g.categories));
  const loose = Object.keys(now).filter((c) => !grouped.has(c) && now[c] > 0);
  const rows = [
    ...plan.groups.map((g) => ({ id: g.id, name: g.name, categories: g.categories })),
    ...(loose.length ? [{ id: "__none", name: "Sin grupo", categories: loose }] : []),
  ]
    .map((g) => ({ ...g, amount: sumOf(now, g.categories), prev: hasPrev ? sumOf(before, g.categories) : null }))
    .filter((g) => g.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const max = Math.max(1, ...rows.map((r) => r.amount));

  if (!plan.groups.length) return (
    <div className="py-6 text-center">
      <p className="text-sm text-slate-600">Agrupa tus categorías (gastos fijos, ocio…) para ver aquí en qué se va el dinero.</p>
      <Link href="/finanzas/plan" className="mt-3 inline-flex h-10 items-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700">Definir grupos</Link>
    </div>
  );
  if (!rows.length) return <p className="py-6 text-center text-sm text-slate-400">Sin gastos en este ciclo todavía.</p>;

  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((g) => {
        const isOpen = open === g.id;
        const cats: Bar[] = g.categories
          .map((c) => ({ key: c, label: categoryLabel(c), amount: now[c] ?? 0, prev: hasPrev ? before[c] ?? 0 : null, color: categoryHex(c), icon: c }))
          .filter((c) => c.amount > 0)
          .sort((a, b) => b.amount - a.amount);
        const catMax = Math.max(1, ...cats.map((c) => c.amount));
        return (
          <li key={g.id}>
            <BarRow bar={{ key: g.id, label: g.name, amount: g.amount, prev: g.prev, color: "#2563eb" }} max={max} total={total} open={isOpen}
              onClick={() => setOpen(isOpen ? null : g.id)} />
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <ul className="mb-3 rounded-2xl bg-slate-50/80 px-3 py-1">
                  {cats.map((c) => (
                    <li key={c.key}>
                      <BarRow bar={c} max={catMax} total={g.amount} nested onClick={() => router.push(`/finanzas/plan/categoria/${c.key}`)} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function LabHome() {
  const { data, error } = useFinance<Overview>("overview");
  const plan = useFinance<Plan>("plan");
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <div className="space-y-4"><SkeletonStats /><SkeletonList rows={6} /></div>;
  const v = data.cycleView;
  const t = v.totals;
  const prevExp = v.previous?.expenses ?? null;
  return (
    <div className="space-y-4 pb-6">
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Laboratorio: propuesta de Inicio con tus datos reales. Inicio no cambia hasta que lo decidamos.</p>

      {/* 1. Evolución del ciclo y lo que se viene */}
      <section className={`${card} ${flat} p-4 sm:p-5`}>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Tu dinero este ciclo</h2>
            <p className="mt-0.5 text-xs text-slate-500">{v.cycle.label}, quedan {v.daysLeft} {v.daysLeft === 1 ? "día" : "días"}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="amount text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{eur(v.balance, 0)}</p>
            <p className="text-xs text-slate-500">hoy en tus cuentas</p>
          </div>
        </div>
        <div className="mt-3">
          <BalanceLine data={v.series} start={v.cycle.start} end={v.cycle.end} projected={v.projectedEnd} height={200} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
          <div>
            <dt className="text-[11px] text-slate-500">Gastado</dt>
            <dd className="amount mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{eur(t.expenses, 0)}</dd>
            {prevExp !== null && <dd className="text-[11px]"><Delta now={t.expenses} prev={prevExp} /></dd>}
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">Recibos por llegar</dt>
            <dd className="amount mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{eur(v.pendingFixed, 0)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">Previsto el {shortDay(v.cycle.end)}</dt>
            <dd className={`amount mt-0.5 text-sm font-semibold tabular-nums ${(v.projectedEnd ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{eur(v.projectedEnd, 0)}</dd>
          </div>
        </dl>
      </section>

      {/* 2. En qué se va el dinero, por grupos */}
      <section className={`${card} ${flat} px-4 pt-4 sm:px-5 sm:pt-5`}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">En qué se va el dinero</h2>
          <Link href="/finanzas/plan" className="inline-flex items-center text-sm font-medium text-blue-700 hover:underline">Mi plan<ChevronRight className="h-4 w-4" /></Link>
        </div>
        {plan.data?.previous && <p className="mt-0.5 text-xs text-slate-500">Variación frente al ciclo anterior a estas alturas.</p>}
        <div className="mt-1">
          {plan.data ? <GroupBars plan={plan.data} /> : <SkeletonList rows={4} />}
        </div>
      </section>
    </div>
  );
}
