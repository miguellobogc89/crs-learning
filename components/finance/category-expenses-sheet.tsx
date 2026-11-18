"use client";

import { useRef } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { categoryLabel } from "@/lib/finance/categories";
import type { overview } from "@/lib/finance/service";
import { eur } from "@/components/trading/format";
import { shortDay } from "./api";

type Expense = Awaited<ReturnType<typeof overview>>["cycleView"]["categoryExpenses"][number];

export function CategoryExpensesSheet({ category, cycleLabel, total, items, onClose }: {
  category: string | null;
  cycleLabel: string;
  total: number;
  items: Expense[];
  onClose: () => void;
}) {
  const startY = useRef<number | null>(null);

  return (
    <Sheet open={category !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="data-[side=bottom]:h-[75dvh] max-h-[75dvh] gap-0 overflow-hidden rounded-t-3xl border-slate-200 bg-white p-0 sm:max-w-2xl sm:mx-auto"
      >
        <div
          className="shrink-0 touch-none px-5 pt-3 pb-4"
          onTouchStart={(event) => { startY.current = event.touches[0]?.clientY ?? null; }}
          onTouchEnd={(event) => {
            if (startY.current !== null && (event.changedTouches[0]?.clientY ?? 0) - startY.current > 70) onClose();
            startY.current = null;
          }}
          onTouchCancel={() => { startY.current = null; }}
        >
          <div aria-hidden="true" className="mx-auto mb-5 h-1.5 w-11 rounded-full bg-slate-300" />
          <SheetTitle className="text-lg font-semibold text-slate-900">{category ? categoryLabel(category) : "Gastos"}</SheetTitle>
          <SheetDescription className="sr-only">Movimientos de la categoría. Desliza hacia abajo desde la cabecera o toca fuera para cerrar.</SheetDescription>
          <p className="mt-1 text-xs text-slate-500">{cycleLabel} · {items.length} {items.length === 1 ? "movimiento" : "movimientos"}</p>
          <div className="mt-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-sm text-slate-600">Total del ciclo</span>
            <strong className="amount text-xl font-bold tabular-nums text-slate-900">{eur(total, 2)}</strong>
          </div>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {items.map((item) => (
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
          {!items.length && <li className="py-6 text-center text-sm text-slate-500">No hay movimientos en esta categoría.</li>}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
