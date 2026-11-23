"use client";
// Inicio · el gasto del mes y tus grupos (nació en el laboratorio el 23/11/2026).
// 1. Gasto acumulado del mes (sin extraordinarios) frente al mes pasado y al objetivo; pills con los grupos de gasto
//    gradual (los de recibos fijos no se siguen día a día).
// 2. Tus grupos: el ritmo de cada uno en palabras, con una marca; al tocarlo se despliegan sus categorías.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { categoryLabel } from "@/lib/finance/categories";
import { cumulative, deviationOf, groupSummary, isGradual, type GroupCycleTotals } from "@/lib/finance/plan";
import { card, eur, flat } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useFinance } from "./api";
import { CategoryIcon } from "./category-icon";

type Plan = {
  hasData: boolean;
  cycle: { start: string; end: string; label: string; day: number; totalDays: number };
  previous: { start: string; end: string } | null;
  groups: { id: string; name: string; categories: string[]; goal: number | null }[];
  history?: GroupCycleTotals[];
  daily?: { cur: Record<string, number[]>; prev: Record<string, number[]> };
  extras?: { date: string; label: string; amount: number; category: string }[];
  budget?: { income: number | null; savingsGoal: number | null; limit: number | null };
  totals?: { extrasNow?: Record<string, number> };
};
const OPEN_KEY = "crs-finance:home-open";
const SCROLL_KEY = "crs-finance:home-scroll";
const scroller = () => document.querySelector<HTMLElement>("main");

// ── Vista sin desplegar: a qué ritmo vas en cada grupo, en palabras y sin cifras ─────────────────

