"use client";
// Laboratorio · propuesta de Inicio (mockup con datos reales; no sustituye a Inicio hasta decidirlo).
// 1. Evolución del ciclo: saldo día a día con el tramo previsto hasta fin de ciclo y lo que se viene.
// 2. ¿Cumples tu plan?: por grupo, lo gastado frente a lo esperable hoy, en barras que salen del centro (derecha
//    rojo = más, izquierda verde = menos), de peor a mejor; los estables, en pills. Al desplegar, solo lo que se ha
//    movido (categorías, o subcategorías si el grupo es de una sola categoría); al tocarlo, su detalle.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUp, Check, ChevronDown, ChevronRight, Minus } from "lucide-react";
import type { overview } from "@/lib/finance/service";
import { categoryLabel } from "@/lib/finance/categories";
import { deviationOf, groupSummary, planDeviations, type Deviation, type GroupCycleTotals, type PlanGroupDeviation, type PlanItem } from "@/lib/finance/plan";
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

// ── Vista sin desplegar: a qué ritmo vas en cada grupo, en palabras y sin cifras ─────────────────

type Pace = "bien" | "alto" | "pasado" | "sin_datos";
const PACE_MARK: Record<Pace, { icon: typeof Check; bg: string; fg: string }> = {
  bien: { icon: Check, bg: "bg-emerald-100", fg: "text-emerald-700" },
  alto: { icon: ArrowUp, bg: "bg-amber-100", fg: "text-amber-700" },
  pasado: { icon: AlertTriangle, bg: "bg-rose-100", fg: "text-rose-700" },
  sin_datos: { icon: Minus, bg: "bg-slate-100", fg: "text-slate-400" },
};
const PACE_ORDER: Record<Pace, number> = { pasado: 0, alto: 1, bien: 2, sin_datos: 3 };

/**
 * Ritmo de un grupo. Con objetivo: lo gastado frente a lo que sueles llevar a estas alturas de ese objetivo (así el
 * día 1 con 50 de 60 no sale en verde). Sin objetivo: frente al mes (ciclo) pasado hasta el mismo día.
 */
function paceOf(s: ReturnType<typeof groupSummary>, lastMonth: number | null): { pace: Pace; text: string } {
  if (s.now <= 0) return { pace: "bien", text: "Sin gastos este mes" };
  if (s.goal !== null) {
    if (s.status === "superado") return { pace: "pasado", text: "Has superado tu objetivo" };
    if (s.status === "atento") return { pace: "alto", text: "Ritmo alto para tu objetivo" };
    return { pace: "bien", text: "Buen ritmo para tu objetivo" };
  }
  if (lastMonth === null) return { pace: "sin_datos", text: "Aún sin mes anterior para comparar" };
  const d = deviationOf(s.now, lastMonth);
  if (d.state === "peor") return { pace: "pasado", text: "Ritmo muy alto respecto al mes pasado" };
  if (d.state === "algo_peor") return { pace: "alto", text: "Ritmo alto respecto al mes pasado" };
  return { pace: "bien", text: "Buen ritmo respecto al mes pasado" };
}

const sumCats = (r: Record<string, number> | undefined, cats: string[]) => cats.reduce((t, c) => t + (r?.[c] ?? 0), 0);

