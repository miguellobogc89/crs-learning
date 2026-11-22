"use client";
// Detalle de un movimiento a pantalla completa (entra desde la derecha, flecha para volver). Primero se ve: importe
// grande, nombre, fecha, cuenta y categoría; luego se actúa con tres botones abajo: Recategorizar (lista desde
// abajo, un toque y listo), Extraordinario (un toque) y ✎ (la edición completa de siempre, EditModal). Es una capa
// sobre la lista, así que al volver la lista conserva filtros, búsqueda y scroll. Lo usan Movimientos y Plan.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Loader2, Pencil, Search, Star } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { KIND_LABEL, categoryOf } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { errorText, fapi, longDay, refreshFinance } from "./api";
import { BankLogo } from "./bank-logo";
import { CategoryIcon } from "./category-icon";
import { EditModal, SOURCE_LABEL, categoriesFor, label, type Item } from "./movement-edit";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lista de categorías que sube desde abajo: tocar una la aplica (y, si se quiere, a los movimientos parecidos). */
function RecategorizeSheet({ item, open, onClose, onSaved }: { item: Item; open: boolean; onClose: () => void; onSaved: (msg: string | null) => void }) {
  const [q, setQ] = useState("");
  const [similar, setSimilar] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const startY = useRef<number | null>(null);
  useEffect(() => { if (open) { setQ(""); setSimilar(true); setErr(null); } }, [open]);
  const kind = item.kind === "interna" || item.kind === "ahorro" ? "gasto" : item.kind;
  const options = categoriesFor(kind).filter((c) => !q.trim() || fold(c.label).includes(fold(q.trim())));
  const pick = async (category: string) => {
    setBusy(category);
    setErr(null);
    try {
      const r = await fapi<{ similar: number }>("transaction", { id: item.id, category, kind, extraordinary: item.extraordinary, applyToSimilar: similar });
      refreshFinance();
      onSaved(r.similar ? `También se han actualizado ${r.similar} movimientos parecidos.` : null);
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" showCloseButton={false} className="data-[side=bottom]:h-[80dvh] max-h-[80dvh] gap-0 overflow-hidden rounded-t-3xl border-slate-200 bg-white p-0 sm:mx-auto sm:max-w-lg">
        <div
          className="shrink-0 touch-none px-5 pb-3 pt-3"
          onTouchStart={(e) => { startY.current = e.touches[0]?.clientY ?? null; }}
          onTouchEnd={(e) => { if (startY.current !== null && (e.changedTouches[0]?.clientY ?? 0) - startY.current > 70) onClose(); startY.current = null; }}
          onTouchCancel={() => { startY.current = null; }}
        >
          <div aria-hidden="true" className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-slate-300" />
          <SheetTitle className="text-lg font-semibold text-slate-900">Recategorizar</SheetTitle>
          <SheetDescription className="mt-0.5 truncate text-xs text-slate-500">{label(item)}</SheetDescription>
          <label className="mt-3 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar categoría" className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
          </label>
          <label className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span><span className="font-medium text-slate-800">Aplicar a los parecidos</span><span className="block text-xs text-slate-500">Y a los que lleguen de este comercio.</span></span>
            <input type="checkbox" checked={similar} onChange={(e) => setSimilar(e.target.checked)} className="h-5 w-5 rounded border-slate-300" />
          </label>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {options.map((c) => {
            const on = c.key === item.category;
            return (
              <li key={c.key}>
                <button type="button" onClick={() => void pick(c.key)} disabled={!!busy} className="flex w-full items-center gap-3 py-3 text-left active:bg-slate-50">
                  <CategoryIcon category={c.key} />
                  <span className={`min-w-0 flex-1 text-[15px] ${on ? "font-semibold text-slate-900" : "text-slate-800"}`}>{c.label}</span>
                  {busy === c.key ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : on && <Check className="h-4 w-4 text-blue-600" />}
                </button>
              </li>
            );
          })}
          {options.length === 0 && <li className="py-8 text-center text-sm text-slate-400">No hay categorías con ese nombre.</li>}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

export function MovementDetailSheet({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const [recat, setRecat] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const id = item?.id;
  useEffect(() => { setRecat(false); setEditing(false); setNote(null); setErr(null); }, [id]);

  const toggleExtra = async () => {
    if (!item) return;
    setBusy(true);
    setErr(null);
    try {
      await fapi("transaction", { id: item.id, category: item.category, kind: item.kind, extraordinary: !item.extraordinary, applyToSimilar: false });
      refreshFinance();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const spend = item && (item.kind === "gasto" || item.kind === "devolucion");
  const amount = item ? eur(item.amount, 2) : "";
  return (
    <Sheet open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} className="gap-0 bg-white p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        {item && (
          <div className="flex h-full min-h-0 flex-col pt-[env(safe-area-inset-top)]">
            <div className="flex h-14 shrink-0 items-center px-2">
              <button type="button" onClick={onClose} aria-label="Volver" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
                <ArrowLeft className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
              <p className={`text-4xl font-semibold tabular-nums tracking-tight ${item.amount > 0 ? "text-emerald-700" : item.kind === "interna" ? "text-slate-400" : "text-slate-900"}`}>
                {item.amount > 0 ? "+" : ""}{amount}
              </p>
              <SheetTitle className="mt-3 text-2xl font-semibold text-slate-900">{label(item)}</SheetTitle>
              <SheetDescription className="mt-1 text-sm text-slate-500">{longDay(item.date)}</SheetDescription>
              {label(item) !== item.description && <p className="mt-1 break-words text-xs text-slate-400">{item.description}</p>}

              <ul className="mt-6 divide-y divide-slate-100 border-y border-slate-100">
                <li className="flex items-center gap-3 py-3.5">
                  <BankLogo bank={item.bank} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-slate-800">{item.account}</span>
                </li>
                <li>
                  <button type="button" onClick={() => setRecat(true)} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-slate-50">
                    <CategoryIcon category={item.kind === "interna" ? "transferencia_interna" : item.category} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] text-slate-800">{spend ? categoryOf(item.category).label : KIND_LABEL[item.kind]}{item.subcategory ? ` · ${item.subcategory}` : ""}</span>
                      <span className="block text-xs text-slate-400">{SOURCE_LABEL[item.source] ?? item.source}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </button>
                </li>
                {item.extraordinary && (
                  <li className="flex items-center gap-3 py-3.5 text-[15px] text-amber-800">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50"><Star className="h-[18px] w-[18px] text-amber-500" /></span>
                    <span className="min-w-0 flex-1">Extraordinario<span className="block text-xs text-amber-700/80">Cuenta en tu gasto, pero no en tus medias.</span></span>
                  </li>
                )}
              </ul>
              <p className={`mt-5 text-[15px] ${item.note ? "text-slate-700" : "text-slate-400"}`}>{item.note || "Sin nota. Edita el movimiento para añadir una."}</p>
              {note && <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</p>}
              {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-3 border-t border-slate-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <button type="button" onClick={() => setRecat(true)} className="h-12 flex-1 rounded-full border-2 border-blue-600 text-sm font-semibold text-blue-700 active:bg-blue-50">Recategorizar</button>
              {spend && (
                <button type="button" onClick={() => void toggleExtra()} disabled={busy} aria-pressed={item.extraordinary} className={`flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full border-2 text-sm font-semibold ${item.extraordinary ? "border-amber-500 bg-amber-50 text-amber-800" : "border-blue-600 text-blue-700 active:bg-blue-50"}`}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />} Extraordinario
                </button>
              )}
              <button type="button" onClick={() => setEditing(true)} aria-label="Editar todo el movimiento" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white active:bg-blue-700">
                <Pencil className="h-5 w-5" />
              </button>
            </div>
            <RecategorizeSheet item={item} open={recat} onClose={() => setRecat(false)} onSaved={setNote} />
            <EditModal item={editing ? item : null} onClose={() => setEditing(false)} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
