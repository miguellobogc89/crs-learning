"use client";
// Hoja de una categoría (/finanzas/categoria/<clave>; no es una sección). Entra desde la derecha; en la cabecera de
// la app, la flecha para volver, el nombre de la categoría y, a la derecha, el importe y el ciclo que se está viendo:
// al hacer scroll y entrar en un ciclo anterior, cambian. Debajo de la cabecera, la evolución de los últimos 6 meses en una línea suave.
// Al tocar un movimiento se edita con la misma ventana que en Movimientos
// (movement-detail.tsx); si cambia de categoría, sale de la lista y, al volver, la cifra del grupo ya está al día.
import { useEffect, useMemo, useState } from "react";
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

type Plan = Awaited<ReturnType<typeof planView>>;
type Cycle = Plan["cycles"][number];
type Section = Cycle & { rows: Item[]; total: number; extra: number };

const scroller = () => document.querySelector<HTMLElement>("main");

/** Importe y ciclo, a la derecha de la cabecera de la app (móvil y escritorio). */
function HeaderAmount({ total, label, extra }: { total: number; label: string; extra: number }) {
  const [slots, setSlots] = useState<HTMLElement[]>([]);
  useEffect(() => {
    setSlots(["finance-header-right", "finance-header-right-desktop"].map((id) => document.getElementById(id)).filter((x): x is HTMLElement => !!x));
  }, []);
  const body = (
    <>
      <p className="amount text-[17px] font-semibold leading-tight tabular-nums text-slate-900">{eur(total, 2)}</p>
      <p className="text-[11px] leading-tight text-slate-500">{label}{extra > 0 ? ` · +${eur(extra, 0)} extra` : ""}</p>
    </>
  );
  return <>{slots.map((el) => createPortal(body, el, el.id))}</>;
}

export function PlanCategoryPanel({ categoryKey }: { categoryKey: string }) {
  const list = useFinance<List>("transactions?all=1");
  const plan = useFinance<Plan>("plan");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [visible, setVisible] = useState<string | null>(null);

  // El detalle empieza arriba del todo (el contenedor de scroll es el mismo que el de la lista de grupos).
  useEffect(() => { const el = scroller(); if (el) el.scrollTop = 0; }, []);

  // Cargos de esta categoría (gastos de cuentas incluidas), agrupados por ciclo, el más reciente primero.
  const sections = useMemo<Section[]>(() => {
    if (!list.data || !plan.data) return [];
    const rows = list.data.items.filter((t) => !t.excluded && t.kind === "gasto" && t.amount < 0
      && t.category === categoryKey);
    return plan.data.cycles.map((c) => {
      // Cada gasto cuenta en su fecha imputada si se la cambiaste («Cambiar fecha»), no en la del cargo.
      const when = (t: (typeof rows)[number]) => t.imputedDate ?? t.date;
      const mine = rows.filter((t) => when(t) >= c.start && when(t) <= c.end).sort((a, b) => when(b).localeCompare(when(a)));
      // El total no cuenta los extraordinarios (igual que Mi plan e Inicio); van aparte.
      const sum = (xs: typeof mine) => Math.round(xs.reduce((s, t) => s - t.amount, 0) * 100) / 100;
      return { ...c, rows: mine, total: sum(mine.filter((t) => !t.extraordinary)), extra: sum(mine.filter((t) => t.extraordinary)) };
    }).filter((s, i) => i === 0 || s.rows.length > 0);
  }, [list.data, plan.data, categoryKey]);

  // Evolución de los últimos 6 meses (sin extraordinarios), del más antiguo al actual (en curso).
  const trend = useMemo<TrendPoint[]>(() => {
    if (!list.data || !plan.data) return [];
    const rows = list.data.items.filter((t) => !t.excluded && t.kind === "gasto" && t.amount < 0 && !t.extraordinary && t.category === categoryKey);
    const when = (t: (typeof rows)[number]) => t.imputedDate ?? t.date;
    const month = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-ES", { month: "short", timeZone: "UTC" }).replace(".", "");
    return plan.data.cycles.slice(0, 6).map((c, i) => ({
      label: month(c.end),
      value: Math.round(rows.filter((t) => when(t) >= c.start && when(t) <= c.end).reduce((x, t) => x - t.amount, 0) * 100) / 100,
      current: i === 0,
    })).reverse();
  }, [list.data, plan.data, categoryKey]);

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

  const error = list.error ?? plan.error;
  const active = sections.find((s) => s.start === visible) ?? sections[0];

  return (
    <div className="mx-auto max-w-xl animate-in fade-in-0 slide-in-from-right-10 pb-6 duration-200">
      {/* El nombre va en la cabecera de la app; a su derecha, el importe y el ciclo que se está viendo (cambian con el scroll). */}
      {active && <HeaderAmount total={active.total} label={active.label} extra={active.extra} />}

      {list.data && plan.data && (
        <section className="border-b border-slate-100 py-4" aria-label="Evolución de los últimos meses">
          <p className="px-1 text-xs text-slate-500">Últimos meses</p>
          <div className="mt-1"><TrendChart points={trend} title={`Gasto en ${categoryLabel(categoryKey)}`} /></div>
        </section>
      )}

      {error && !list.data ? <ErrorNote>{error}</ErrorNote>
        : !list.data || !plan.data ? <SkeletonList rows={6} />
        : sections.every((s) => s.rows.length === 0) ? <p className="py-10 text-center text-sm text-slate-400">No hay movimientos de esta categoría.</p>
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
