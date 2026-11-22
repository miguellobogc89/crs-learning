"use client";
// Plan · detalle de una categoría. Entra desde la derecha; la flecha para volver está en la cabecera
// de la app (shell.tsx, en cualquier pantalla de detalle). Encima de la lista, el nombre de la categoría y, a la
// derecha, el ciclo que se está viendo y su importe: al hacer scroll y entrar en un ciclo anterior, cambian (como el
// historial de categoría de Inicio). Al tocar un movimiento se edita con la misma ventana que en Movimientos
// (movement-detail.tsx); si cambia de categoría, sale de la lista y, al volver, la cifra del grupo ya está al día.
import { useEffect, useMemo, useRef, useState } from "react";
import type { planView } from "@/lib/finance/service";
import { categoryLabel } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useFinance } from "./api";
import { MovementRowButton, type Item, type List } from "./movement-edit";
import { MovementDetailSheet } from "./movement-detail";

type Plan = Awaited<ReturnType<typeof planView>>;
type Cycle = Plan["cycles"][number];
type Section = Cycle & { rows: Item[]; total: number };

const scroller = () => document.querySelector<HTMLElement>("main");

export function PlanCategoryPanel({ categoryKey }: { categoryKey: string }) {
  const list = useFinance<List>("transactions?all=1");
  const plan = useFinance<Plan>("plan");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [visible, setVisible] = useState<string | null>(null);
  const header = useRef<HTMLDivElement>(null);

  // El detalle empieza arriba del todo (el contenedor de scroll es el mismo que el de la lista de grupos).
  useEffect(() => { const el = scroller(); if (el) el.scrollTop = 0; }, []);

  // Cargos de esta categoría (gastos de cuentas incluidas), agrupados por ciclo, el más reciente primero.
  const sections = useMemo<Section[]>(() => {
    if (!list.data || !plan.data) return [];
    const rows = list.data.items.filter((t) => !t.excluded && t.kind === "gasto" && t.amount < 0
      && t.category === categoryKey);
    return plan.data.cycles.map((c) => {
      const mine = rows.filter((t) => t.date >= c.start && t.date <= c.end).sort((a, b) => b.date.localeCompare(a.date));
      return { ...c, rows: mine, total: Math.round(mine.reduce((s, t) => s - t.amount, 0) * 100) / 100 };
    }).filter((s, i) => i === 0 || s.rows.length > 0);
  }, [list.data, plan.data, categoryKey]);

  // Ciclo que se ve bajo la cabecera fija: el último cuyo comienzo ya ha pasado por debajo de ella.
  useEffect(() => {
    const el = scroller();
    if (!el || !sections.length) return;
    const onScroll = () => {
      const limit = (header.current?.getBoundingClientRect().bottom ?? 0) + 4;
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
      <div ref={header} className="sticky top-0 z-10 -mx-3 flex items-end justify-between gap-3 border-b border-slate-100 bg-white px-4 pb-3 pt-1 md:-mx-0 md:px-1">
        <h2 className="min-w-0 truncate text-lg font-semibold text-slate-900">{categoryLabel(categoryKey)}</h2>
        {active && (
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold tabular-nums text-slate-900">{eur(active.total, 2)}</p>
            <p className="text-xs text-slate-500">{active.label}</p>
          </div>
        )}
      </div>

      {error && !list.data ? <ErrorNote>{error}</ErrorNote>
        : !list.data || !plan.data ? <SkeletonList rows={6} />
        : sections.every((s) => s.rows.length === 0) ? <p className="py-10 text-center text-sm text-slate-400">No hay movimientos de esta categoría.</p>
        : sections.map((s, i) => (
          <section key={s.start} data-cycle={s.start}>
            {i > 0 && (
              <p className="flex justify-between bg-slate-50 px-1 py-1.5 text-xs text-slate-500">
                <span>{s.label}</span>
                <span className="tabular-nums">{eur(s.total, 2)}</span>
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
      <MovementDetailSheet item={list.data?.items.find((t) => t.id === viewingId) ?? null} onClose={() => setViewingId(null)} />
    </div>
  );
}
