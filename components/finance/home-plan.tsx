"use client";
// Inicio · el gasto del mes y tus grupos (nació en el laboratorio el 23/11/2026).
// 1. Gasto acumulado del mes (sin extraordinarios) frente al mes pasado y al objetivo; pills con los grupos de gasto
//    gradual (los de recibos fijos no se siguen día a día).
// 2. Tus grupos (este mes o el que viene, igual): cada grupo se despliega por categorías o, si es de una sola, por
//    subcategorías; lo cancelado, dentro de su línea. Cada línea abre la hoja filtrada y en ese mes.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronRight, Plus } from "lucide-react";
import { categoryLabel } from "@/lib/finance/categories";
import { cumulative, deviationOf, groupSummary, isGradual, subKey, type GroupCycleTotals } from "@/lib/finance/plan";
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
  cancelledNow?: Cancel[];
  next?: { cycle: { start: string; end: string; label: string }; items: NextItem[]; cancelled: Cancel[] };
};
// Lo que Inicio recuerda en esta sesión al ir a una hoja y volver: el mes que se miraba y, de cada mes, qué grupo
// estaba desplegado y por dónde ibas.
const PAGE_KEY = "crs-finance:home-page";
const OPEN_KEY = (page: number) => `crs-finance:home-open-${page}`;
const SCROLL_KEY = (page: number) => `crs-finance:home-scroll-${page}`;
const store = {
  get: (k: string) => { try { return window.sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) window.sessionStorage.removeItem(k); else window.sessionStorage.setItem(k, v); } catch { /* ignorar */ } },
};
/** Lo que comparten las dos listas (este mes y el que viene): mismo desplegar, mismo ir a la hoja. */
type ListProps = { plan: Plan; open: string | null; toggle: (id: string, header: HTMLElement) => void; toSheet: (id: string, target?: { cat?: string; sub?: string }) => void };
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

// ── Tus grupos: la misma lista para este mes y el que viene ────────────────────────────────────

type Cancel = { key: string; title: string; amount: number; category: string; subcategory?: string | null };
/** Una línea del desplegable: una categoría (grupos de varias) o una subcategoría (grupos de una; «Otros» lo que no tiene). */
type Line = { key: string; cat: string; sub?: string; label: string; now: number; prev: number | null; pending: number; committed: number; count: number; gone: Cancel[] };
/** En la URL de la hoja, «Otros» (sin subcategoría). */
export const OTROS_SUB = "__otros";
const norm = (s?: string | null) => (s ?? "").trim();
type Mode = "now" | "next";

function linesOf(plan: Plan, cats: string[], mode: Mode): Line[] {
  const cycles = plan.history ?? [];
  const cur = cycles[0];
  const last = cycles[1] ?? null;
  const plannedNow = [
    ...(plan.planned ?? []).filter((x) => x.date >= plan.cycle.start && x.date <= plan.cycle.end).map((x) => ({ ...x, subcategory: null as string | null })),
    ...(plan.pending ?? []),
  ];
  const items = mode === "now" ? plannedNow : plan.next?.items ?? [];
  const gone: Cancel[] = mode === "now" ? plan.cancelledNow ?? [] : plan.next?.cancelled ?? [];
  // Una sola categoría: se reparte por subcategorías si hay alguna; si no, una línea con la categoría.
  let units: { cat: string; sub?: string }[] = cats.map((c) => ({ cat: c }));
  if (cats.length === 1) {
    const c = cats[0];
    const subs = new Set<string>();
    if (mode === "now") for (const r of [cur?.subAtDay, last?.subAtDay]) for (const k of Object.keys(r ?? {})) if (k.startsWith(`${c}/`) && (r?.[k] ?? 0) > 0) subs.add(k.slice(c.length + 1));
    for (const x of [...items, ...gone]) if (x.category === c) subs.add(norm(x.subcategory));
    if ([...subs].some(Boolean)) units = [...subs].map((sub) => ({ cat: c, sub }));
  }
  const match = (u: { cat: string; sub?: string }) => (x: { category: string; subcategory?: string | null }) => x.category === u.cat && (u.sub === undefined || norm(x.subcategory) === u.sub);
  return units.map((u) => {
    const m = match(u);
    const mine = items.filter(m);
    const sum = mine.reduce((t, x) => t + x.amount, 0);
    const now = u.sub === undefined ? cur?.atDay[u.cat] ?? 0 : cur?.subAtDay?.[subKey(u.cat, u.sub)] ?? 0;
    const prev = !last ? null : u.sub === undefined ? last.atDay[u.cat] ?? 0 : last.subAtDay?.[subKey(u.cat, u.sub)] ?? 0;
    return {
      key: `${u.cat}/${u.sub ?? "*"}`, cat: u.cat, sub: u.sub,
      label: u.sub === undefined ? categoryLabel(u.cat) : u.sub || "Otros",
      now, prev, pending: mode === "now" ? sum : 0, committed: mode === "next" ? sum : 0, count: mine.length, gone: gone.filter(m),
    };
  })
    // Solo lo que tiene algo este mes (gastado, previsto o cancelado): lo que está a 0 no sale.
    .filter((l) => (mode === "now" ? l.now > 0 || l.pending > 0 : l.count > 0) || l.gone.length > 0)
    .sort((a, b) => (mode === "now" ? b.now + b.pending - (a.now + a.pending) : b.committed - a.committed));
}

