"use client";
// Piezas de un movimiento compartidas por Movimientos y por otras pantallas que listan movimientos (p. ej. el
// detalle de una categoría en Plan): la fila del móvil y la ventana de edición (tipo, categoría, alias,
// subcategoría, extraordinario, nota y «aplicar a los parecidos»). Una sola versión: lo que mejore aquí mejora en
// todas partes.
import { useEffect, useState } from "react";
import { ArrowLeftRight, Loader2, Star } from "lucide-react";
import type { listTransactions } from "@/lib/finance/service";
import { SELECTABLE_CATEGORIES, KINDS, KIND_LABEL, categoryOf, type Kind } from "@/lib/finance/categories";
import { eur, field, ghost, primary } from "@/components/trading/format";
import { ErrorNote, Modal, Pill } from "@/components/trading/ui";
import { errorText, fapi, longDay, refreshFinance, shortDay } from "./api";

export type List = Awaited<ReturnType<typeof listTransactions>>;
export type Item = List["items"][number];

export const SOURCE_LABEL: Record<string, string> = {
  usuario: "Corregido por ti",
  regla: "Por una regla tuya",
  interna: "Detectado entre tus cuentas",
  palabra: "Por el comercio",
  ia: "Clasificado por la IA",
  auto: "Sin entender: revísalo",
  pendiente: "Pendiente",
};

const KIND_COLOR: Record<Kind, string> = { gasto: "slate", ingreso: "emerald", regalo: "violet", devolucion: "teal", interna: "blue", ahorro: "amber" };

export function CategoryPill({ t }: { t: Pick<Item, "category" | "kind"> }) {
  const c = categoryOf(t.category);
  return <Pill color={t.kind === "gasto" ? c.color : KIND_COLOR[t.kind]}>{t.kind === "gasto" || t.kind === "devolucion" ? c.label : KIND_LABEL[t.kind]}</Pill>;
}

export function Amount({ t }: { t: Item }) {
  const muted = t.kind === "interna";
  return <span className={`amount whitespace-nowrap font-semibold tabular-nums ${muted ? "text-slate-400" : t.amount > 0 ? "text-emerald-700" : "text-slate-900"}`}>{t.amount > 0 ? "+" : ""}{eur(t.amount, 2)}</span>;
}

export const isReview = (t: Item) => t.source === "auto" || t.source === "pendiente";
export const label = (t: Item) => t.alias || t.counterparty || t.description;

/** Categorías que encajan con un tipo (un gasto o una devolución usan las de gasto). */
export const categoriesFor = (kind: Kind) =>
  SELECTABLE_CATEGORIES.filter((c) => (kind === "gasto" || kind === "devolucion" ? c.kind === "gasto" : c.kind === kind));

export function EditModal({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const [category, setCategory] = useState("otros_gastos");
  const [kind, setKind] = useState<Kind>("gasto");
  const [extra, setExtra] = useState(false);
  const [note, setNote] = useState("");
  const [alias, setAlias] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [similar, setSimilar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!item) return;
    setCategory(item.category);
    setKind(item.kind);
    setExtra(item.extraordinary);
    setNote(item.note ?? "");
    setAlias(item.alias ?? "");
    setSubcategory(item.subcategory ?? "");
    setSimilar(true);
    setErr(null);
    setDone(null);
  }, [item]);
  if (!item) return null;
  const options = categoriesFor(kind);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const cat = options.some((o) => o.key === category) ? category : options[0]?.key ?? "otros_gastos";
      const r = await fapi<{ similar: number }>("transaction", { id: item.id, category: cat, kind, extraordinary: extra, note, alias, subcategory, applyToSimilar: similar });
      refreshFinance();
      if (r.similar) setDone(`Guardado. También se han actualizado ${r.similar} movimientos parecidos y la regla queda aprendida.`);
      else onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={item.counterparty || item.description}
      subtitle={`${longDay(item.date)} · ${item.account}${item.bank ? ` (${item.bank})` : ""} · ${SOURCE_LABEL[item.source] ?? item.source}`}
      footer={done ? <button type="button" onClick={onClose} className={primary}>Hecho</button> : (
        <>
          <button type="button" onClick={onClose} className={ghost}>Cancelar</button>
          <button type="button" onClick={() => void save()} disabled={busy} className={primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar</button>
        </>
      )}
    >
      {done ? <p className="text-sm text-emerald-800">{done}</p> : (
        <div className="space-y-4 text-sm">
          <div className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="min-w-0 truncate text-slate-600" title={item.description}>{item.description}</span>
            <Amount t={item} />
          </div>
          <div>
            <p className="mb-1.5 font-medium text-slate-800">¿Qué es este movimiento?</p>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${kind === k ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>{KIND_LABEL[k]}</button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {kind === "interna" ? "No cuenta como gasto ni ingreso: es dinero que pasa entre tus cuentas." : kind === "ahorro" ? "Cuenta como ahorro, no como gasto." : kind === "devolucion" ? "Resta del gasto de la categoría que elijas." : kind === "regalo" ? "Se muestra aparte y no se proyecta como ingreso." : null}
            </p>
          </div>
          {options.length > 1 && (
            <label className="block">
              <span className="mb-1.5 block font-medium text-slate-800">Categoría</span>
              <select value={options.some((o) => o.key === category) ? category : options[0].key} onChange={(e) => setCategory(e.target.value)} className={`${field} w-full`}>
                {options.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block font-medium text-slate-800">Alias del movimiento</span>
            <input value={alias} maxLength={80} onChange={(e) => setAlias(e.target.value)} placeholder="Ej. Tabaco" className={`${field} w-full`} />
            <span className="mt-1 block text-xs text-slate-500">Nombre visible. El concepto del banco no cambia.</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block font-medium text-slate-800">Subcategoría</span>
            <input value={subcategory} maxLength={80} onChange={(e) => setSubcategory(e.target.value)} placeholder="Ej. Agua (en Suministros)" className={`${field} w-full`} />
          </label>
          {(kind === "gasto" || kind === "devolucion") && (
            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
              <span><span className="font-medium text-slate-800">Gasto extraordinario</span><span className="block text-xs text-slate-500">Puntual: no se tiene en cuenta para proyectar ni como hábito.</span></span>
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block font-medium text-slate-800">Nota (opcional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="P. ej. «mi parte de la cena de Ana»" className={`${field} w-full`} />
          </label>
          <label className="flex items-start gap-2.5">
            <input type="checkbox" checked={similar} onChange={(e) => setSimilar(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
            <span><span className="font-medium text-slate-800">Aplicar a los movimientos parecidos</span><span className="block text-xs text-slate-500">Crea una regla con este comercio para ahora y para los que lleguen.</span></span>
          </label>
          {err && <ErrorNote>{err}</ErrorNote>}
        </div>
      )}
    </Modal>
  );
}

/** Fila de un movimiento en el móvil: nombre, fecha, importe y categoría. Al tocarla, se edita. */
export function MovementRowButton({ t, onClick }: { t: Item; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {t.kind === "interna" && <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          {t.extraordinary && <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
          <span className="truncate text-[15px] font-medium text-slate-900">{label(t)}</span>
        </span>
        <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <span>{shortDay(t.date)}</span>
          {isReview(t) && <span className="text-amber-700">revisar</span>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Amount t={t} />
        <span className="max-w-[9rem] truncate text-[11px] text-slate-500">{categoryOf(t.category).label}{t.subcategory ? ` · ${t.subcategory}` : ""}</span>
      </span>
    </button>
  );
}
