"use client";
// Hojas de gasto (no son secciones): una categoría (/finanzas/categoria/<clave>) o un grupo (/finanzas/grupo/<id>,
// con pills para quedarse con una de sus categorías). Entran desde la derecha; en la cabecera de la app, la flecha
// para volver, el nombre y, a la derecha, el importe y el ciclo que se está viendo: al hacer scroll y entrar en un
// ciclo anterior, cambian. Debajo de la cabecera, la evolución de los últimos 6 meses en una línea suave.
// Al tocar un movimiento se edita con la misma ventana que en Movimientos
// (movement-detail.tsx); si cambia de categoría, sale de la lista y, al volver, la cifra del grupo ya está al día.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import type { planView } from "@/lib/finance/service";
import { categoryLabel } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useFinance } from "./api";
import { MovementRowButton, label, type Item, type List } from "./movement-edit";
import { MovementDetailSheet } from "./movement-detail";
import { TrendChart, type TrendPoint } from "./trend-chart";
import { PlannedList } from "./planned";

type Plan = Awaited<ReturnType<typeof planView>>;
type Cycle = Plan["cycles"][number];
type Section = Cycle & { rows: Item[]; total: number; extra: number };

const scroller = () => document.querySelector<HTMLElement>("main");

/** Lo que la hoja pone en la cabecera de la app (móvil y escritorio): el nombre y, a la derecha, importe y ciclo. */
function HeaderSlots({ title, total, label, extra }: { title: string; total: number | null; label: string; extra: number }) {
  const [slots, setSlots] = useState<{ title: HTMLElement[]; right: HTMLElement[] }>({ title: [], right: [] });
  useEffect(() => {
    const get = (ids: string[]) => ids.map((id) => document.getElementById(id)).filter((x): x is HTMLElement => !!x);
    setSlots({ title: get(["finance-header-title", "finance-header-title-desktop"]), right: get(["finance-header-right", "finance-header-right-desktop"]) });
  }, []);
  const right = total === null ? null : (
    <>
      <p className="amount text-[17px] font-semibold leading-tight tabular-nums text-slate-900">{eur(total, 2)}</p>
      <p className="text-[11px] leading-tight text-slate-500">{label}{extra > 0 ? ` · +${eur(extra, 0)} extra` : ""}</p>
    </>
  );
  return (
    <>
      {slots.title.map((el) => createPortal(<>{title}</>, el, `t-${el.id}`))}
      {right && slots.right.map((el) => createPortal(right, el, `r-${el.id}`))}
    </>
  );
}

/** Hoja de una categoría. */
export function PlanCategoryPanel({ categoryKey }: { categoryKey: string }) {
  return <SpendSheet title={categoryLabel(categoryKey)} categories={[categoryKey]} />;
}

/** Hoja de los extraordinarios: lo que marcaste como extraordinario, de todas las categorías. */
export function ExtrasPanel() {
  return <SpendSheet title="Extraordinarios" categories={[]} extrasOnly />;
}

/** Hoja de un grupo de Mi plan: todos sus movimientos, con pills para ver solo una categoría. */
export function GroupPanel({ groupId }: { groupId: string }) {
  const plan = useFinance<Plan>("plan");
  if (plan.error && !plan.data) return <ErrorNote>{plan.error}</ErrorNote>;
  if (!plan.data) return <SkeletonList rows={6} />;
  const g = plan.data.groups.find((x) => x.id === groupId);
  if (!g) return <p className="py-10 text-center text-sm text-slate-500">Este grupo ya no existe.</p>;
  return <SpendSheet title={g.name} categories={g.categories} groupId={g.id} />;
}

