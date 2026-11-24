"use client";
// Gastos previstos (23/11/2026). «Añadir gasto»: concepto, importe, fecha (de hoy o futura) y categoría; se guarda
// como previsto y, cuando llega el cargo del banco parecido, se enlaza con él (fase 4). Los previstos se ven en azul
// arriba de las listas (hojas de grupo y categoría, Movimientos) y se cuentan en «Tus grupos» de Inicio. Al tocar
// uno se abre su detalle (la misma pantalla que un movimiento, marcada «Previsto, sin pagar»); deslizando a la
// izquierda aparece la papelera.
import { useEffect, useRef, useState } from "react";
import { CalendarClock, ChevronRight, Repeat2, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { categoryOf } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { errorText, fapi, longDay, refreshFinance } from "./api";
import { CategoryIcon } from "./category-icon";
import { CategoryPicker } from "./category-picker";
import { PlannedDetailSheet } from "./movement-detail";
import { aboveKeyboard, useKeyboardInset } from "./use-keyboard-inset";

export type Planned = { id: string; title: string; amount: number; date: string; category: string };

const todayIso = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
};

/** Una fila de previsto: al tocarla se abre su detalle; deslizándola a la izquierda aparece la papelera. */
function PlannedRow({ p, onOpen, onDelete }: { p: Planned; onOpen: () => void; onDelete: () => void }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const moved = useRef(false);
  const REVEAL = 76;
  return (
    <li className="relative -mx-2 overflow-hidden rounded-xl">
      {/* Detrás: la papelera (se ve al deslizar) */}
      <button type="button" onClick={onDelete} aria-label={`Borrar ${p.title}`} tabIndex={dx ? 0 : -1} aria-hidden={!dx}
        style={{ visibility: dx ? "visible" : "hidden" }}
        className="absolute inset-y-0 right-0 flex w-[76px] items-center justify-center bg-red-600 text-white">
        <Trash2 className="h-5 w-5" />
      </button>
      <button type="button"
        onClick={() => { if (moved.current) { moved.current = false; return; } if (dx) { setDx(0); return; } onOpen(); }}
        onTouchStart={(e) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY, base: dx }; moved.current = false; }}
        onTouchMove={(e) => {
          const st = start.current; const t = e.touches[0];
          if (!st) return;
          const ddx = t.clientX - st.x;
          if (!moved.current && Math.abs(ddx) < 8) return;
          if (!moved.current && Math.abs(t.clientY - st.y) > Math.abs(ddx)) { start.current = null; return; }
          moved.current = true;
          setDx(Math.max(-REVEAL - 24, Math.min(0, st.base + ddx)));
        }}
        onTouchEnd={() => { if (start.current && moved.current) setDx((v) => (v < -REVEAL / 2 ? -REVEAL : 0)); start.current = null; }}
        style={{ transform: `translateX(${dx}px)` }}
        className="relative flex w-full items-center gap-3 bg-blue-50 px-3 py-3 text-left transition-transform duration-150 ease-out active:bg-blue-100/70">
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
      </button>
    </li>
  );
}

/** Previstos en azul, del más lejano al más cercano (van arriba de la lista). Se tocan para editarlos y se borran
 *  deslizando a la izquierda o desde su detalle, siempre con «Deshacer». */
export type Repeat = { id: string; title: string; amount: number; date: string; category: string; txId?: string };

/** Lo que se repite el mes que viene: en azul como los previstos; al tocarlo se abre el detalle de su último cargo. */
function RepeatRow({ r, onOpen }: { r: Repeat; onOpen?: () => void }) {
  return (
    <li className="-mx-2 overflow-hidden rounded-xl">
      <button type="button" onClick={onOpen} disabled={!onOpen}
        className="flex w-full items-center gap-3 bg-blue-50 px-3 py-3 text-left active:bg-blue-100/70 disabled:cursor-default">
        <span className="relative">
          <CategoryIcon category={r.category} />
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 ring-2 ring-white" aria-hidden="true">
            <Repeat2 className="h-2.5 w-2.5 text-white" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-slate-900">{r.title}</span>
          <span className="block truncate text-xs text-blue-700">Se repite · {longDay(r.date)} · {categoryOf(r.category).label}</span>
        </span>
        <span className="amount shrink-0 text-[15px] font-semibold tabular-nums text-blue-700">{eur(-r.amount, 2)}</span>
      </button>
    </li>
  );
}

