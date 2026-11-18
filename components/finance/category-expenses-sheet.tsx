"use client";

import { useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { categoryLabel } from "@/lib/finance/categories";
import type { overview } from "@/lib/finance/service";
import { eur } from "@/components/trading/format";
import { shortDay } from "./api";

type History = Awaited<ReturnType<typeof overview>>["categoryHistory"];

function monthName(start: string, length: "short" | "long") {
  const label = new Intl.DateTimeFormat("es-ES", { month: length, timeZone: "UTC" })
    .format(new Date(`${start}T00:00:00Z`)).replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function CategoryExpensesSheet({ category, history, onClose }: {
  category: string | null;
  history: History;
  onClose: () => void;
}) {
  const startY = useRef<number | null>(null);
  const [viewed, setViewed] = useState<{ category: string; start: string } | null>(null);
  const groups = useMemo(() => history.map((cycle) => {
    const items = cycle.items.filter((tx) => tx.category === category);
    const total = Math.round(items.reduce((sum, tx) => sum - tx.amount, 0) * 100) / 100;
    return { ...cycle, items, total };
  }).filter((cycle) => cycle.items.length > 0), [category, history]);
  const active = (viewed?.category === category && groups.find((cycle) => cycle.start === viewed.start)) || groups[0];
  const itemCount = groups.reduce((sum, cycle) => sum + cycle.items.length, 0);

  const dismiss = () => {
    setViewed(null);
    onClose();
  };

  const updateVisibleCycle = (element: HTMLDivElement) => {
    if (!category) return;
    const top = element.getBoundingClientRect().top + 16;
    let current = groups[0]?.start;
    for (const section of element.querySelectorAll<HTMLElement>("[data-cycle-start]")) {
      if (section.getBoundingClientRect().top > top) break;
      current = section.dataset.cycleStart;
    }
    if (!current) return;
    setViewed((previous) => previous?.category === category && previous.start === current ? previous : { category, start: current });
  };

  return (
    <Sheet open={category !== null} onOpenChange={(open) => { if (!open) dismiss(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="data-[side=bottom]:h-[75dvh] max-h-[75dvh] gap-0 overflow-hidden rounded-t-3xl border-slate-200 bg-white p-0 sm:max-w-2xl sm:mx-auto"
      >
        <div
          className="shrink-0 touch-none px-5 pt-3 pb-4"
          onTouchStart={(event) => { startY.current = event.touches[0]?.clientY ?? null; }}
          onTouchEnd={(event) => {
            if (startY.current !== null && (event.changedTouches[0]?.clientY ?? 0) - startY.current > 70) dismiss();
            startY.current = null;
          }}
          onTouchCancel={() => { startY.current = null; }}
        >
          <div aria-hidden="true" className="mx-auto mb-5 h-1.5 w-11 rounded-full bg-slate-300" />
          <SheetTitle className="text-lg font-semibold text-slate-900">{category ? categoryLabel(category) : "Gastos"}</SheetTitle>
          <SheetDescription className="sr-only">Historial de gastos por ciclos. Desliza hacia abajo desde la cabecera o toca fuera para cerrar.</SheetDescription>
          <p className="mt-1 text-xs text-slate-500">Todo el historial · {itemCount} {itemCount === 1 ? "movimiento" : "movimientos"}</p>
          <div className="mt-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-sm font-semibold text-slate-700">{active ? monthName(active.start, "short") : "—"}</span>
            <strong className="amount text-xl font-bold tabular-nums text-slate-900">{active ? eur(active.total, 2) : "—"}</strong>
          </div>
        </div>
        <div onScroll={(event) => updateVisibleCycle(event.currentTarget)}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {groups.map((cycle) => (
            <section key={cycle.start} data-cycle-start={cycle.start}>
              <div className="border-b border-slate-100 bg-slate-50/70 px-3 py-2.5">
                <h3 className="text-sm font-semibold text-slate-800">{monthName(cycle.start, "long")} {cycle.start.slice(0, 4)}</h3>
                <p className="text-xs text-slate-500">{cycle.label}</p>
              </div>
              <ul className="divide-y divide-slate-100">
                {cycle.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{item.counterparty || item.description}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{shortDay(item.date)}{item.kind === "devolucion" ? " · Devolución" : ""}</p>
                    </div>
                    <span className={`amount shrink-0 text-sm font-semibold tabular-nums ${item.amount > 0 ? "text-emerald-700" : "text-slate-900"}`}>
                      {item.amount > 0 ? "+" : ""}{eur(item.amount, 2)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!groups.length && <p className="py-6 text-center text-sm text-slate-500">No hay movimientos en esta categoría.</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