const countText = (n: number) => (n ? `${n} ${n === 1 ? "gasto comprometido" : "gastos comprometidos"}` : "Nada comprometido todavía");
const goneText = (gone: Cancel[]) => `${gone.length === 1 ? "1 cancelado" : `${gone.length} cancelados`}, −${eur(gone.reduce((t, c) => t + c.amount, 0), 2)}`;

/** Una línea del desplegable y, debajo, lo cancelado de esa línea (gris, tachado, el ahorro en verde). */
function LineRow({ l, mode, onOpen }: { l: Line; mode: Mode; onOpen: () => void }) {
  const active = mode === "now" ? l.now > 0 || l.pending > 0 : l.count > 0;
  const d = mode === "now" && l.prev !== null ? deviationOf(l.now, l.prev) : null;
  const blue = mode === "now" && l.now <= 0 && l.pending > 0;
  return (
    <li>
      {active && (
        <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 py-2.5 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-slate-800">{l.label}</span>
            {mode === "next" ? <span className="block truncate text-xs text-slate-500">{countText(l.count)}</span>
              : l.pending > 0 ? (
                <span className="flex items-center gap-1 truncate text-xs text-blue-700">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {l.now > 0 ? `${eur(l.pending, 2)} previsto` : "Previsto, sin cobrar"}
                </span>
              ) : d && (
                <span className={`block truncate text-xs ${d.state === "estable" ? "text-slate-500" : d.state === "mejor" ? "text-emerald-700" : "text-amber-700"}`}>
                  {d.state === "estable" ? "Igual que el mes pasado" : d.state === "mejor" ? "Menos que el mes pasado" : "Más que el mes pasado"}
                </span>
              )}
          </span>
          <span className={`amount shrink-0 text-sm font-semibold tabular-nums ${blue ? "text-blue-700" : "text-slate-900"}`}>
            {eur(mode === "next" ? l.committed : blue ? l.pending : l.now, 2)}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
        </button>
      )}
      {l.gone.map((c) => (
        <button key={c.key} type="button" onClick={onOpen} className="flex w-full items-center gap-3 py-2 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-slate-400 line-through">{c.title}</span>
            <span className="block truncate text-xs text-slate-400">Cancelado</span>
          </span>
          <span className="amount shrink-0 text-sm font-semibold tabular-nums text-emerald-700">−{eur(c.amount, 2)}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
        </button>
      ))}
    </li>
  );
}

/**
 * Tus grupos, este mes o el que viene: los dos funcionan igual. Cada grupo se despliega (los de varias categorías
 * por categoría; los de una, por subcategoría) con lo cancelado dentro de su línea, y «Ver todos los movimientos».
 * Cada línea abre la hoja ya filtrada y en el mes del que vienes.
 */
