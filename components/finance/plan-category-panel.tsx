"use client";
// Hojas de gasto (no son secciones): una categoría (/finanzas/categoria/<clave>) o un grupo (/finanzas/grupo/<id>,
// con pills para quedarse con una de sus categorías). Entran desde la derecha; en la cabecera de la app, la flecha
// para volver, el nombre y, a la derecha, el importe y el ciclo que se está viendo: al hacer scroll y entrar en un
// ciclo anterior, cambian. Debajo de la cabecera, la evolución de los últimos 6 meses en una línea suave.
// Al tocar un movimiento se edita con la misma ventana que en Movimientos
// (movement-detail.tsx); si cambia de categoría, sale de la lista y, al volver, la cifra del grupo ya está al día.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import type { planView } from "@/lib/finance/service";
import { categoryLabel } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useFinance } from "./api";
import { MovementRowButton, type Item, type List } from "./movement-edit";
import { MovementDetailSheet } from "./movement-detail";
import { TrendChart, type TrendPoint } from "./trend-chart";
import { PlannedList } from "./planned";
import { OTROS_SUB } from "./home-plan";

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
  // Se puede llegar ya filtrado por una categoría (?categoria=…), p. ej. tocándola en «Tus grupos» de Inicio.
  const params = useSearchParams();
  const [only, setOnly] = useState<string | null>(() => { const c = params.get("categoria"); return c && categories.includes(c) ? c : null; });
  // En un grupo de una sola categoría, las pills son sus subcategorías (OTROS_SUB = lo que no tiene).
  const [onlySub, setOnlySub] = useState<string | null>(() => (categories.length === 1 ? params.get("sub") : null));
  // El mes del que vienes en Inicio: este o el siguiente (lo previsto de arriba es de ese mes).
  const nextMode = params.get("mes") === "siguiente";
  const cats = only ? [only] : categories;
  const subOk = (sub?: string | null) => onlySub === null || (sub ?? "").trim() === (onlySub === OTROS_SUB ? "" : onlySub);
  const catsKey = `${cats.join(",")}|${onlySub ?? ""}`;
  const plan = useFinance<Plan>("plan");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [visible, setVisible] = useState<string | null>(null);

  // Movimientos de la hoja: gastos de cuentas incluidas de sus categorías (o, en la de extraordinarios, todos los
  // marcados como extraordinarios).
  const pick = (t: Item) => !t.excluded && t.kind === "gasto" && t.amount < 0 && (extrasOnly ? t.extraordinary : cats.includes(t.category) && subOk(t.subcategory));

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

  // Subcategorías (grupos de una categoría) con gasto en los últimos meses, para las pills; «Otros» al final.
  const subPills = useMemo(() => {
    if (categories.length !== 1 || extrasOnly || !list.data || !plan.data) return [];
    const from = plan.data.cycles[Math.min(5, plan.data.cycles.length - 1)]?.start ?? "";
    const totals = new Map<string, number>();
    for (const t of list.data.items) if (!t.excluded && t.kind === "gasto" && t.amount < 0 && t.category === categories[0] && (t.imputedDate ?? t.date) >= from) {
      const k = (t.subcategory ?? "").trim() || OTROS_SUB;
      totals.set(k, (totals.get(k) ?? 0) - t.amount);
    }
    const named = [...totals.entries()].filter(([k]) => k !== OTROS_SUB).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return named.length ? [...named, ...(totals.has(OTROS_SUB) ? [OTROS_SUB] : [])] : [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, plan.data, categories.join(",")]);
  const subLabel = (k: string) => (k === OTROS_SUB ? "Otros" : k);

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
      let current = nextMode ? "siguiente" : sections[0].start;
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

  // Arriba, en azul, solo lo que falta por cobrar este mes; abajo, el historial entero (también los cargos que se
  // repiten: son pagos ya hechos y no salen arriba).

  const error = list.error ?? plan.error;
  const active = sections.find((s) => s.start === visible) ?? sections[0];
  // Lo de arriba (en azul y los cancelados) es del mes del que vienes: este (lo que falta por cobrar) o el siguiente.
  const inScope = (x: { category: string; subcategory?: string | null }) => cats.includes(x.category) && subOk(x.subcategory);
  const nextCycle = plan.data?.next?.cycle ?? null;
  const inNext = (d: string) => !!nextCycle && d >= nextCycle.start && d <= nextCycle.end;
  const scope = !plan.data || extrasOnly ? null : nextMode ? {
    items: (plan.data.planned ?? []).filter((x) => inNext(x.date) && inScope({ ...x, subcategory: null })),
    repeats: (plan.data.next?.items ?? []).filter((x) => x.source === "repite" && inScope(x)),
    cancelled: (plan.data.next?.cancelled ?? []).filter(inScope),
  } : {
    items: (plan.data.planned ?? []).filter((x) => !inNext(x.date) && inScope({ ...x, subcategory: null })),
    repeats: (plan.data.pending ?? []).filter(inScope).map((x) => ({ ...x, thisMonth: true })),
    cancelled: (plan.data.cancelledNow ?? []).filter(inScope),
  };
  const atNext = nextMode && (visible === null || visible === "siguiente");
  // El mes en curso del gráfico suma también lo previsto (aún sin cobrar), marcado como tal.
  const plannedNow = !plan.data || extrasOnly ? 0 : Math.round([
    ...(plan.data.planned ?? []).filter((x) => !inNext(x.date) && inScope({ ...x, subcategory: null })),
    ...(plan.data.pending ?? []).filter(inScope),
  ].reduce((t, x) => t + x.amount, 0) * 100) / 100;
  const trendShown = trend.map((p) => (p.current && plannedNow > 0 ? { ...p, value: Math.round((p.value + plannedNow) * 100) / 100, planned: plannedNow } : p));
  const nextTotal = scope ? Math.round([...scope.items, ...scope.repeats].reduce((t, x) => t + x.amount, 0) * 100) / 100 : 0;

  return (
    <div className="mx-auto max-w-xl animate-in fade-in-0 slide-in-from-right-10 pb-6 duration-200">
      {/* El nombre va en la cabecera de la app; a su derecha, el importe y el ciclo que se está viendo (cambian con el scroll). */}
      <HeaderSlots title={only ? `${title} · ${categoryLabel(only)}` : onlySub ? `${title} · ${subLabel(onlySub)}` : title}
        total={atNext ? nextTotal : active ? active.total : null} label={atNext ? nextCycle?.label ?? "" : active?.label ?? ""} extra={atNext ? 0 : active?.extra ?? 0} />

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

      {subPills.length > 0 && (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 pt-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
          {[null, ...subPills].map((k) => (
            <button key={k ?? "todo"} type="button" onClick={() => setOnlySub(k)} aria-pressed={onlySub === k}
              className={`h-8 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors ${onlySub === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {k ? subLabel(k) : "Todo"}
            </button>
          ))}
        </div>
      )}

      {list.data && plan.data && (
        <section className="border-b border-slate-100 py-4" aria-label="Evolución de los últimos meses">
          <p className="px-1 text-xs text-slate-500">Últimos meses</p>
          <div className="mt-1"><TrendChart points={trendShown} title={`Gasto en ${only ? categoryLabel(only) : title}`} /></div>
        </section>
      )}

      {scope && (
        <section>
          {nextMode && nextCycle && <p className="px-1 pt-3 text-xs font-medium text-slate-500">{nextCycle.label}</p>}
          <PlannedList className="pt-1" items={scope.items} repeats={scope.repeats} cancelled={scope.cancelled} onOpenRepeat={(txId) => setViewingId(txId)} />
          {nextMode && !scope.items.length && !scope.repeats.length && !scope.cancelled.length && <p className="py-4 text-center text-sm text-slate-400">Nada comprometido para {nextCycle?.label ?? "el mes que viene"}.</p>}
        </section>
      )}

      {error && !list.data ? <ErrorNote>{error}</ErrorNote>
        : !list.data || !plan.data ? <SkeletonList rows={6} />
        : sections.every((s) => s.rows.length === 0) ? <p className="py-10 text-center text-sm text-slate-400">No hay movimientos.</p>
        : sections.map((s, i) => ({ s, i, shown: s.rows })).filter(({ i, shown }) => i === 0 || shown.length > 0).map(({ s, i, shown }) => (
          <section key={s.start} data-cycle={s.start}>
            {(i > 0 || nextMode) && (
              <p className="flex justify-between bg-slate-50 px-1 py-1.5 text-xs text-slate-500">
                <span>{s.label}</span>
                <span className="tabular-nums">{eur(s.total, 2)}{s.extra > 0 ? ` (+${eur(s.extra, 2)} extra)` : ""}</span>
              </p>
            )}
            {shown.length === 0
              ? <p className="py-6 text-center text-sm text-slate-400">{s.rows.length ? "Nada en este ciclo todavía." : "Nada en este ciclo todavía."}</p>
              : (
                <ul className="divide-y divide-slate-100">
                  {shown.map((t) => (
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