type Pace = "bien" | "alto" | "pasado" | "sin_datos";
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
  const toSheet = (id: string) => { remember(); router.push(`/finanzas/grupo/${id}`); };

  return (
    <div className="pb-2">
      <p className="break-words text-[22px] font-semibold leading-tight tracking-tight text-slate-900">{headline}</p>
      <p className="mt-1 text-sm text-slate-500">{daysLeft > 1 ? `Quedan ${daysLeft} días de ciclo` : daysLeft === 1 ? "Queda 1 día de ciclo" : "Último día del ciclo"}</p>

      <ul className="mt-3 divide-y divide-slate-100">
        {rows.map(({ g, s, pace, text }) => {
          const isOpen = open === g.id;
          // Lo que sueles gastar en el grupo en un mes entero (media de los 3 ciclos cerrados), como referencia.
          const closed = cycles.slice(1, 4);
          const avgMonth = closed.length ? Math.round(closed.reduce((t, c) => t + g.categories.reduce((u, k) => u + (c.full[k] ?? 0), 0), 0) / closed.length) : 0;
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
                {/* La cifra hace de semáforo: rojo si te has pasado, ámbar si vas rápido, neutro si vas bien. */}
                <span className="shrink-0 text-right">
                  <b className={`amount block text-[15px] font-semibold tabular-nums ${pace === "pasado" ? "text-rose-700" : pace === "alto" ? "text-amber-700" : "text-slate-900"}`}>{eur(s.now, 0)}</b>
                  <span className="amount block text-[11px] tabular-nums text-slate-500">{s.goal !== null ? `de ${eur(s.goal, 0)}` : avgMonth > 0 ? `~${eur(avgMonth, 0)} al mes` : ""}</span>
                </span>
              </button>

              <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <div className="mb-3 ml-12">
                    <button type="button" onClick={() => toSheet(g.id)} aria-label={`Ver todos los movimientos de ${g.name}`}
                      className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-slate-500">Gastado este mes</span>
                        <span className="amount block text-lg font-semibold tabular-nums tracking-tight text-slate-900">
                          {eur(s.now, 2)}{s.goal !== null && <span className="text-sm font-normal text-slate-500"> de {eur(s.goal, 0)}</span>}
                        </span>
                        {(() => { const x = g.categories.reduce((t, c) => t + (plan.totals?.extrasNow?.[c] ?? 0), 0); return x > 0 ? <span className="amount block text-xs text-slate-500">+{eur(x, 2)} extraordinarios aparte</span> : null; })()}
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                    </button>
                    <ul className="mt-1">
                      {cats.map(({ c, now, d }) => (
                        <li key={c}>
                          <div className="flex w-full items-center gap-3 py-2.5">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-slate-800">{categoryLabel(c)}</span>
                              {d && (
                                <span className={`block truncate text-xs ${d.state === "estable" ? "text-slate-500" : d.state === "mejor" ? "text-emerald-700" : "text-amber-700"}`}>
                                  {d.state === "estable" ? "Igual que el mes pasado" : d.state === "mejor" ? "Menos que el mes pasado" : "Más que el mes pasado"}
                                </span>
                              )}
                            </span>
                            <span className="amount shrink-0 text-sm font-semibold tabular-nums text-slate-900">{eur(now, 2)}</span>
                          </div>
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

// ── Gráfico: gasto acumulado del mes frente al mes pasado (y el objetivo) ────────────────────────

function SpendChart({ plan }: { plan: Plan }) {
  const [sel, setSel] = useState<string>("all");
  const daily = plan.daily ?? { cur: {}, prev: {} };
  const cycles = plan.history ?? [];
  const { day, totalDays, start, end } = plan.cycle;
  // Solo los grupos de gasto gradual: los de recibos fijos entran de golpe y no tiene sentido seguirlos día a día.
  const gradual = plan.groups.filter((g) => g.categories.length && isGradual(g.categories, cycles, daily.prev));
  const fixed = plan.groups.filter((g) => g.categories.length && !gradual.includes(g));
  const group = gradual.find((g) => g.id === sel) ?? null;
  const cats = group ? group.categories : null;
  const prevLen = Math.max(0, ...Object.values(daily.prev).map((r) => r.length));
  const cur = cumulative(daily.cur, cats, totalDays).slice(0, day);
  const prev = prevLen ? cumulative(daily.prev, cats, prevLen) : [];
  const now = cur[cur.length - 1] ?? 0;
  const prevAtDay = prev.length ? prev[Math.min(day, prev.length) - 1] : null;
  // Objetivo: en un grupo, diagonal de 0 a su objetivo; en «Todo», tu límite (lo que entra menos lo que quieres
  // ahorrar) repartido según cómo gastaste el mes pasado (los recibos fijos de principio de mes suben de golpe).
  const goal = group ? group.goal : plan.budget?.limit ?? null;
  const prevTotal = prev[prev.length - 1] ?? 0;
  const goalLine = goal === null ? null : Array.from({ length: totalDays }, (_, i) => {
    if (group || !prev.length || prevTotal <= 0) return (goal * (i + 1)) / totalDays;
    return goal * (prev[Math.min(prev.length - 1, Math.round(((i + 1) / totalDays) * prev.length) - 1)] ?? 0) / prevTotal;
  });
  const extras = (plan.extras ?? []).filter((e) => !cats || cats.includes(e.category));
  const extrasTotal = extras.reduce((t, e) => t + e.amount, 0);

  const W = 340, H = 170, pad = { l: 4, r: 4, t: 10, b: 18 };
  const top = Math.max(1, now, prevTotal, ...(goalLine ?? [0])) * 1.08;
  const x = (i: number, n = totalDays) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / top) * (H - pad.t - pad.b);
  const path = (vals: number[], n = totalDays) => vals.map((v, i) => `${i ? "L" : "M"}${x(i, n).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = cur.length > 1 ? `${path(cur)} L${x(cur.length - 1).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z` : "";

  const diff = prevAtDay === null ? null : Math.round(now - prevAtDay);
  const verdict = diff === null ? "Aún no hay mes anterior para comparar"
    : Math.abs(diff) < 10 ? "Igual que el mes pasado a estas alturas"
    : diff < 0 ? `${eur(-diff, 0)} menos que el mes pasado a estas alturas`
    : `${eur(diff, 0)} más que el mes pasado a estas alturas`;
  const tone = diff === null || Math.abs(diff) < 10 ? "text-slate-500" : diff < 0 ? "text-emerald-700" : "text-amber-700";
  const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div>
      <p className="text-sm text-slate-500">{group ? `${group.name} este mes` : "Has gastado este mes"}</p>
      <p className="amount mt-0.5 text-[30px] font-semibold leading-none tracking-tight text-slate-900">
        {eur(now, 0)}{goal !== null && <span className="text-base font-medium text-slate-400"> de {eur(goal, 0)}</span>}
      </p>
      <p className={`amount mt-1.5 text-sm font-medium ${tone}`}>{verdict}</p>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block h-auto w-full" role="img" aria-label={`Gasto acumulado: ${eur(now, 0)}. ${verdict}.`}>
        <defs>
          <linearGradient id="spend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3478f6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3478f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#e2e8f0" />
        {goalLine && <path d={path(goalLine)} fill="none" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" />}
        {prev.length > 1 && <path d={path(prev, prev.length)} fill="none" stroke="#cbd5e1" strokeWidth={2} strokeLinejoin="round" />}
        {area && <path d={area} fill="url(#spend-fill)" />}
        {cur.length > 1 && <path d={path(cur)} fill="none" stroke="#3478f6" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />}
        {cur.length > 0 && <>
          <circle cx={x(cur.length - 1)} cy={y(now)} r={6} fill="#3478f6" fillOpacity={0.2} />
          <circle cx={x(cur.length - 1)} cy={y(now)} r={3.5} fill="#3478f6" stroke="#fff" strokeWidth={1.5} />
        </>}
        <text x={pad.l} y={H - 3} fontSize="10" fill="#94a3b8">{fmtDay(start)}</text>
        <text x={W - pad.r} y={H - 3} fontSize="10" fill="#94a3b8" textAnchor="end">{fmtDay(end)}</text>
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#3478f6]" />Este mes</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-slate-300" />Mes pasado</span>
        {goalLine && <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-[1.5px] border-dashed border-emerald-500" />{group ? "Tu objetivo" : "Tu límite para ahorrar"}</span>}
      </div>
      {extrasTotal > 0 && (
        <p className="amount mt-2 break-words text-xs text-slate-500">Además, {eur(extrasTotal, 0)} en extraordinarios ({extras.slice(0, 2).map((e) => (e.label.length > 22 ? `${e.label.slice(0, 22).trim()}…` : e.label)).join(", ")}{extras.length > 2 ? "…" : ""}), aparte de la línea.</p>
      )}
      {!group && goal === null && (
        <Link href="/finanzas/ajustes" className="mt-2 inline-block text-xs font-medium text-blue-700 hover:underline">¿Cuánto quieres ahorrar al mes?</Link>
      )}
      {group && group.goal === null && (
        <Link href="/finanzas/plan" onClick={() => { try { window.sessionStorage.setItem("crs-finance:plan-open", group.id); } catch { /* ignorar */ } }}
          className="mt-2 inline-block text-xs font-medium text-blue-700 hover:underline">Ponle un objetivo a {group.name} para ver tu línea</Link>
      )}

      {gradual.length > 0 && (
        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ id: "all", name: "Todo" }, ...gradual].map((g) => (
            <button key={g.id} type="button" onClick={() => setSel(g.id)} aria-pressed={sel === g.id}
              className={`h-8 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors ${sel === g.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {g.name}
            </button>
          ))}
        </div>
      )}
      {fixed.length > 0 && <p className="mt-2 break-words text-[11px] text-slate-400">{fixed.map((g) => g.name).join(" y ")} no salen aquí: son recibos fijos que entran de golpe.</p>}
    </div>
  );
}

/** Inicio: el gráfico de gasto del mes y, debajo, cómo vas en cada grupo de Mi plan. */
export function HomePlan() {
  const { data, error } = useFinance<Plan>("plan");
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
      <section className={`${card} ${flat} min-w-0 overflow-hidden p-4 sm:p-5`}>
        {data ? <SpendChart plan={data} /> : <SkeletonList rows={3} />}
      </section>
      <section className={`${card} ${flat} min-w-0 overflow-hidden px-4 pt-4 sm:px-5 sm:pt-5`}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-slate-500">Tus grupos</h2>
          <Link href="/finanzas/plan" className="inline-flex items-center text-sm font-medium text-blue-700 hover:underline">Mi plan<ChevronRight className="h-4 w-4" /></Link>
        </div>
        <div className="mt-1">{data ? <GoalsGlance plan={data} /> : <SkeletonList rows={4} />}</div>
      </section>
    </div>
  );
}
