"use client";
// Gastos previstos (23/11/2026). «Añadir gasto»: concepto, importe, fecha (de hoy o futura) y categoría; se guarda
// como previsto y, cuando llega el cargo del banco parecido, se enlaza con él (fase 4). Los previstos se ven en azul
// arriba de las listas (hojas de grupo y categoría, Movimientos) y se cuentan en «Tus grupos» de Inicio.
import { useEffect, useRef, useState } from "react";
import { CalendarClock, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { categoryOf } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { errorText, fapi, longDay, refreshFinance } from "./api";
import { CategoryIcon } from "./category-icon";
import { CategoryPicker } from "./category-picker";
import { aboveKeyboard, useKeyboardInset } from "./use-keyboard-inset";

export type Planned = { id: string; title: string; amount: number; date: string; category: string };

const todayIso = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
};

/** Previstos en azul, del más lejano al más cercano (van arriba de la lista). */
export function PlannedList({ items, className = "" }: { items: Planned[]; className?: string }) {
  if (!items.length) return null;
  return (
    <section className={className} aria-label="Gastos previstos">
      <p className="px-1 pb-1 pt-2 text-xs font-medium text-blue-700">Previstos</p>
      <ul className="divide-y divide-blue-100/70 rounded-2xl bg-blue-50/60">
        {items.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-3">
            <span className="relative">
              <CategoryIcon category={p.category} />
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 ring-2 ring-white" aria-hidden="true">
                <CalendarClock className="h-2.5 w-2.5 text-white" />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-slate-900">{p.title}</span>
              <span className="block truncate text-xs text-blue-700">Previsto · {longDay(p.date)} · {categoryOf(p.category).label}</span>
            </span>
            <span className="amount shrink-0 text-[15px] font-semibold tabular-nums text-blue-700">{eur(-p.amount, 2)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** «Añadir gasto»: hoja que sube desde abajo; la categoría se elige con el selector de categorías. */
export function AddExpenseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<"form" | "category">("form");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);
  const inset = useKeyboardInset(open);
  useEffect(() => {
    if (!open) return;
    setStep("form"); setTitle(""); setAmount(""); setDate(todayIso()); setCategory(null); setErr(null); setBusy(false);
  }, [open]);

  const save = async () => {
    const t = amount.trim().replace(/\s|€/g, "");
    const value = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
    if (!title.trim()) { setErr("Ponle un nombre: «Cena de empresa», «Zapatos»…"); return; }
    if (!Number.isFinite(value) || value <= 0) { setErr("Escribe el importe"); return; }
    if (!category) { setErr("Elige la categoría"); return; }
    setBusy(true); setErr(null);
    try {
      await fapi("planned", { title: title.trim(), amount: Math.round(value * 100) / 100, date, category });
      refreshFinance();
      onClose();
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" showCloseButton={false} onOpenAutoFocus={(e) => e.preventDefault()} style={aboveKeyboard(inset, step === "category")}
        className={`gap-0 overflow-hidden rounded-t-3xl border-slate-200 bg-white p-0 sm:mx-auto sm:max-w-lg ${step === "category" ? "data-[side=bottom]:h-[85dvh] max-h-[85dvh]" : "max-h-[90dvh]"}`}>
        <div className="shrink-0 touch-none px-5 pb-2 pt-3"
          onTouchStart={(e) => { startY.current = e.touches[0]?.clientY ?? null; }}
          onTouchEnd={(e) => { if (startY.current !== null && (e.changedTouches[0]?.clientY ?? 0) - startY.current > 70) onClose(); startY.current = null; }}
          onTouchCancel={() => { startY.current = null; }}>
          <div aria-hidden="true" className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-slate-300" />
          <SheetTitle className="text-lg font-semibold text-slate-900">{step === "category" ? "Selecciona una categoría" : "Añadir gasto"}</SheetTitle>
          <SheetDescription className="mt-0.5 text-xs text-slate-500">
            {step === "category" ? title || "Gasto previsto" : "Con fecha futura queda como previsto. Cuando llegue el cargo del banco, se enlazará con él."}
          </SheetDescription>
        </div>

        {step === "category" ? (
          <CategoryPicker current={category ?? ""} kind="gasto" movement={{ description: title, counterparty: null, amount: -1 }}
            onPick={(c) => { setCategory(c.key); setStep("form"); }} />
        ) : (
          <form className="space-y-4 overflow-y-auto px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-800">Concepto</span>
              <input value={title} onChange={(e) => { setTitle(e.target.value); setErr(null); }} placeholder="Cena de empresa, zapatos, veterinario…" maxLength={80}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-800">Importe</span>
                <span className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                  <input inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setErr(null); }} placeholder="0,00"
                    className="min-w-0 flex-1 bg-transparent py-3 text-base tabular-nums text-slate-900 outline-none" />
                  <span className="text-base text-slate-400">€</span>
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-800">Fecha</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayIso())}
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </label>
            </div>
            <button type="button" onClick={() => setStep("category")} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left active:bg-slate-50">
              {category ? <CategoryIcon category={category} /> : <span className="h-9 w-9 shrink-0 rounded-[11px] bg-slate-100" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-slate-500">Categoría</span>
                <span className={`block truncate text-[15px] ${category ? "text-slate-900" : "text-slate-400"}`}>{category ? categoryOf(category).label : "Elegir categoría"}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </button>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-60">
              {busy ? "Guardando…" : date > todayIso() ? "Guardar como previsto" : "Guardar gasto"}
            </button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