export function PlannedList({ items, repeats = [], onOpenRepeat, className = "" }: { items: Planned[]; repeats?: Repeat[]; onOpenRepeat?: (txId: string) => void; className?: string }) {
  const [editing, setEditing] = useState<Planned | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 5000); return () => window.clearTimeout(t); }, [toast]);
  const remove = async (p: Planned) => {
    setEditing(null);
    setHidden((h) => new Set(h).add(p.id));
    try {
      await fapi("planned/delete", { id: p.id });
      refreshFinance();
      setToast({ text: `«${p.title}» borrado`, undo: () => {
        setToast(null);
        void fapi("planned", { title: p.title, amount: p.amount, date: p.date, category: p.category }).then(refreshFinance);
      } });
    } catch (e) {
      setHidden((h) => { const n = new Set(h); n.delete(p.id); return n; });
      setToast({ text: errorText(e) });
    }
  };
  const shown = items.filter((p) => !hidden.has(p.id));
  return (
    <>
      {(shown.length > 0 || repeats.length > 0) && (
        <section className={className} aria-label="Gastos previstos">
          <p className="px-1 pb-1 pt-2 text-xs font-medium text-blue-700">Previstos</p>
          <ul className="space-y-1.5">
            {/* Del más lejano al más cercano: previstos y lo que se repite, juntos por fecha. */}
            {[...shown.map((p) => ({ date: p.date, el: <PlannedRow key={p.id} p={p} onOpen={() => setEditing(p)} onDelete={() => void remove(p)} /> })),
              ...repeats.map((r) => ({ date: r.date, el: <RepeatRow key={r.id} r={r} onOpen={r.txId && onOpenRepeat ? () => onOpenRepeat(r.txId as string) : undefined} /> }))]
              .sort((a, b) => b.date.localeCompare(a.date)).map((x) => x.el)}
          </ul>
        </section>
      )}
      <PlannedDetailSheet item={editing} onClose={() => setEditing(null)} onDelete={(p) => void remove(p)} />
      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg md:bottom-6">
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.undo && <button type="button" onClick={toast.undo} className="shrink-0 font-semibold text-blue-300">Deshacer</button>}
        </div>
      )}
    </>
  );
}

/** «Añadir gasto»: hoja que sube desde abajo; la categoría se elige con el selector de categorías. */
export function AddExpenseSheet({ open, onClose, editing = null, onDelete, defaultDate }: { open: boolean; onClose: () => void; editing?: Planned | null; onDelete?: () => void; defaultDate?: string }) {
  const [step, setStep] = useState<"form" | "category">("form");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const startY = useRef<number | null>(null);
  const inset = useKeyboardInset(open);
  useEffect(() => {
    if (!open) return;
    setStep("form"); setErr(null); setBusy(false); setConfirmDelete(false);
    setTitle(editing?.title ?? ""); setAmount(editing ? String(editing.amount).replace(".", ",") : "");
    setDate(editing?.date ?? defaultDate ?? todayIso()); setCategory(editing?.category ?? null);
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const t = amount.trim().replace(/\s|€/g, "");
    const value = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
    if (!title.trim()) { setErr("Ponle un nombre: «Cena de empresa», «Zapatos»…"); return; }
    if (!Number.isFinite(value) || value <= 0) { setErr("Escribe el importe"); return; }
    if (!category) { setErr("Elige la categoría"); return; }
    setBusy(true); setErr(null);
    try {
      const fields = { title: title.trim(), amount: Math.round(value * 100) / 100, date, category };
      await fapi(editing ? "planned/update" : "planned", editing ? { id: editing.id, ...fields } : fields);
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
          <SheetTitle className="text-lg font-semibold text-slate-900">{step === "category" ? "Selecciona una categoría" : editing ? "Gasto previsto" : "Añadir gasto"}</SheetTitle>
          <SheetDescription className="mt-0.5 text-xs text-slate-500">
            {step === "category" ? title || "Gasto previsto" : editing ? "Aún sin pagar. Cuando llegue el cargo del banco, se enlazará con él." : "Con fecha futura queda como previsto. Cuando llegue el cargo del banco, se enlazará con él."}
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
              {busy ? "Guardando…" : editing ? "Guardar cambios" : date > todayIso() ? "Guardar como previsto" : "Guardar gasto"}
            </button>
            {editing && onDelete && (
              <button type="button" onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
                className={`w-full rounded-xl py-3 text-sm font-semibold ${confirmDelete ? "bg-red-600 text-white" : "text-red-600 active:bg-red-50"}`}>
                {confirmDelete ? "Sí, borrar este previsto" : "Borrar previsto"}
              </button>
            )}
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