function SpendSheet({ title, categories, groupId, extrasOnly = false }: { title: string; categories: string[]; groupId?: string; extrasOnly?: boolean }) {
  const list = useFinance<List>("transactions?all=1");
  // Pill elegida (una categoría del grupo) o null = todas.
  const [only, setOnly] = useState<string | null>(null);
  const cats = only ? [only] : categories;
  const catsKey = cats.join(",");
  const plan = useFinance<Plan>("plan");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [visible, setVisible] = useState<string | null>(null);

  // Movimientos de la hoja: gastos de cuentas incluidas de sus categorías (o, en la de extraordinarios, todos los
  // marcados como extraordinarios).
  const pick = (t: Item) => !t.excluded && t.kind === "gasto" && t.amount < 0 && (extrasOnly ? t.extraordinary : cats.includes(t.category));

  // El detalle empieza arriba del todo (el contenedor de scroll es el mismo que el de la lista de grupos).
  useEffect(() => { const el = scroller(); if (el) el.scrollTop = 0; }, []);

  // Cargos de esta categoría (gastos de cuentas incluidas), agrupados por ciclo, el más reciente primero.
  const sections = useMemo<Section[]>(() => {
    if (!list.data || !plan.data) return [];
    const rows = list.data.items.filter(pick);
    return plan.data.cycles.map((c) => {
      // Cada gasto cuenta en su fecha imputada si se la cambiaste («Cambiar fecha»), no en la del cargo.
      const when = (t: (typeof rows)[number]) => t.imputedDate ?? t.date;
      const mine = rows.filter((t) => when(t) >= c.start && when(t) <= c.end).sort((a, b) => when(b).localeCompare(when(a)));
      // El total no cuenta los extraordinarios (igual que Mi plan e Inicio); van aparte.
      const sum = (xs: typeof mine) => Math.round(xs.reduce((s, t) => s - t.amount, 0) * 100) / 100;
      return extrasOnly ? { ...c, rows: mine, total: sum(mine), extra: 0 }
        : { ...c, rows: mine, total: sum(mine.filter((t) => !t.extraordinary)), extra: sum(mine.filter((t) => t.extraordinary)) };
    }).filter((s, i) => i === 0 || s.rows.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, plan.data, catsKey]);

  // Evolución de los últimos 6 meses (sin extraordinarios), del más antiguo al actual (en curso).
  const trend = useMemo<TrendPoint[]>(() => {
    if (!list.data || !plan.data) return [];
    const rows = list.data.items.filter((t) => pick(t) && (extrasOnly || !t.extraordinary));
    const when = (t: (typeof rows)[number]) => t.imputedDate ?? t.date;
    const month = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-ES", { month: "short", timeZone: "UTC" }).replace(".", "");
    return plan.data.cycles.slice(0, 6).map((c, i) => ({
      label: month(c.end),
      value: Math.round(rows.filter((t) => when(t) >= c.start && when(t) <= c.end).reduce((x, t) => x - t.amount, 0) * 100) / 100,
      current: i === 0,
    })).reverse();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, plan.data, catsKey]);

  // Categorías del grupo con gasto en los últimos meses, para las pills (de más a menos gasto).
  const pills = useMemo(() => {
    if (categories.length < 2 || !list.data || !plan.data) return [];
    const from = plan.data.cycles[Math.min(5, plan.data.cycles.length - 1)]?.start ?? "";
    const totals = new Map<string, number>();
    for (const t of list.data.items) if (!t.excluded && t.kind === "gasto" && t.amount < 0 && categories.includes(t.category) && (t.imputedDate ?? t.date) >= from) totals.set(t.category, (totals.get(t.category) ?? 0) - t.amount);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, plan.data, categories.join(",")]);

  // Ciclo que se ve bajo la cabecera fija: el último cuyo comienzo ya ha pasado por debajo de ella.
  useEffect(() => {
    const el = scroller();
    if (!el || !sections.length) return;
    const onScroll = () => {
      const limit = el.getBoundingClientRect().top + 4;
      let current = sections[0].start;
      for (const node of el.querySelectorAll<HTMLElement>("[data-cycle]")) {
        if (node.getBoundingClientRect().top > limit) break;
        current = node.dataset.cycle ?? current;
      }
      setVisible(current);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [sections]);

  // Cabecera de la hoja: la referencia (tu objetivo o lo que sueles gastar), lo que más pesa este mes y el acceso
  // a Mi plan para cambiarlo.
  const ownerGroup = extrasOnly || !plan.data ? null
    : plan.data.groups.find((g) => (groupId ? g.id === groupId : g.categories.includes(categories[0] ?? "")));
  const goal = !only && ownerGroup && (groupId || ownerGroup.categories.length === 1) ? ownerGroup.goal : null;
  const closedTrend = trend.filter((p) => !p.current).slice(-3);
  const usual = closedTrend.length ? Math.round(closedTrend.reduce((t, p) => t + p.value, 0) / closedTrend.length) : null;
  const top = useMemo(() => {
    const cur = sections[0]?.rows.filter((t) => extrasOnly || !t.extraordinary) ?? [];
    const by = new Map<string, { n: number; amount: number }>();
    for (const t of cur) { const k = label(t); const x = by.get(k) ?? { n: 0, amount: 0 }; by.set(k, { n: x.n + 1, amount: x.amount - t.amount }); }
    return [...by.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 2);
  }, [sections, extrasOnly]);
  const openInPlan = () => { if (ownerGroup) { try { window.sessionStorage.setItem("crs-finance:plan-open", ownerGroup.id); } catch { /* ignorar */ } } };

  const error = list.error ?? plan.error;
  const active = sections.find((s) => s.start === visible) ?? sections[0];

  return (
    <div className="mx-auto max-w-xl animate-in fade-in-0 slide-in-from-right-10 pb-6 duration-200">
      {/* El nombre va en la cabecera de la app; a su derecha, el importe y el ciclo que se está viendo (cambian con el scroll). */}
      <HeaderSlots title={only ? `${title} · ${categoryLabel(only)}` : title} total={active ? active.total : null} label={active?.label ?? ""} extra={active?.extra ?? 0} />

      {pills.length > 1 && (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 pt-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
          {[null, ...pills].map((k) => (
            <button key={k ?? "todo"} type="button" onClick={() => setOnly(k)} aria-pressed={only === k}
              className={`h-8 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors ${only === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {k ? categoryLabel(k) : "Todo"}
            </button>
          ))}
        </div>
      )}

      {list.data && plan.data && (
        <section className="space-y-1.5 px-1 pt-3 text-sm" aria-label="Resumen">
          <p className="amount text-slate-700">
            {goal !== null ? <>Tu objetivo: <b className="font-semibold text-slate-900">{eur(goal, 0)} al mes</b></>
              : usual !== null ? <>Sueles gastar <b className="font-semibold text-slate-900">~{eur(usual, 0)} al mes</b></>
              : "Aún no hay meses completos para comparar."}
            {goal !== null && usual !== null && <span className="text-slate-500"> · sueles ~{eur(usual, 0)}</span>}
          </p>
          {top.length > 0 && (
            <p className="amount text-slate-700">
              Lo que más pesa este mes: {top.map(([k, v], i) => (
                <span key={k}>{i > 0 && ", "}<b className="font-semibold text-slate-900">{k}</b> ({v.n} {v.n === 1 ? "vez" : "veces"}, {eur(v.amount, 0)})</span>
              ))}
            </p>
          )}
          {!extrasOnly && plan.data && (
            <Link href="/finanzas/plan" onClick={openInPlan} className="inline-flex items-center gap-0.5 text-sm font-medium text-blue-700 hover:underline">
              {ownerGroup ? (ownerGroup.goal !== null ? "Cambiar el objetivo en Mi plan" : "Ponerle objetivo en Mi plan") : "Meterla en un grupo en Mi plan"}<ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </section>
      )}

      {list.data && plan.data && (
        <section className="border-b border-slate-100 py-4" aria-label="Evolución de los últimos meses">
          <p className="px-1 text-xs text-slate-500">Últimos meses</p>
          <div className="mt-1"><TrendChart points={trend} title={`Gasto en ${only ? categoryLabel(only) : title}`} /></div>
        </section>
      )}

      {!extrasOnly && plan.data && (
        <PlannedList className="pt-1" items={(plan.data.planned ?? []).filter((x) => cats.includes(x.category))}
          repeats={(plan.data.next?.items ?? []).filter((x) => x.source === "repite" && cats.includes(x.category))}
          onOpenRepeat={(txId) => setViewingId(txId)} />
      )}

      {error && !list.data ? <ErrorNote>{error}</ErrorNote>
        : !list.data || !plan.data ? <SkeletonList rows={6} />
        : sections.every((s) => s.rows.length === 0) ? <p className="py-10 text-center text-sm text-slate-400">No hay movimientos.</p>
        : sections.map((s, i) => (
          <section key={s.start} data-cycle={s.start}>
            {i > 0 && (
              <p className="flex justify-between bg-slate-50 px-1 py-1.5 text-xs text-slate-500">
                <span>{s.label}</span>
                <span className="tabular-nums">{eur(s.total, 2)}{s.extra > 0 ? ` (+${eur(s.extra, 2)} extra)` : ""}</span>
              </p>
            )}
            {s.rows.length === 0
              ? <p className="py-6 text-center text-sm text-slate-400">Nada en este ciclo todavía.</p>
              : (
                <ul className="divide-y divide-slate-100">
                  {s.rows.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-1 py-3">
                      <MovementRowButton t={t} onClick={() => setViewingId(t.id)} />
                    </li>
                  ))}
                </ul>
              )}
          </section>
        ))}
      {/* Si se recategoriza, sale de esta lista; el detalle sigue mostrándose con sus datos al día hasta volver. */}
      <MovementDetailSheet item={list.data?.items.find((t) => t.id === viewingId) ?? null} items={list.data?.items} onClose={() => setViewingId(null)} />
    </div>
  );
}
