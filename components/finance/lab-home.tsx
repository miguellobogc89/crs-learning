"use client";
// Laboratorio · propuesta de Inicio (mockup con datos reales; no sustituye a Inicio hasta decidirlo).
// 1. Evolución del ciclo: saldo día a día con el tramo previsto hasta fin de ciclo y lo que se viene.
// 2. ¿Cumples tu plan?: por grupo, lo gastado frente a lo esperable hoy, en barras que salen del centro (derecha
//    rojo = más, izquierda verde = menos), de peor a mejor; los estables, en pills. Al desplegar, solo lo que se ha
//    movido (categorías, o subcategorías si el grupo es de una sola categoría); al tocarlo, su detalle.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { overview } from "@/lib/finance/service";
import { categoryLabel } from "@/lib/finance/categories";
import { groupSummary, planDeviations, type Deviation, type GroupCycleTotals, type PlanGroupDeviation, type PlanItem } from "@/lib/finance/plan";
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
  history?: GroupCycleTotals[];
};
type Dev = PlanGroupDeviation;
type Item = PlanItem;

const OPEN_KEY = "crs-finance:lab-open";
const SCROLL_KEY = "crs-finance:lab-scroll";
const scroller = () => document.querySelector<HTMLElement>("main");

const TONE: Record<Deviation, { bar: string; text: string }> = {
  peor: { bar: "#e11d48", text: "text-rose-700" },
  algo_peor: { bar: "#d97706", text: "text-amber-700" },
  mejor: { bar: "#059669", text: "text-emerald-700" },
  estable: { bar: "#94a3b8", text: "text-slate-500" },
};

const signed = (v: number) => `${v > 0 ? "+" : "−"}${eur(Math.abs(v), Math.abs(v) >= 100 ? 0 : 2)}`;

function Delta({ now, prev }: { now: number; prev: number | null }) {
  if (prev === null || prev <= 0) return null;
  const d = ((now - prev) / prev) * 100;
  if (Math.abs(d) < 1) return null;
  return <span className={`text-xs tabular-nums ${d > 0 ? "text-rose-700" : "text-emerald-700"}`}>{d > 0 ? "+" : "−"}{Math.abs(d).toFixed(0)} %</span>;
}

function Figure({ diff, pct, state, small = false }: { diff: number; pct: number | null; state: Deviation; small?: boolean }) {
  return (
    <span className={`amount shrink-0 whitespace-nowrap tabular-nums ${TONE[state].text} ${small ? "text-sm font-semibold" : "text-[15px] font-semibold"}`}>
      {signed(diff)}{pct !== null && Math.abs(pct) >= 1 && <span className="ml-1 text-xs font-normal opacity-80">({pct > 0 ? "+" : "−"}{Math.abs(Math.round(pct))} %)</span>}
    </span>
  );
}

/** Barra que sale del centro: a la derecha (rojo/ámbar) gastas más de lo esperable; a la izquierda (verde), menos. */
function Diverging({ diff, max, state, thin = false }: { diff: number; max: number; state: Deviation; thin?: boolean }) {
  const half = Math.min(50, (Math.abs(diff) / Math.max(1, max)) * 50);
  return (
    <span className={`relative block w-full rounded-full bg-slate-100 ${thin ? "h-1" : "h-1.5"}`} aria-hidden="true">
      <span className="absolute inset-y-[-3px] left-1/2 w-px -translate-x-1/2 bg-slate-300" />
      <span className="absolute inset-y-0 rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${Math.max(1.5, half)}%`, backgroundColor: TONE[state].bar, ...(diff >= 0 ? { left: "50%" } : { right: "50%" }) }} />
    </span>
  );
}