function GoalsGlance({ plan }: { plan: Plan }) {
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

  const cycles = plan.history ?? [];
  const cur = cycles[0];
  const last = cycles[1] ?? null;
  const { day, totalDays } = plan.cycle;
  const daysLeft = totalDays - day;

  if (!plan.groups.length) return (
    <div className="py-6 text-center">
      <p className="text-sm text-slate-600">Agrupa tus gastos (casa, ocio, comida a domicilio…) para ver aquí a qué ritmo vas.</p>
      <Link href="/finanzas/plan" className="mt-3 inline-flex h-10 items-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700">Definir grupos</Link>
    </div>
  );

  const rows = plan.groups.filter((g) => g.categories.length)
    .map((g) => {
      const s = groupSummary({ categories: g.categories, cycles, goal: g.goal, day, totalDays });
      return { g, s, ...paceOf(s, last ? sumCats(last.atDay, g.categories) : null) };
    })
    .sort((a, b) => PACE_ORDER[a.pace] - PACE_ORDER[b.pace]);
  const judged = rows.filter((r) => r.pace !== "sin_datos");
  const good = judged.filter((r) => r.pace === "bien").length;
  const headline = !judged.length ? "Aún no hay con qué compararte"
    : good === judged.length ? (judged.length === 1 ? "Vas a buen ritmo" : `Vas a buen ritmo en tus ${judged.length} grupos`)
    : `Vas a buen ritmo en ${good} de tus ${judged.length} grupos`;
  const remember = () => { try { window.sessionStorage.setItem(SCROLL_KEY, String(scroller()?.scrollTop ?? 0)); } catch { /* ignorar */ } };
  const toGroup = (id: string) => { remember(); try { window.sessionStorage.setItem("crs-finance:plan-open", id); } catch { /* ignorar */ } router.push("/finanzas/plan"); };
  const toCategory = (c: string) => { remember(); router.push(`/finanzas/plan/categoria/${c}`); };

  return (
    <div className="pb-2">
      <p className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900">{headline}</p>
      <p className="mt-1 text-sm text-slate-500">{daysLeft > 1 ? `Quedan ${daysLeft} días de ciclo` : daysLeft === 1 ? "Queda 1 día de ciclo" : "Último día del ciclo"}</p>

      <ul className="mt-3 divide-y divide-slate-100">
        {rows.map(({ g, s, pace, text }) => {
          const mark = PACE_MARK[pace];
          const Mark = mark.icon;
          const isOpen = open === g.id;
          const cats = g.categories
            .map((c) => {
              const now = cur?.atDay[c] ?? 0;
              const prev = last ? last.atDay[c] ?? 0 : null;
              return { c, now, prev, d: prev === null ? null : deviationOf(now, prev) };
            })
            .filter((x) => x.now > 0 || (x.prev ?? 0) > 0)
            .sort((a, b) => b.now - a.now);
          return (
            <li key={g.id}>
              <button type="button" onClick={() => setOpen(isOpen ? null : g.id)} aria-expanded={isOpen}
                className="flex w-full items-center gap-3 py-3.5 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500">
                <CategoryIcon category={g.categories[0]} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-slate-900">{g.name}</span>
                  <span className="block truncate text-xs text-slate-500">{text}</span>
                </span>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${mark.bg}`} aria-hidden="true">
                  <Mark className={`h-4 w-4 ${mark.fg}`} strokeWidth={2.5} />
                </span>
              </button>

              <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <div className="mb-3 ml-12">
                    <button type="button" onClick={() => toGroup(g.id)}
                      className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-slate-500">Gastado este mes</span>
                        <span className="amount block text-lg font-semibold tabular-nums tracking-tight text-slate-900">
                          {eur(s.now, 2)}{s.goal !== null && <span className="text-sm font-normal text-slate-500"> de {eur(s.goal, 0)}</span>}
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                    </button>
                    <ul className="mt-1">
                      {cats.map(({ c, now, d }) => (
                        <li key={c}>
                          <button type="button" onClick={() => toCategory(c)} className="flex w-full items-center gap-3 py-2.5 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-slate-800">{categoryLabel(c)}</span>
                              {d && (
                                <span className={`block truncate text-xs ${d.state === "estable" ? "text-slate-500" : d.state === "mejor" ? "text-emerald-700" : "text-amber-700"}`}>
                                  {d.state === "estable" ? "Igual que el mes pasado" : d.state === "mejor" ? "Menos que el mes pasado" : "Más que el mes pasado"}
                                </span>
                              )}
                            </span>
                            <span className="amount shrink-0 text-sm font-semibold tabular-nums text-slate-900">{eur(now, 2)}</span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                          </button>
                        </li>
                      ))}
                      {!cats.length && <li className="py-2.5 text-sm text-slate-500">Sin gastos este mes.</li>}
                    </ul>
                  </div>
                </div>
              </div>
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
          <h2 className="text-sm font-medium text-slate-500">Tus grupos</h2>
          <Link href="/finanzas/plan" className="inline-flex items-center text-sm font-medium text-blue-700 hover:underline">Mi plan<ChevronRight className="h-4 w-4" /></Link>
        </div>
        <div className="mt-1">
          {plan.data ? <GoalsGlance plan={plan.data} /> : <SkeletonList rows={4} />}
        </div>
      </section>
    </div>
  );
}