function GroupsList({ plan, mode, open, toggle, toSheet }: ListProps & { mode: Mode }) {
  const [adding, setAdding] = useState(false);
  const cycles = plan.history ?? [];
  const last = cycles[1] ?? null;
  const { day, totalDays } = plan.cycle;
  const daysLeft = totalDays - day;
  const next = plan.next;

  if (!plan.groups.length) return (
    <div className="py-6 text-center">
      <p className="text-sm text-slate-600">Agrupa tus gastos (casa, ocio, comida a domicilio…) para ver aquí a qué ritmo vas.</p>
      <Link href="/finanzas/plan" className="mt-3 inline-flex h-10 items-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700">Definir grupos</Link>
    </div>
  );
  if (mode === "next" && !next) return null;

  const groups = plan.groups.filter((g) => g.categories.length).map((g) => {
    const lines = linesOf(plan, g.categories, mode);
    const s = groupSummary({ categories: g.categories, cycles, goal: g.goal, day, totalDays });
    return { g, s, lines, ...paceOf(s, last ? sumCats(last.atDay, g.categories) : null) };
  });
  const rows = mode === "now"
    ? groups.sort((a, b) => PACE_ORDER[a.pace] - PACE_ORDER[b.pace])
    : groups.filter((r) => r.lines.length); // el mes que viene, solo los grupos con algo comprometido o cancelado
  const judged = groups.filter((r) => r.pace !== "sin_datos");
  const good = judged.filter((r) => r.pace === "bien").length;
  const headline = !judged.length ? "Aún no hay con qué compararte"
    : good === judged.length ? (judged.length === 1 ? "Vas a buen ritmo" : `Vas a buen ritmo en tus ${judged.length} grupos`)
    : `Vas a buen ritmo en ${good} de tus ${judged.length} grupos`;
  const monthName = next ? monthOf(next.cycle.end) : "";
  const inGroups = new Set(plan.groups.flatMap((g) => g.categories));
  const loose = mode === "next" && next ? next.items.filter((i) => !inGroups.has(i.category)) : [];
  const looseGone = mode === "next" && next ? next.cancelled.filter((c) => !inGroups.has(c.category)) : [];

  return (
    <div className="pb-2">
      {mode === "now" ? (
        <>
          <p className="break-words text-[22px] font-semibold leading-tight tracking-tight text-slate-900">{headline}</p>
          <p className="mt-1 text-sm text-slate-500">{daysLeft > 1 ? `Quedan ${daysLeft} días de ciclo` : daysLeft === 1 ? "Queda 1 día de ciclo" : "Último día del ciclo"}</p>
        </>
      ) : <h2 className="text-sm font-medium text-slate-500">Tus grupos en {monthName}</h2>}

      <ul className={`${mode === "now" ? "mt-3" : "mt-1"} divide-y divide-slate-100`}>
        {rows.map(({ g, s, lines, pace, text }) => {
          const isOpen = open === g.id;
          const gone = lines.flatMap((l) => l.gone);
          const pendingSum = lines.reduce((t, l) => t + l.pending, 0);
          const committed = lines.reduce((t, l) => t + l.committed, 0);
          const count = lines.reduce((t, l) => t + l.count, 0);
          const onlyPending = mode === "now" && s.now <= 0 && pendingSum > 0;
          const closed = cycles.slice(1, 4);
          const avgMonth = closed.length ? Math.round(closed.reduce((t, c) => t + g.categories.reduce((u, k) => u + (c.full[k] ?? 0), 0), 0) / closed.length) : 0;
          const extras = mode === "now" ? g.categories.reduce((t, c) => t + (plan.totals?.extrasNow?.[c] ?? 0), 0) : 0;
          const lineTarget = (l: Line) => (l.sub === undefined ? (g.categories.length > 1 ? { cat: l.cat } : {}) : { sub: l.sub || OTROS_SUB });
          return (
            <li key={g.id}>
              <button type="button" onClick={(e) => toggle(g.id, e.currentTarget)} aria-expanded={isOpen}
                className="flex w-full scroll-mt-16 items-center gap-3 py-3.5 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500">
                <CategoryIcon category={g.categories[0]} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-slate-900">{g.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {mode === "next" ? countText(count)
                      : onlyPending ? <span className="text-blue-700">Pendiente de cobrar</span>
                      : <>{text}{pendingSum > 0 && <span className="text-blue-700"> · {eur(pendingSum, 0)} previsto</span>}</>}
                    {gone.length > 0 && <span className="amount text-emerald-700"> · {goneText(gone)}</span>}
                  </span>
                </span>
                {/* Este mes la cifra hace de semáforo: rojo si te has pasado, ámbar si vas rápido, neutro si vas bien. */}
                <span className="shrink-0 text-right">
                  <b className={`amount block text-[15px] font-semibold tabular-nums ${mode === "next" ? "text-slate-900" : onlyPending ? "text-blue-700" : pace === "pasado" ? "text-rose-700" : pace === "alto" ? "text-amber-700" : "text-slate-900"}`}>
                    {eur(mode === "next" ? committed : onlyPending ? pendingSum : s.now, 0)}
                  </b>
                  <span className="amount block text-[11px] tabular-nums text-slate-500">{g.goal !== null ? `de ${eur(g.goal, 0)}` : mode === "now" && avgMonth > 0 ? `~${eur(avgMonth, 0)} al mes` : ""}</span>
                </span>
              </button>

              <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden" inert={!isOpen}>
                  <div className="mb-3 ml-12">
                    <ul>
                      {lines.map((l) => <LineRow key={l.key} l={l} mode={mode} onOpen={() => toSheet(g.id, lineTarget(l))} />)}
                      {!lines.length && <li className="py-2.5 text-sm text-slate-500">{mode === "now" ? "Sin gastos este mes." : "Nada comprometido todavía."}</li>}
                    </ul>
                    {extras > 0 && <Link href="/finanzas/extraordinarios" className="amount block pb-1 text-xs text-slate-500 hover:text-slate-700">Además, {eur(extras, 2)} en extraordinarios, aparte. <span className="font-medium text-blue-700">Verlos ›</span></Link>}
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
            <button type="button" onClick={(e) => toggle("otros", e.currentTarget)} aria-expanded={open === "otros"} className="flex w-full scroll-mt-16 items-center gap-3 py-3.5 text-left">
              <CategoryIcon category="otros_gastos" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-slate-500">Otros gastos</span>
                <span className="block truncate text-xs text-slate-400">Sin grupo · {countText(loose.length)}{looseGone.length > 0 && <span className="amount text-emerald-700"> · {goneText(looseGone)}</span>}</span>
              </span>
              <b className="amount shrink-0 text-[15px] font-semibold tabular-nums text-slate-500">{eur(loose.reduce((t, i) => t + i.amount, 0), 0)}</b>
            </button>
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open === "otros" ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden" inert={open !== "otros"}>
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
                  {looseGone.map((c) => (
                    <li key={c.key} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-400 line-through">{c.title}</span>
                        <span className="block truncate text-xs text-slate-400">Cancelado</span>
                      </span>
                      <span className="amount shrink-0 text-sm font-semibold tabular-nums text-emerald-700">−{eur(c.amount, 2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </li>
        )}
      </ul>
      {mode === "next" && next && !next.items.length && <p className="py-2 text-sm text-slate-500">Aún no hay nada apuntado para {monthName}. Marca «Se repite» en tus recibos o añade un gasto con fecha de {monthName}.</p>}
      <button type="button" onClick={() => setAdding(true)} className="mt-1 inline-flex items-center gap-1.5 py-3 text-[15px] font-medium text-blue-600">
        <Plus className="h-5 w-5" /> Añadir gasto
      </button>
      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} defaultDate={mode === "next" && next ? next.cycle.start : undefined} />
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
type NextItem = { id: string; title: string; amount: number; date: string; category: string; subcategory?: string | null; source: "repite" | "previsto"; txId?: string };

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


/**
 * Inicio: arriba el gráfico, que se desliza a la izquierda para ver el mes que viene (puntos debajo); la lista de
 * abajo no se desliza, pero cambia con el mes que se ve.
 */
export function HomePlan() {
  const { data, error } = useFinance<Plan>("plan");
  const router = useRouter();
  const pager = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<[string | null, string | null]>([null, null]);
  const [restored, setRestored] = useState(false);
  // Al volver de una hoja, en este orden: el mes que se miraba, lo desplegado en él y, con todo pintado, el scroll.
  useEffect(() => {
    if (!data || restored) return;
    const p = store.get(PAGE_KEY) === "1" ? 1 : 0;
    setOpen([store.get(OPEN_KEY(0)), store.get(OPEN_KEY(1))]);
    setPage(p);
    const el = pager.current;
    if (el && p) el.scrollLeft = el.clientWidth;
    setRestored(true);
    const y = Number(store.get(SCROLL_KEY(p)));
    store.set(SCROLL_KEY(0), null); store.set(SCROLL_KEY(1), null);
    if (y > 0) requestAnimationFrame(() => requestAnimationFrame(() => { const m = scroller(); if (m) m.scrollTop = y; }));
  }, [data, restored]);
  // Hasta haber restaurado no se guarda nada (si no, el «este mes» inicial pisaría lo guardado).
  useEffect(() => { if (restored) store.set(PAGE_KEY, String(page)); }, [page, restored]);
  useEffect(() => { if (restored) { store.set(OPEN_KEY(0), open[0]); store.set(OPEN_KEY(1), open[1]); } }, [open, restored]);
  const toggle = (id: string, header: HTMLElement) => {
    const closing = open[page] === id;
    setOpen((o) => (page === 0 ? [closing ? null : id, o[1]] : [o[0], closing ? null : id]));
    // Al cerrar un grupo largo la página encoge: se deja su cabecera a la vista para no perder dónde estabas.
    if (closing) window.setTimeout(() => header.scrollIntoView({ block: "nearest", behavior: "smooth" }), 320);
  };
  // La hoja se abre ya filtrada (categoría o subcategoría) y en el mes del que vienes.
  const toSheet = (id: string, target: { cat?: string; sub?: string } = {}) => {
    store.set(SCROLL_KEY(page), String(scroller()?.scrollTop ?? 0));
    const q = new URLSearchParams();
    if (target.cat) q.set("categoria", target.cat);
    if (target.sub) q.set("sub", target.sub);
    if (page === 1) q.set("mes", "siguiente");
    const qs = q.toString();
    router.push(`/finanzas/grupo/${id}${qs ? `?${qs}` : ""}`);
  };
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
            <div className="mt-1">{data ? <GroupsList plan={data} mode="now" open={open[0]} toggle={toggle} toSheet={toSheet} /> : <SkeletonList rows={4} />}</div>
          </>
        ) : data ? <GroupsList plan={data} mode="next" open={open[1]} toggle={toggle} toSheet={toSheet} /> : <SkeletonList rows={4} />}
      </section>
    </div>
  );
}
