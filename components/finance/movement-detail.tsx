"use client";
// Detalle de un movimiento a pantalla completa (entra desde la derecha, flecha para volver). Todo se edita en su
// sitio y se guarda solo, en este movimiento, con «Deshacer»: nombre (tocando el título), categoría, subcategoría,
// extraordinario (interruptor fijo), nota y tipo. Si cambias algo que tiene sentido repetir (categoría, nombre,
// subcategoría) en todos los movimientos del mismo comercio, abajo hay siempre un botón «Aplicar a los 13 de …»
// (copia lo que tenga el movimiento en ese momento, también a los que lleguen); si no lo pulsas, solo cambia este. «Extraordinario» y la nota nunca se copian. Es una capa sobre la lista, así que
// al volver la lista conserva filtros y scroll. Lo usan Movimientos (móvil y escritorio) y Plan.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, CalendarClock, Check, ChevronRight, Loader2, Pencil, Search } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { KINDS, KIND_LABEL, categoryOf, type Kind } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { errorText, fapi, longDay, refreshFinance } from "./api";
import { BankLogo } from "./bank-logo";
import { CategoryIcon } from "./category-icon";
import { CategoryPicker } from "./category-picker";
import { SOURCE_LABEL, categoriesFor, type Item } from "./movement-edit";
import { aboveKeyboard, useKeyboardInset } from "./use-keyboard-inset";

type Field = "category" | "alias" | "subcategory";
type Values = { category: string; kind: Kind; extraordinary: boolean; alias: string | null; subcategory: string | null; note: string | null };
type Undo = { rows: unknown[]; pattern: string; rule: unknown } | null;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const FIELD_LABEL: Record<Field, string> = { category: "categoría", alias: "nombre", subcategory: "subcategoría" };
const valuesOf = (t: Item): Values => ({ category: t.category, kind: t.kind, extraordinary: t.extraordinary, alias: t.alias ?? null, subcategory: t.subcategory ?? null, note: t.note ?? null });

/** Hoja que sube desde abajo, con el tirador y el gesto de deslizar para cerrar (como el resto de Finanzas). */
function BottomSheet({ open, onClose, title, subtitle, children, tall = false, autoFocus = false }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; tall?: boolean; autoFocus?: boolean }) {
  const startY = useRef<number | null>(null);
  const inset = useKeyboardInset(open);
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        // En el iPhone, poner el cursor en un campo abre el teclado: solo lo hacemos donde se va a escribir.
        onOpenAutoFocus={autoFocus ? undefined : (e) => e.preventDefault()}
        style={aboveKeyboard(inset, tall)}
        className={`gap-0 overflow-hidden rounded-t-3xl border-slate-200 bg-white p-0 sm:mx-auto sm:max-w-lg ${tall ? "data-[side=bottom]:h-[80dvh] max-h-[80dvh]" : "max-h-[85dvh]"}`}>
        <div
          className="shrink-0 touch-none px-5 pb-3 pt-3"
          onTouchStart={(e) => { startY.current = e.touches[0]?.clientY ?? null; }}
          onTouchEnd={(e) => { if (startY.current !== null && (e.changedTouches[0]?.clientY ?? 0) - startY.current > 70) onClose(); startY.current = null; }}
          onTouchCancel={() => { startY.current = null; }}
        >
          <div aria-hidden="true" className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-slate-300" />
          <SheetTitle className="text-lg font-semibold text-slate-900">{title}</SheetTitle>
          <SheetDescription className={subtitle ? "mt-0.5 truncate text-xs text-slate-500" : "sr-only"}>{subtitle ?? title}</SheetDescription>
        </div>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** Texto corto o largo (subcategoría, nota), con sugerencias opcionales. Se guarda al pulsar «Guardar». */
function TextSheet({ open, onClose, title, initial, placeholder, multiline, suggestions = [], onSave }: {
  open: boolean; onClose: () => void; title: string; initial: string; placeholder: string; multiline?: boolean; suggestions?: string[]; onSave: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => { if (open) setValue(initial); }, [open, initial]);
  const submit = () => { onSave(value.trim()); onClose(); };
  const field = "w-full rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
  return (
    <BottomSheet open={open} onClose={onClose} title={title} autoFocus>
      <form className="space-y-3 px-5 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {multiline
          ? <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} rows={4} maxLength={500} className={field} />
          : <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} maxLength={80} className={field} />}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setValue(s)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${value === s ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-700 active:bg-slate-50"}`}>{s}</button>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          {initial && <button type="button" onClick={() => { onSave(""); onClose(); }} className="h-12 flex-1 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 active:bg-slate-50">Quitar</button>}
          <button type="submit" className="h-12 flex-[2] rounded-xl bg-blue-600 text-sm font-semibold text-white active:bg-blue-700">Guardar</button>
        </div>
      </form>
    </BottomSheet>
  );
}

