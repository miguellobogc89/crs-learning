"use client";
// Inicio · el gasto del mes y tus grupos (nació en el laboratorio el 23/11/2026).
// 1. Gasto acumulado del mes (sin extraordinarios) frente al mes pasado y al objetivo; pills con los grupos de gasto
//    gradual (los de recibos fijos no se siguen día a día).
// 2. Tus grupos: lo gastado (el color dice si vas bien) y el ritmo en palabras. Un grupo de una sola categoría
//    abre su hoja al tocarlo; uno de varias despliega el reparto por categorías y «Ver todos los movimientos».
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronRight, Plus } from "lucide-react";
import { categoryLabel } from "@/lib/finance/categories";
import { cumulative, deviationOf, groupSummary, isGradual, type GroupCycleTotals } from "@/lib/finance/plan";
import { card, eur, flat } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useFinance } from "./api";
import { CategoryIcon } from "./category-icon";
import { AddExpenseSheet, type Planned } from "./planned";

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
  planned?: Planned[];
  pending?: NextItem[];
  next?: { cycle: { start: string; end: string; label: string }; items: NextItem[]; cancelled: { key: string; title: string; amount: number; category: string }[] };
};
const OPEN_KEY = "crs-finance:home-open";
const PAGE_KEY = "crs-finance:home-page";
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
  const [adding, setAdding] = useState(false);
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
  const toSheet = (id: string, cat?: string) => { remember(); router.push(`/finanzas/grupo/${id}${cat ? `?categoria=${encodeURIComponent(cat)}` : ""}`); };

  return (
    <div className="pb-2">
      <p className="break-words text-[22px] font-semibold leading-tight tracking-tight text-slate-900">{headline}</p>
      <p className="mt-1 text-sm text-slate-500">{daysLeft > 1 ? `Quedan ${daysLeft} días de ciclo` : daysLeft === 1 ? "Queda 1 día de ciclo" : "Último día del ciclo"}</p>

      <ul className="mt-3 divide-y divide-slate-100">
        {rows.map(({ g, s, pace, text }) => {
          // Lo previsto de este mes: tus previstos con fecha en este ciclo y lo que se repite y aún no se ha cobrado.
          const plannedHere = [
            ...(plan.planned ?? []).filter((x) => x.date >= plan.cycle.start && x.date <= plan.cycle.end),
            ...(plan.pending ?? []),
          ].filter((x) => g.categories.includes(x.category));
          const pendingSum = plannedHere.reduce((t, x) => t + x.amount, 0);
          const pendingOf = (c: string) => plannedHere.filter((x) => x.category === c).reduce((t, x) => t + x.amount, 0);
          const onlyPending = s.now <= 0 && pendingSum > 0;
          const single = g.categories.length <= 1;
          const isOpen = !single && open === g.id;
          // Lo que sueles gastar en el grupo en un mes entero (media de los 3 ciclos cerrados), como referencia.
          const closed = cycles.slice(1, 4);
          const avgMonth = closed.length ? Math.round(closed.reduce((t, c) => t + g.categories.reduce((u, k) => u + (c.full[k] ?? 0), 0), 0) / closed.length) : 0;
          const cats = g.categories
            .map((c) => {
              const now = cur?.atDay[c] ?? 0;
              const prev = last ? last.atDay[c] ?? 0 : null;
              return { c, now, prev, d: prev === null ? null : deviationOf(now, prev) };
            })
            .filter((x) => x.now > 0 || (x.prev ?? 0) > 0 || pendingOf(x.c) > 0)
            .sort((a, b) => b.now - a.now);
          return (
            <li key={g.id}>
              {/* Una sola categoría: no hay nada que desplegar, va directo a su hoja. Varias: se despliega el reparto. */}
              <button type="button" onClick={() => (single ? toSheet(g.id) : setOpen(isOpen ? null : g.id))} aria-expanded={single ? undefined : isOpen}
                className="flex w-full items-center gap-3 py-3.5 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500">
                <CategoryIcon category={g.categories[0]} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-slate-900">{g.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {onlyPending ? <span className="text-blue-700">Pendiente de cobrar</span>
                      : <>{text}{pendingSum > 0 && <span className="text-blue-700"> · {eur(pendingSum, 0)} previsto</span>}</>}
                  </span>
                </span>
                {/* La cifra hace de semáforo: rojo si te has pasado, ámbar si vas rápido, neutro si vas bien. */}
                <span className="shrink-0 text-right">
                  <b className={`amount block text-[15px] font-semibold tabular-nums ${onlyPending ? "text-blue-700" : pace === "pasado" ? "text-rose-700" : pace === "alto" ? "text-amber-700" : "text-slate-900"}`}>{eur(onlyPending ? pendingSum : s.now, 0)}</b>
                  <span className="amount block text-[11px] tabular-nums text-slate-500">{s.goal !== null ? `de ${eur(s.goal, 0)}` : avgMonth > 0 ? `~${eur(avgMonth, 0)} al mes` : ""}</span>
                </span>
              </button>

              <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <div className="mb-3 ml-12">
                    <ul>
                      {cats.map(({ c, now, d }) => (
                        <li key={c}>
                          <button type="button" onClick={() => toSheet(g.id, c)} className="flex w-full items-center gap-3 py-2.5 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-slate-800">{categoryLabel(c)}</span>
                              {pendingOf(c) > 0 ? (
                                <span className="flex items-center gap-1 truncate text-xs text-blue-700">
                                  <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                  {now > 0 ? `${eur(pendingOf(c), 2)} previsto` : "Previsto, sin cobrar"}
                                </span>
                              ) : d && (
                                <span className={`block truncate text-xs ${d.state === "estable" ? "text-slate-500" : d.state === "mejor" ? "text-emerald-700" : "text-amber-700"}`}>
                                  {d.state === "estable" ? "Igual que el mes pasado" : d.state === "mejor" ? "Menos que el mes pasado" : "Más que el mes pasado"}
                                </span>
                              )}
                            </span>
                            <span className={`amount shrink-0 text-sm font-semibold tabular-nums ${now <= 0 && pendingOf(c) > 0 ? "text-blue-700" : "text-slate-900"}`}>{eur(now <= 0 && pendingOf(c) > 0 ? pendingOf(c) : now, 2)}</span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                          </button>
                        </li>
                      ))}
                      {!cats.length && <li className="py-2.5 text-sm text-slate-500">Sin gastos este mes.</li>}
                    </ul>
                    {(() => { const x = g.categories.reduce((t, c) => t + (plan.totals?.extrasNow?.[c] ?? 0), 0); return x > 0 ? <Link href="/finanzas/extraordinarios" className="amount block pb-1 text-xs text-slate-500 hover:text-slate-700">Además, {eur(x, 2)} en extraordinarios, aparte. <span className="font-medium text-blue-700">Verlos ›</span></Link> : null; })()}
                    <button type="button" onClick={() => toSheet(g.id)} className="mt-1 inline-flex items-center gap-0.5 py-1.5 text-sm font-medium text-blue-700 hover:underline">
                      Ver todos los movimientos<ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => setAdding(true)} className="mt-1 inline-flex items-center gap-1.5 py-3 text-[15px] font-medium text-blue-600">
        <Plus className="h-5 w-5" /> Añadir gasto
      </button>
      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} />
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
        <Link href="/finanzas/extraordinarios" className="amount mt-2 block break-words text-xs text-slate-500 hover:text-slate-700">
          Además, {eur(extrasTotal, 0)} en extraordinarios ({extras.slice(0, 2).map((e) => (e.label.length > 22 ? `${e.label.slice(0, 22).trim()}…` : e.label)).join(", ")}{extras.length > 2 ? "…" : ""}), aparte de la línea. <span className="font-medium text-blue-700">Verlos ›</span>
        </Link>
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
type NextItem = { id: string; title: string; amount: number; date: string; category: string; source: "repite" | "previsto"; txId?: string };

const monthOf = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-ES", { month: "long", timeZone: "UTC" });
const shortDayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");

/**
 * Gráfico del mes que viene: lo ya comprometido (lo que se repite y tus previstos) acumulado día a día, en
 * discontinuo porque aún no ha pasado, y en gris el último mes completo como referencia de un mes normal.
 */
function NextChart({ plan }: { plan: Plan }) {
  const next = plan.next;
  if (!next) return null;
  const days = Math.max(1, Math.round((Date.parse(`${next.cycle.end}T00:00:00Z`) - Date.parse(`${next.cycle.start}T00:00:00Z`)) / 86_400_000) + 1);
  const daily = Array(days).fill(0) as number[];
  for (const i of next.items) {
    const d = Math.round((Date.parse(`${i.date}T00:00:00Z`) - Date.parse(`${next.cycle.start}T00:00:00Z`)) / 86_400_000);
    if (d >= 0 && d < days) daily[d] += i.amount;
  }
  const cum = daily.map((_, i) => daily.slice(0, i + 1).reduce((t, v) => t + v, 0));
  const total = cum[cum.length - 1] ?? 0;
  const prevLen = Math.max(0, ...Object.values(plan.daily?.prev ?? {}).map((r) => r.length));
  const prev = prevLen ? cumulative(plan.daily?.prev ?? {}, null, prevLen) : [];
  const income = plan.budget?.income ?? null;
  const W = 340, H = 170, pad = { l: 4, r: 4, t: 10, b: 18 };
  const top = Math.max(1, total, prev[prev.length - 1] ?? 0) * 1.08;
  const x = (i: number, n = days) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / top) * (H - pad.t - pad.b);
  const path = (vals: number[], n = days) => vals.map((v, i) => `${i ? "L" : "M"}${x(i, n).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  // Escalones: el gasto comprometido sube de golpe el día que toca.
  const step = cum.map((v, i) => `${i ? `L${x(i).toFixed(1)},${y(cum[i - 1]).toFixed(1)} ` : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div>
      <p className="text-sm text-slate-500">Ya comprometido para {monthOf(next.cycle.end)}</p>
      <p className="amount mt-0.5 text-[30px] font-semibold leading-none tracking-tight text-slate-900">{eur(total, 0)}</p>
      <p className="amount mt-1.5 text-sm font-medium text-slate-600">
        {income !== null ? `De ${eur(income, 0)} que sueles cobrar, te quedarían ${eur(income - total, 0)} para todo lo demás` : "Lo que se repite y tus previstos de ese mes"}
      </p>
      {next.cancelled.length > 0 && (
        <p className="amount mt-1 text-sm font-medium text-emerald-700">
          Has cancelado {next.cancelled.length} {next.cancelled.length === 1 ? "gasto" : "gastos"}: {eur(next.cancelled.reduce((t, c) => t + c.amount, 0), 2)} menos al mes
        </p>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block h-auto w-full" role="img" aria-label={`Comprometido para ${monthOf(next.cycle.end)}: ${eur(total, 0)}`}>
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#e2e8f0" />
        {prev.length > 1 && <path d={path(prev, prev.length)} fill="none" stroke="#cbd5e1" strokeWidth={2} strokeLinejoin="round" />}
        <path d={step} fill="none" stroke="#3478f6" strokeWidth={3} strokeDasharray="5 5" strokeLinejoin="round" strokeLinecap="round" />
        <text x={pad.l} y={H - 3} fontSize="10" fill="#94a3b8">{shortDayOf(next.cycle.start)}</text>
        <text x={W - pad.r} y={H - 3} fontSize="10" fill="#94a3b8" textAnchor="end">{shortDayOf(next.cycle.end)}</text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-[3px] border-dashed border-[#3478f6]" />Comprometido</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-slate-300" />Último mes completo</span>
      </div>
    </div>
  );
}

/** Lo que has cancelado: en gris, tachado, «Cancelado», y el importe en verde (lo que ya no gastas). */
function CancelledList({ items, flush = false }: { items: { key: string; title: string; amount: number }[]; flush?: boolean }) {
  return (
    <ul className={flush ? "" : "mb-3 ml-12"}>
      {items.map((c) => (
        <li key={c.key} className="flex items-center gap-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-slate-400 line-through">{c.title}</span>
            <span className="block truncate text-xs text-slate-400">Cancelado</span>
          </span>
          <span className="amount shrink-0 text-sm font-semibold tabular-nums text-emerald-700">−{eur(c.amount, 2)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Lista del mes que viene: funciona igual que la de este mes. Cada grupo con lo comprometido; uno de una sola
 * categoría abre su hoja (con lo previsto y lo que se repite, en azul, arriba); uno de varias se despliega por
 * categorías y «Ver todos los movimientos».
 */
function NextGroups({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const next = plan.next;
  if (!next) return null;
  const monthName = monthOf(next.cycle.end);
  const [adding, setAdding] = useState(false);
  const toSheet = (id: string, cat?: string) => router.push(`/finanzas/grupo/${id}${cat ? `?categoria=${encodeURIComponent(cat)}` : ""}`);
  const inGroups = new Set(plan.groups.flatMap((g) => g.categories));
  const loose = next.items.filter((i) => !inGroups.has(i.category));
  const looseGone = next.cancelled.filter((c) => !inGroups.has(c.category));
  const count = (n: number) => (n ? `${n} ${n === 1 ? "gasto comprometido" : "gastos comprometidos"}` : "Nada comprometido todavía");
  return (
    <div className="pb-2">
      <h2 className="text-sm font-medium text-slate-500">Tus grupos en {monthName}</h2>
      <ul className="mt-1 divide-y divide-slate-100">
        {/* Solo los grupos con algo comprometido (o cancelado): los que están a 0 no aportan. */}
        {plan.groups.filter((g) => g.categories.length && (next.items.some((i) => g.categories.includes(i.category)) || next.cancelled.some((c) => g.categories.includes(c.category)))).map((g) => {
          const items = next.items.filter((i) => g.categories.includes(i.category));
          const amount = items.reduce((t, i) => t + i.amount, 0);
          const gone = next.cancelled.filter((c) => g.categories.includes(c.category));
          const single = g.categories.length <= 1;
          const isOpen = !single && open === g.id;
          const cats = g.categories.map((c) => ({ c, items: items.filter((i) => i.category === c) })).filter((x) => x.items.length)
            .sort((a, b) => b.items.reduce((t, i) => t + i.amount, 0) - a.items.reduce((t, i) => t + i.amount, 0));
          return (
            <li key={g.id}>
              <button type="button" onClick={() => (single ? toSheet(g.id) : setOpen(isOpen ? null : g.id))} aria-expanded={single ? undefined : isOpen}
                className="flex w-full items-center gap-3 py-3.5 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500">
                <CategoryIcon category={g.categories[0]} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-slate-900">{g.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {count(items.length)}
                    {gone.length > 0 && <span className="amount text-emerald-700"> · {gone.length === 1 ? "1 cancelado" : `${gone.length} cancelados`}, −{eur(gone.reduce((t, c) => t + c.amount, 0), 2)}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <b className="amount block text-[15px] font-semibold tabular-nums text-slate-900">{eur(amount, 0)}</b>
                  {g.goal !== null && <span className="amount block text-[11px] tabular-nums text-slate-500">de {eur(g.goal, 0)}</span>}
                </span>
              </button>
              {/* Lo cancelado, en gris y con lo que ya no gastas en verde (también en grupos de una sola categoría). */}
              {gone.length > 0 && (single || !isOpen) && <CancelledList items={gone} />}
              <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <div className="mb-3 ml-12">
                    <ul>
                      {cats.map(({ c, items: ci }) => (
                        <li key={c}>
                          <button type="button" onClick={() => toSheet(g.id, c)} className="flex w-full items-center gap-3 py-2.5 text-left">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-slate-800">{categoryLabel(c)}</span>
                              <span className="block truncate text-xs text-slate-500">{count(ci.length)}</span>
                            </span>
                            <span className="amount shrink-0 text-sm font-semibold tabular-nums text-slate-900">{eur(ci.reduce((t, i) => t + i.amount, 0), 2)}</span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                          </button>
                        </li>
                      ))}
                      {!cats.length && <li className="py-2.5 text-sm text-slate-500">Nada comprometido todavía.</li>}
                    </ul>
                    {gone.length > 0 && <CancelledList items={gone} flush />}
                    <button type="button" onClick={() => toSheet(g.id)} className="mt-1 inline-flex items-center gap-0.5 py-1.5 text-sm font-medium text-blue-700 hover:underline">
                      Ver todos los movimientos<ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {(loose.length > 0 || looseGone.length > 0) && (
          <li>
            <button type="button" onClick={() => setOpen(open === "otros" ? null : "otros")} aria-expanded={open === "otros"} className="flex w-full items-center gap-3 py-3.5 text-left">
              <CategoryIcon category="otros_gastos" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-slate-500">Otros gastos</span>
                <span className="block truncate text-xs text-slate-400">Sin grupo · {count(loose.length)}</span>
              </span>
              <b className="amount shrink-0 text-[15px] font-semibold tabular-nums text-slate-500">{eur(loose.reduce((t, i) => t + i.amount, 0), 0)}</b>
            </button>
            {open === "otros" && (
              <ul className="mb-3 ml-12">
                {loose.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-800">{i.title}</span>
                      <span className="block truncate text-xs text-slate-500">{shortDayOf(i.date)} · {i.source === "repite" ? "se repite" : "previsto"}</span>
                    </span>
                    <span className="amount shrink-0 text-sm font-semibold tabular-nums text-slate-900">{eur(i.amount, 2)}</span>
                  </li>
                ))}
              </ul>
            )}
            {looseGone.length > 0 && <CancelledList items={looseGone} />}
          </li>
        )}
      </ul>
      {!next.items.length && <p className="py-2 text-sm text-slate-500">Aún no hay nada apuntado para {monthName}. Marca «Se repite» en tus recibos o añade un gasto con fecha de {monthName}.</p>}
      <button type="button" onClick={() => setAdding(true)} className="mt-1 inline-flex items-center gap-1.5 py-3 text-[15px] font-medium text-blue-600">
        <Plus className="h-5 w-5" /> Añadir gasto
      </button>
      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} defaultDate={next.cycle.start} />
    </div>
  );
}

/**
 * Inicio: arriba el gráfico, que se desliza a la izquierda para ver el mes que viene (puntos debajo); la lista de
 * abajo no se desliza, pero cambia con el mes que se ve.
 */
export function HomePlan() {
  const { data, error } = useFinance<Plan>("plan");
  const pager = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  // Al volver de una hoja, se vuelve al mes que se estaba mirando (en esta sesión).
  useEffect(() => {
    let saved = 0;
    try { saved = window.sessionStorage.getItem(PAGE_KEY) === "1" ? 1 : 0; } catch { /* ignorar */ }
    if (!saved || !data) return;
    const el = pager.current;
    if (el) { el.scrollLeft = el.clientWidth; setPage(1); }
  }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { window.sessionStorage.setItem(PAGE_KEY, String(page)); } catch { /* ignorar */ } }, [page]);
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  const go = (i: number) => { const el = pager.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" }); };
  const nextName = data?.next ? monthOf(data.next.cycle.end) : "el mes que viene";
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
      <section className={`${card} ${flat} min-w-0 overflow-hidden py-4 sm:py-5`}>
        <div ref={pager} onScroll={(e) => { const el = e.currentTarget; setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="w-full shrink-0 snap-start px-4 sm:px-5">{data ? <SpendChart plan={data} /> : <SkeletonList rows={3} />}</div>
          <div className="w-full shrink-0 snap-start px-4 sm:px-5">{data ? <NextChart plan={data} /> : <SkeletonList rows={3} />}</div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-2" role="tablist" aria-label="Mes">
          {[0, 1].map((i) => (
            <button key={i} type="button" role="tab" aria-selected={page === i} aria-label={i === 0 ? "Este mes" : nextName} onClick={() => go(i)}
              className={`h-2 rounded-full transition-all ${page === i ? "w-5 bg-slate-700" : "w-2 bg-slate-300"}`} />
          ))}
        </div>
      </section>
      <section className={`${card} ${flat} min-w-0 overflow-hidden px-4 pt-4 sm:px-5 sm:pt-5`}>
        {page === 0 ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium text-slate-500">Tus grupos</h2>
              <Link href="/finanzas/plan" className="inline-flex items-center text-sm font-medium text-blue-700 hover:underline">Mi plan<ChevronRight className="h-4 w-4" /></Link>
            </div>
            <div className="mt-1">{data ? <GoalsGlance plan={data} /> : <SkeletonList rows={4} />}</div>
          </>
        ) : data ? <NextGroups plan={data} /> : <SkeletonList rows={4} />}
      </section>
    </div>
  );
}