function Breakdown({ g, onOpenItem }: { g: Dev; onOpenItem: (i: Item) => void }) {
  const max = Math.max(1, ...g.moved.map((i) => Math.abs(i.diff)));
  return (
    <div className="mb-3 rounded-2xl bg-slate-50/80 px-3 py-1">
      {g.moved.length ? (
        <ul>
          {g.moved.map((i) => (
            <li key={i.key}>
              <button type="button" onClick={() => onOpenItem(i)} className="flex w-full items-center gap-3 py-2.5 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500">
                {g.level === "categoria" && <CategoryIcon category={i.category} />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-slate-800">{i.label}</span>
                    <Figure diff={i.diff} pct={i.pct} state={i.state} small />
                  </span>
                  <span className="mt-1.5 block"><Diverging diff={i.diff} max={max} state={i.state} thin /></span>
                  <span className="amount mt-1 block text-[11px] text-slate-400">{eur(i.now, 2)} frente a {eur(i.ref, 2)} de media</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2.5 text-sm text-slate-500">Nada se ha movido por separado.</p>
      )}
      {g.unchanged.length > 0 && (
        <p className="border-t border-slate-200/70 py-2.5 text-xs text-slate-500">Sin cambios: {g.unchanged.map((i) => i.label.toLowerCase()).join(", ")}</p>
      )}
    </div>
  );
}

function PlanCheck({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  // Al volver del detalle, todo queda como se dejó: lo desplegado y el scroll (en esta sesión).
  useEffect(() => {
    try { setOpen(window.sessionStorage.getItem(OPEN_KEY) || null); } catch { /* sin almacenamiento */ }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try { if (open) window.sessionStorage.setItem(OPEN_KEY, open); else window.sessionStorage.removeItem(OPEN_KEY); } catch { /* ignorar */ }
  }, [open, restored]);
  useEffect(() => {
    if (!restored) return;
    try {
      const y = Number(window.sessionStorage.getItem(SCROLL_KEY));
      if (y > 0) requestAnimationFrame(() => { const el = scroller(); if (el) el.scrollTop = y; });
      window.sessionStorage.removeItem(SCROLL_KEY);
    } catch { /* ignorar */ }
  }, [restored]);

  if (!plan.groups.length) return (
    <div className="py-6 text-center">
      <p className="text-sm text-slate-600">Agrupa tus categorías (gastos fijos, ocio…) para ver aquí si cumples tu plan.</p>
      <Link href="/finanzas/plan" className="mt-3 inline-flex h-10 items-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700">Definir grupos</Link>
    </div>
  );
  const devs = planDeviations({ groups: plan.groups, cycles: plan.history ?? [], day: plan.cycle.day, totalDays: plan.cycle.totalDays, labels: categoryLabel });
  if (!devs.length) return <p className="py-6 text-sm text-slate-500">Cuando tengas un ciclo completo (o un objetivo en tus grupos) verás aquí cómo vas frente a lo habitual.</p>;
  const moving = devs.filter((g) => g.state !== "estable");
  const steady = devs.filter((g) => g.state === "estable");
  const max = Math.max(1, ...moving.map((g) => Math.abs(g.diff)));
  const openItem = (i: Item) => {
    try { window.sessionStorage.setItem(SCROLL_KEY, String(scroller()?.scrollTop ?? 0)); } catch { /* ignorar */ }
    router.push(`/finanzas/plan/categoria/${i.category}`);
  };
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));
  const openSteady = steady.find((g) => g.id === open);

  return (
    <div>
      {moving.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {moving.map((g) => {
            const isOpen = open === g.id;
            return (
              <li key={g.id}>
                <button type="button" onClick={() => toggle(g.id)} aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 py-3.5 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[15px] font-semibold text-slate-900">{g.name}</span>
                      <Figure diff={g.diff} pct={g.pct} state={g.state} />
                    </span>
                    <span className="mt-2 block"><Diverging diff={g.diff} max={max} state={g.state} /></span>
                    <span className="amount mt-1.5 block text-xs text-slate-500">
                      {eur(g.now, 0)} gastado, frente a {eur(g.ref, 0)} {g.basis === "objetivo" ? "según tu objetivo" : "de tu media"} a estas alturas
                    </span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden"><Breakdown g={g} onOpenItem={openItem} /></div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {steady.length > 0 && (
        <div className={`${moving.length ? "border-t border-slate-100" : ""} py-3.5`}>
          <p className="text-xs text-slate-500">Se mantienen</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {steady.map((g) => (
              <button key={g.id} type="button" onClick={() => toggle(g.id)} aria-pressed={open === g.id}
                className={`inline-flex h-8 items-center rounded-full px-3.5 text-sm font-medium transition-colors ${open === g.id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                {g.name}
              </button>
            ))}
          </div>
          {openSteady && <div className="mt-3"><Breakdown g={openSteady} onOpenItem={openItem} /></div>}
        </div>
      )}
    </div>
  );
}

// ── Vista sin desplegar: cómo vas frente a tus objetivos, para todos los públicos ─────────────────

type GoalState = "pasado" | "rapido" | "bien" | "sin_objetivo";
const GOAL_TONE: Record<Exclude<GoalState, "sin_objetivo">, { fill: string; tint: string; text: string }> = {
  pasado: { fill: "rgba(225,29,72,0.16)", tint: "rgba(225,29,72,0.05)", text: "text-rose-700" },
  rapido: { fill: "rgba(217,119,6,0.17)", tint: "rgba(217,119,6,0.05)", text: "text-amber-700" },
  bien: { fill: "rgba(5,150,105,0.15)", tint: "rgba(5,150,105,0.045)", text: "text-emerald-700" },
};
const ORDER: Record<GoalState, number> = { pasado: 0, rapido: 1, bien: 2, sin_objetivo: 3 };
const whole = (v: number) => eur(Math.round(v), 0);
/** Objetivo sugerido para quien no tiene: lo del último ciclo cerrado menos un 10 %, redondeado a 5 €. */
const suggestGoal = (last: number) => (last > 0 ? Math.max(5, Math.round((last * 0.9) / 5) * 5) : null);

function GoalsGlance({ plan }: { plan: Plan }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(t); }, []);
  const cycles = plan.history ?? [];
  const { day, totalDays } = plan.cycle;
  const daysLeft = totalDays - day;
  const rows = plan.groups.filter((g) => g.categories.length).map((g) => {
    const s = groupSummary({ categories: g.categories, cycles, goal: g.goal, day, totalDays });
    const state: GoalState = s.goal === null ? "sin_objetivo" : s.status === "superado" ? "pasado" : s.status === "atento" ? "rapido" : "bien";
    const last = cycles[1] ? g.categories.reduce((t, c) => t + (cycles[1].full[c] ?? 0), 0) : 0;
    return { g, s, state, suggested: suggestGoal(last) };
  }).sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.s.now - a.s.now);

  if (!plan.groups.length) return (
    <div className="py-6 text-center">
      <p className="text-sm text-slate-600">Agrupa tus gastos (casa, ocio, comida a domicilio…) y ponles un objetivo para ver aquí cómo vas.</p>
      <Link href="/finanzas/plan" className="mt-3 inline-flex h-10 items-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700">Definir grupos</Link>
    </div>
  );

  const withGoal = rows.filter((r) => r.state !== "sin_objetivo");
  const good = withGoal.filter((r) => r.state === "bien").length;
  const headline = !withGoal.length ? "Ponles un objetivo a tus grupos"
    : good === withGoal.length ? (withGoal.length === 1 ? "Vas bien en tu objetivo" : `Vas bien en tus ${withGoal.length} objetivos`)
    : `Vas bien en ${good} de tus ${withGoal.length} objetivos`;
  const goTo = (id: string) => { try { window.sessionStorage.setItem("crs-finance:plan-open", id); } catch { /* ignorar */ } };

  return (
    <div className="pb-4">
      <p className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900">{headline}</p>
      <p className="mt-1 text-sm text-slate-500">{daysLeft > 0 ? `Quedan ${daysLeft} ${daysLeft === 1 ? "día" : "días"} de ciclo` : "Último día del ciclo"}</p>

      <ul className="mt-4 space-y-2.5">
        {rows.map(({ g, s, state, suggested }) => {
          const icon = g.categories[0];
          if (state === "sin_objetivo") return (
            <li key={g.id}>
              <Link href="/finanzas/plan" onClick={() => goTo(g.id)}
                className="flex h-16 items-center gap-3 rounded-2xl border border-dashed border-slate-300 px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <CategoryIcon category={icon} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-slate-900">{g.name}</span>
                  <span className="amount block truncate text-xs text-slate-500">Llevas {whole(s.now)}{suggested ? `. ¿Te pones ${whole(suggested)}?` : ""}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-blue-700">Ponle objetivo</span>
              </Link>
            </li>
          );
          const tone = GOAL_TONE[state];
          const pct = s.goal ? Math.min(100, (s.now / s.goal) * 100) : 0;
          const phrase = state === "pasado" ? `Te has pasado ${whole(-(s.left ?? 0))}`
            : state === "rapido" ? `Vas rápido, te quedan ${whole(s.left ?? 0)}`
            : `Te quedan ${whole(s.left ?? 0)}`;
          return (
            <li key={g.id}>
              <Link href="/finanzas/plan" onClick={() => goTo(g.id)} aria-label={`${g.name}: ${phrase}`}
                className="relative flex h-16 items-center gap-3 overflow-hidden rounded-2xl px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                style={{ backgroundColor: tone.tint }}>
                {/* El propio fondo de la fila es la barra: se llena hasta lo gastado del objetivo. */}
                <span aria-hidden="true" className="absolute inset-y-0 left-0 transition-[width] duration-[900ms] ease-out motion-reduce:transition-none"
                  style={{ width: ready ? `${pct}%` : "0%", backgroundColor: tone.fill }} />
                <span className="relative"><CategoryIcon category={icon} /></span>
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-slate-900">{g.name}</span>
                  <span className={`amount block truncate text-xs font-medium ${tone.text}`}>{phrase}</span>
                </span>
                <span className="relative shrink-0 text-right">
                  <b className="amount block text-[17px] font-semibold tabular-nums tracking-tight text-slate-900">{whole(s.now)}</b>
                  <span className="amount block text-[11px] tabular-nums text-slate-500">de {whole(s.goal ?? 0)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
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
          <h2 className="text-sm font-medium text-slate-500">Tus objetivos</h2>
          <Link href="/finanzas/plan" className="inline-flex items-center text-sm font-medium text-blue-700 hover:underline">Mi plan<ChevronRight className="h-4 w-4" /></Link>
        </div>
        <div className="mt-1">
          {plan.data ? <GoalsGlance plan={plan.data} /> : <SkeletonList rows={4} />}
        </div>
      </section>
    </div>
  );
}