/** Lista de opciones con icono (categorías) o sin él (tipo). Tocar una la elige y cierra. */
function PickSheet({ open, onClose, title, subtitle, options, current, onPick, searchable, icons }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; options: { key: string; label: string; hint?: string }[]; current: string; onPick: (k: string) => void; searchable?: boolean; icons?: boolean;
}) {
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const shown = options.filter((o) => !q.trim() || fold(o.label).includes(fold(q.trim())));
  return (
    <BottomSheet open={open} onClose={onClose} title={title} subtitle={subtitle} tall={searchable}>
      {searchable && (
        <label className="mx-5 mb-2 flex shrink-0 items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
        </label>
      )}
      <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {shown.map((o) => (
          <li key={o.key}>
            <button type="button" onClick={() => { onPick(o.key); onClose(); }} className="flex w-full items-center gap-3 py-3 text-left active:bg-slate-50">
              {icons && <CategoryIcon category={o.key} />}
              <span className="min-w-0 flex-1">
                <span className={`block text-[15px] ${o.key === current ? "font-semibold text-slate-900" : "text-slate-800"}`}>{o.label}</span>
                {o.hint && <span className="block text-xs text-slate-500">{o.hint}</span>}
              </span>
              {o.key === current && <Check className="h-4 w-4 text-blue-600" />}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="py-8 text-center text-sm text-slate-400">Sin resultados.</li>}
      </ul>
    </BottomSheet>
  );
}

const KIND_HINT: Record<Kind, string> = {
  gasto: "Dinero que sale de verdad.",
  ingreso: "Nómina, intereses…",
  regalo: "Dinero recibido que no es un ingreso ordinario.",
  devolucion: "Resta del gasto de su categoría.",
  interna: "Entre tus cuentas: no es gasto ni ingreso.",
  ahorro: "Aportación a ahorro o inversión: no es gasto.",
};

function Row({ onClick, children, chevron = true }: { onClick?: () => void; children: ReactNode; chevron?: boolean }) {
  const body = <>{children}{chevron && <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}</>;
  return (
    <li>
      {onClick
        ? <button type="button" onClick={onClick} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-slate-50">{body}</button>
        : <div className="flex items-center gap-3 py-3.5">{body}</div>}
    </li>
  );
}

export function MovementDetailSheet({ item, onClose, items = [] }: { item: Item | null; onClose: () => void; items?: Item[] }) {
  const [override, setOverride] = useState<Partial<Values>>({});
  const [sheet, setSheet] = useState<null | "category" | "subcategory" | "note" | "kind" | "month">(null);
  // «Cambiar fecha»: mes en que cuenta el gasto (lo guardado o lo que acabas de elegir).
  const [imputed, setImputed] = useState<string | null | undefined>(undefined);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [similar, setSimilar] = useState<{ count: number; differ: number; label: string } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = item?.id;

  // Al abrir otro movimiento se empieza de cero y se consulta cuántos parecidos tiene y cuántos son distintos.
  const [checkedAt, setCheckedAt] = useState(0);
  const recheck = () => setCheckedAt((n) => n + 1);
  // Cómo estaba al abrirlo: el botón de parecidos solo sale si lo has cambiado respecto a esto.
  const [opened, setOpened] = useState<Values | null>(null);
  useEffect(() => {
    setOverride({}); setSheet(null); setEditingName(false); setSimilar(null); setToast(null); setErr(null); setImputed(undefined);
    setOpened(item ? valuesOf(item) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    fapi<{ count: number; differ: number; label: string }>(`transaction/similar?id=${encodeURIComponent(id)}`).then((r) => { if (alive) setSimilar(r); }).catch(() => undefined);
    return () => { alive = false; };
  }, [id, checkedAt]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const subSuggestions = useMemo(() => {
    if (!item) return [];
    const cat = override.category ?? item.category;
    return [...new Set(items.filter((t) => t.category === cat && t.subcategory).map((t) => t.subcategory as string))].sort((a, b) => a.localeCompare(b, "es")).slice(0, 12);
  }, [items, item, override.category]);

  if (!item) return null;
  const v: Values = { ...valuesOf(item), ...override };
  const shownName = v.alias || item.counterparty || item.description;
  const spend = v.kind === "gasto" || v.kind === "devolucion";
  const canExtra = spend || v.kind === "ingreso" || v.kind === "regalo";

  /** Guarda en este movimiento (al momento, con «Deshacer») y, si procede, lo apunta para los parecidos. */
  const save = async (patch: Partial<Values>, field: Field | null, text = "Guardado") => {
    const prev = v;
    const next: Values = { ...v, ...patch };
    if (patch.kind) {
      const opts = categoriesFor(next.kind);
      if (next.kind === "interna") next.category = "transferencia_interna";
      else if (!opts.some((o) => o.key === next.category)) next.category = opts[0]?.key ?? "otros_gastos";
    }
    setOverride((o) => ({ ...o, ...next }));
    setErr(null);
    try {
      await fapi("transaction", { id: item.id, category: next.category, kind: next.kind, extraordinary: next.extraordinary, alias: next.alias ?? "", subcategory: next.subcategory ?? "", note: next.note ?? "", applyToSimilar: false });
      refreshFinance();
      recheck();
      setToast({ text, undo: () => void undoTo(prev, field) });
    } catch (e) {
      setOverride((o) => ({ ...o, ...prev }));
      setErr(errorText(e));
    }
  };
  const undoTo = async (prev: Values, field: Field | null) => {
    setOverride((o) => ({ ...o, ...prev }));
    setToast(null);
    try {
      await fapi("transaction", { id: item.id, category: prev.category, kind: prev.kind, extraordinary: prev.extraordinary, alias: prev.alias ?? "", subcategory: prev.subcategory ?? "", note: prev.note ?? "", applyToSimilar: false });
      refreshFinance();
      recheck();
    } catch (e) {
      setErr(errorText(e));
    }
  };
  const applySimilar = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fapi<{ count: number; undo: Undo }>("transaction/similar/apply", { id: item.id, fields: fieldsToApply });
      refreshFinance();
      recheck();
      setToast({
        text: `Aplicado a ${r.count} ${r.count === 1 ? "movimiento" : "movimientos"} y a los que lleguen`,
        undo: r.undo ? () => { setToast(null); void fapi("transaction/similar/undo", { undo: r.undo }).then(() => { refreshFinance(); recheck(); }).catch((e) => setErr(errorText(e))); } : undefined,
      });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const saveName = () => {
    setEditingName(false);
    const value = name.trim();
    const original = item.counterparty || item.description;
    const alias = !value || value === original ? null : value.slice(0, 80);
    if (alias !== v.alias) void save({ alias }, "alias", "Nombre guardado");
  };

  // Qué se lleva a los parecidos: la categoría siempre; el nombre y la subcategoría solo si los tiene (vacíos no
  // borran los de los demás).
  const fieldsToApply: Field[] = ["category", ...(v.alias ? ["alias" as const] : []), ...(v.subcategory ? ["subcategory" as const] : [])];
  const applyText = fieldsToApply.map((f) => FIELD_LABEL[f]);
  // Solo si hay algo que replicar: parecidos que todavía no coinciden con este movimiento.
  // y solo cuando tú has cambiado algo replicable en este movimiento.
  const base = opened ?? valuesOf(item);
  const edited = v.category !== base.category || v.kind !== base.kind || (v.alias ?? null) !== base.alias || (v.subcategory ?? null) !== base.subcategory;
  const showApply = edited && !!similar && similar.differ > 0;

  // Meses para «Cambiar fecha»: de 3 antes a 24 después del mes del cargo. Se guarda el día 15 de ese mes (cae en
  // el ciclo que lleva su nombre, también si el ciclo empieza el 25).
  const chargeMonth = item.date.slice(0, 7);
  const currentImputed = imputed === undefined ? item.imputedDate ?? null : imputed;
  const shownMonth = currentImputed ? currentImputed.slice(0, 7) : chargeMonth;
  const monthName = (ym: string) => new Date(`${ym}-15T00:00:00Z`).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  const monthOptions = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(`${chargeMonth}-15T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + i - 3);
    const ym = d.toISOString().slice(0, 7);
    return { key: ym, label: monthName(ym).replace(/^./, (c) => c.toUpperCase()), hint: ym === chargeMonth ? "Mes del cargo" : undefined };
  });
  const changeMonth = async (ym: string) => {
    const prev = currentImputed;
    const next = ym === chargeMonth ? null : `${ym}-15`;
    setImputed(next);
    try {
      await fapi("transaction/imputed", { id: item.id, date: next });
      refreshFinance();
      setToast({ text: next ? `Ahora cuenta en ${monthName(ym)}` : "Vuelve a contar en el mes del cargo", undo: () => {
        setImputed(prev);
        void fapi("transaction/imputed", { id: item.id, date: prev }).then(refreshFinance).catch((e) => setErr(errorText(e)));
      } });
    } catch (e) {
      setImputed(prev);
      setErr(errorText(e));
    }
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} className="gap-0 bg-white p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <div className="relative flex h-full min-h-0 flex-col pt-[env(safe-area-inset-top)]">
          <SheetTitle className="sr-only">{shownName}</SheetTitle>
          <div className="flex h-14 shrink-0 items-center px-2">
            <button type="button" onClick={onClose} aria-label="Volver" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-20">
            <div className="flex items-center gap-3">
              <BankLogo bank={item.bank} className="h-11 w-11" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{item.account}</span>
                {item.accountLast4 && <span className="block text-xs tabular-nums text-slate-400">···· {item.accountLast4}</span>}
              </span>
              <span className={`shrink-0 text-3xl font-semibold tabular-nums tracking-tight ${item.amount > 0 ? "text-emerald-700" : v.kind === "interna" ? "text-slate-400" : "text-slate-900"}`}>
                {item.amount > 0 ? "+" : ""}{eur(item.amount, 2)}
              </span>
            </div>
            {editingName ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingName(false); }}
                maxLength={80}
                aria-label="Nombre del movimiento"
                className="mt-5 w-full rounded-xl border border-blue-300 px-2 py-1 text-2xl font-semibold text-slate-900 outline-none ring-2 ring-blue-100"
              />
            ) : (
              <button type="button" onClick={() => { setName(shownName); setEditingName(true); }} className="group mt-5 flex max-w-full items-center gap-2 text-left" aria-label="Cambiar el nombre">
                <span className="min-w-0 break-words text-2xl font-semibold text-slate-900">{shownName}</span>
                <Pencil className="h-4 w-4 shrink-0 text-slate-300 group-active:text-blue-600" />
              </button>
            )}
            <SheetDescription className="mt-1 text-sm text-slate-500">{longDay(item.date)}</SheetDescription>
            {shownName !== item.description && <p className="mt-1 break-words text-xs text-slate-400">{item.description}</p>}

            <ul className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
              <Row onClick={() => setSheet("category")}>
                <CategoryIcon category={v.kind === "interna" ? "transferencia_interna" : v.category} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-slate-800">{spend ? categoryOf(v.category).label : KIND_LABEL[v.kind]}</span>
                  <span className="block text-xs text-slate-400">{override.category ? "Corregido por ti" : SOURCE_LABEL[item.source] ?? item.source}</span>
                </span>
              </Row>
              <Row onClick={() => setSheet("subcategory")}>
                <span className="w-9 shrink-0 text-center text-xs text-slate-400">Sub</span>
                <span className={`min-w-0 flex-1 truncate text-[15px] ${v.subcategory ? "text-slate-800" : "text-slate-400"}`}>{v.subcategory || "Añadir subcategoría"}</span>
              </Row>
              <Row onClick={() => setSheet("note")}>
                <span className="w-9 shrink-0 text-center text-xs text-slate-400">Nota</span>
                <span className={`min-w-0 flex-1 whitespace-pre-line break-words text-[15px] ${v.note ? "text-slate-800" : "text-slate-400"}`}>{v.note || "Añadir una nota"}</span>
              </Row>
              <Row onClick={() => setSheet("kind")}>
                <span className="w-9 shrink-0 text-center text-xs text-slate-400">Tipo</span>
                <span className="min-w-0 flex-1 text-[15px] text-slate-800">{KIND_LABEL[v.kind]}</span>
              </Row>
              {canExtra && (
                <li>
                  <label className="flex cursor-pointer items-center gap-3 py-3.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] text-slate-800">Extraordinario</span>
                      <span className="block text-xs text-slate-400">{spend ? "Gasto puntual: cuenta en tu gasto, pero no en tus medias ni en la previsión." : "Ingreso puntual (un extra, una venta…): cuenta en tus ingresos, pero no como ingreso habitual."}</span>
                    </span>
                    <input type="checkbox" role="switch" checked={v.extraordinary} onChange={(e) => void save({ extraordinary: e.target.checked }, null, e.target.checked ? "Marcado como extraordinario" : "Ya no es extraordinario")} className="peer sr-only" />
                    <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${v.extraordinary ? "bg-amber-500" : "bg-slate-200"}`}>
                      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${v.extraordinary ? "left-[22px]" : "left-0.5"}`} />
                    </span>
                  </label>
                </li>
              )}
              {spend && (
                <Row onClick={() => setSheet("month")}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-slate-800">Cambiar fecha</span>
                    <span className="block text-xs text-slate-400">
                      {currentImputed ? `Cuenta en tu plan de ${monthName(shownMonth)} (pagado el ${longDay(item.date)})` : "Para que cuente en otro mes: entradas que compras antes, una cena que pagas después…"}
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm ${currentImputed ? "font-medium text-blue-700" : "text-slate-400"}`}>{monthName(shownMonth).replace(/ de /, " ")}</span>
                </Row>
              )}
            </ul>
            {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
          </div>

          {showApply && (
            <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <button type="button" onClick={() => void applySimilar()} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-blue-600 px-4 text-sm font-semibold text-blue-700 active:bg-blue-50 disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <span className="truncate">Aplicar a {similar.differ === 1 ? "1 movimiento más" : `${similar.differ} movimientos más`} de «{similar.label}»</span>
              </button>
              <p className="mt-1.5 text-center text-xs text-slate-400">Copia {applyText.length > 1 ? `${applyText.slice(0, -1).join(", ")} y ${applyText[applyText.length - 1]}` : applyText[0]}, también a los que lleguen.</p>
            </div>
          )}

          {toast && (
            <div role="status" className={`absolute inset-x-4 ${showApply ? "bottom-[calc(7rem+env(safe-area-inset-bottom))]" : "bottom-[max(1rem,env(safe-area-inset-bottom))]"} flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg`}>
              <span className="min-w-0 flex-1">{toast.text}</span>
              {toast.undo && <button type="button" onClick={toast.undo} className="shrink-0 font-semibold text-blue-300">Deshacer</button>}
            </div>
          )}

          <BottomSheet open={sheet === "category"} onClose={() => setSheet(null)} title="Selecciona una categoría" subtitle={shownName} tall>
            <CategoryPicker
              current={v.category}
              kind={v.kind}
              movement={{ description: item.description, counterparty: item.counterparty, amount: item.amount }}
              onPick={(c) => {
                setSheet(null);
                // El tipo sale de la categoría: una de gasto sigue siendo devolución si ya lo era.
                const kind: Kind = c.kind === "gasto" ? (v.kind === "devolucion" ? "devolucion" : "gasto") : c.kind;
                if (c.key !== v.category || kind !== v.kind) void save({ category: c.key, kind }, "category", `Ahora es ${c.label}`);
              }}
            />
          </BottomSheet>
          <PickSheet
            open={sheet === "month"}
            onClose={() => setSheet(null)}
            title="¿En qué mes cuenta este gasto?"
            subtitle="El cargo no cambia de fecha: solo el mes en que cuenta en tu plan."
            current={shownMonth}
            options={monthOptions}
            onPick={(ym) => { if (ym !== shownMonth) void changeMonth(ym); }}
          />
          <PickSheet
            open={sheet === "kind"}
            onClose={() => setSheet(null)}
            title="¿Qué es este movimiento?"
            current={v.kind}
            options={KINDS.map((k) => ({ key: k, label: KIND_LABEL[k], hint: KIND_HINT[k] }))}
            onPick={(kind) => { if (kind !== v.kind) void save({ kind: kind as Kind }, "category", `Ahora es ${KIND_LABEL[kind as Kind]}`); }}
          />
          <TextSheet
            open={sheet === "subcategory"}
            onClose={() => setSheet(null)}
            title="Subcategoría"
            initial={v.subcategory ?? ""}
            placeholder={`Dentro de ${categoryOf(v.category).label}, p. ej. «Agua»`}
            suggestions={subSuggestions}
            onSave={(s) => { if ((s || null) !== v.subcategory) void save({ subcategory: s || null }, "subcategory", s ? "Subcategoría guardada" : "Subcategoría quitada"); }}
          />
          <TextSheet
            open={sheet === "note"}
            onClose={() => setSheet(null)}
            title="Nota"
            initial={v.note ?? ""}
            placeholder="P. ej. «mi parte de la cena de Ana»"
            multiline
            onSave={(s) => { if ((s || null) !== v.note) void save({ note: s || null }, null, s ? "Nota guardada" : "Nota quitada"); }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Gasto previsto: la misma pantalla de detalle, marcada como previsto ─────────────────────────

export type PlannedItem = { id: string; title: string; amount: number; date: string; category: string };

/**
 * Detalle de un gasto previsto (aún sin pagar): la misma pantalla que un movimiento, con la marca «Previsto, sin
 * pagar» en azul. Se cambian el nombre, el importe, la fecha y la categoría (se guarda al momento, con «Deshacer»)
 * y se puede borrar. Al llegar el cargo del banco se enlazará con él (fase 4).
 */
export function PlannedDetailSheet({ item, onClose, onDelete }: { item: PlannedItem | null; onClose: () => void; onDelete: (p: PlannedItem) => void }) {
  const [v, setV] = useState<PlannedItem | null>(item);
  const [sheet, setSheet] = useState<null | "category" | "amount" | "date">(null);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dateDraft, setDateDraft] = useState("");
  useEffect(() => { setV(item); setSheet(null); setEditingName(false); setToast(null); setErr(null); setConfirmDelete(false); }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 5000); return () => window.clearTimeout(t); }, [toast]);
  if (!item || !v) return null;

  const save = async (patch: Partial<PlannedItem>, text: string) => {
    const prev = v;
    const next = { ...v, ...patch };
    setV(next); setErr(null);
    try {
      await fapi("planned/update", next);
      refreshFinance();
      setToast({ text, undo: () => { setToast(null); setV(prev); void fapi("planned/update", prev).then(refreshFinance); } });
    } catch (e) {
      setV(prev);
      setErr(errorText(e));
    }
  };
  const saveName = () => {
    setEditingName(false);
    const t = name.trim().slice(0, 80);
    if (t && t !== v.title) void save({ title: t }, "Nombre cambiado");
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} className="gap-0 bg-white p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <div className="relative flex h-full min-h-0 flex-col pt-[env(safe-area-inset-top)]">
          <SheetTitle className="sr-only">{v.title}</SheetTitle>
          <div className="flex h-14 shrink-0 items-center gap-2 px-2">
            <button type="button" onClick={onClose} aria-label="Volver" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="ml-auto mr-3 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <CalendarClock className="h-3.5 w-3.5" /> Previsto, sin pagar
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-20">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-blue-50 text-blue-600" aria-hidden="true"><CalendarClock className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">Gasto previsto</span>
                <span className="block text-xs text-slate-400">Se enlazará con el cargo cuando llegue</span>
              </span>
              <button type="button" onClick={() => setSheet("amount")} aria-label="Cambiar el importe" className="shrink-0 text-3xl font-semibold tabular-nums tracking-tight text-blue-700 active:opacity-70">
                {eur(-v.amount, 2)}
              </button>
            </div>
            {editingName ? (
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingName(false); }}
                maxLength={80} aria-label="Nombre del previsto"
                className="mt-5 w-full rounded-xl border border-blue-300 px-2 py-1 text-2xl font-semibold text-slate-900 outline-none ring-2 ring-blue-100" />
            ) : (
              <button type="button" onClick={() => { setName(v.title); setEditingName(true); }} className="group mt-5 flex max-w-full items-center gap-2 text-left" aria-label="Cambiar el nombre">
                <span className="min-w-0 break-words text-2xl font-semibold text-slate-900">{v.title}</span>
                <Pencil className="h-4 w-4 shrink-0 text-slate-300 group-active:text-blue-600" />
              </button>
            )}
            <SheetDescription className="mt-1 text-sm text-blue-700">Previsto para el {longDay(v.date)}</SheetDescription>

            <ul className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
              <Row onClick={() => setSheet("category")}>
                <CategoryIcon category={v.category} />
                <span className="min-w-0 flex-1 text-[15px] text-slate-800">{categoryOf(v.category).label}</span>
              </Row>
              <Row onClick={() => { setDateDraft(v.date); setSheet("date"); }}>
                <span className="w-9 shrink-0 text-center text-xs text-slate-400">Fecha</span>
                <span className="min-w-0 flex-1 text-[15px] text-slate-800">{longDay(v.date)}</span>
              </Row>
              <Row onClick={() => setSheet("amount")}>
                <span className="w-9 shrink-0 text-center text-xs text-slate-400">Importe</span>
                <span className="amount min-w-0 flex-1 text-[15px] tabular-nums text-slate-800">{eur(v.amount, 2)}</span>
              </Row>
            </ul>
            {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
            <button type="button" onClick={() => (confirmDelete ? onDelete(v) : setConfirmDelete(true))}
              className={`mt-6 w-full rounded-xl py-3 text-sm font-semibold ${confirmDelete ? "bg-red-600 text-white" : "text-red-600 active:bg-red-50"}`}>
              {confirmDelete ? "Sí, borrar este previsto" : "Borrar previsto"}
            </button>
          </div>

          {toast && (
            <div role="status" className="absolute inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
              <span className="min-w-0 flex-1">{toast.text}</span>
              {toast.undo && <button type="button" onClick={toast.undo} className="shrink-0 font-semibold text-blue-300">Deshacer</button>}
            </div>
          )}

          <BottomSheet open={sheet === "category"} onClose={() => setSheet(null)} title="Selecciona una categoría" subtitle={v.title} tall>
            <CategoryPicker current={v.category} kind="gasto" movement={{ description: v.title, counterparty: null, amount: -v.amount }}
              onPick={(c) => { setSheet(null); if (c.key !== v.category) void save({ category: c.key }, `Ahora es ${c.label}`); }} />
          </BottomSheet>
          <TextSheet open={sheet === "amount"} onClose={() => setSheet(null)} title="Importe" initial={String(v.amount).replace(".", ",")} placeholder="0,00"
            onSave={(raw) => {
              const t = raw.trim().replace(/\s|€/g, "");
              const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
              if (Number.isFinite(n) && n > 0 && n !== v.amount) void save({ amount: Math.round(n * 100) / 100 }, "Importe cambiado");
            }} />
          <BottomSheet open={sheet === "date"} onClose={() => setSheet(null)} title="Fecha" subtitle={v.title}>
            <div className="space-y-3 px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <input type="date" value={dateDraft} onChange={(e) => setDateDraft(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              <button type="button" onClick={() => { setSheet(null); if (dateDraft && dateDraft !== v.date) void save({ date: dateDraft }, `Ahora es el ${longDay(dateDraft)}`); }}
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700">Guardar</button>
            </div>
          </BottomSheet>
        </div>
      </SheetContent>
    </Sheet>
  );
}
