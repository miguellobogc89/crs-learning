"use client";
// Movimientos: los del periodo elegido (el mismo de Inicio), con su significado (gasto, interna, ahorro…) y su
// categoría. Se buscan, filtran, agrupan y ordenan con la cabecera común; se cambian de uno en uno o varios a la
// vez, y al corregir se puede aplicar a los parecidos: la app crea una regla y aprende.
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronDown, ListFilter, Loader2, Sparkles, Star, X } from "lucide-react";
import type { listTransactions } from "@/lib/finance/service";
import { CATEGORIES, KINDS, KIND_LABEL, categoryOf, type Kind } from "@/lib/finance/categories";
import { eur, field, ghost, panel, primary, th } from "@/components/trading/format";
import { ErrorNote, Modal, Pill } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { errorText, fapi, longDay, refreshFinance, shortDay, useFinance } from "./api";
import { requestClassify } from "./shell";
import { AccountChips, PeriodPicker } from "./period";
import { TableToolbar, type ToolbarSort } from "@/components/ui/table-toolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type List = Awaited<ReturnType<typeof listTransactions>>;
type Item = List["items"][number];

const SOURCE_LABEL: Record<string, string> = {
  usuario: "Corregido por ti",
  regla: "Por una regla tuya",
  interna: "Detectado entre tus cuentas",
  palabra: "Por el comercio",
  ia: "Clasificado por la IA",
  auto: "Sin entender: revísalo",
  pendiente: "Pendiente",
};

const KIND_COLOR: Record<Kind, string> = { gasto: "slate", ingreso: "emerald", regalo: "violet", devolucion: "teal", interna: "blue", ahorro: "amber" };

function CategoryPill({ t }: { t: Pick<Item, "category" | "kind"> }) {
  const c = categoryOf(t.category);
  return <Pill color={t.kind === "gasto" ? c.color : KIND_COLOR[t.kind]}>{t.kind === "gasto" || t.kind === "devolucion" ? c.label : KIND_LABEL[t.kind]}</Pill>;
}

function Amount({ t }: { t: Item }) {
  const muted = t.kind === "interna";
  return <span className={`whitespace-nowrap font-semibold tabular-nums ${muted ? "text-slate-400" : t.amount > 0 ? "text-emerald-700" : "text-slate-900"}`}>{t.amount > 0 ? "+" : ""}{eur(t.amount, 2)}</span>;
}

function EditModal({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const [category, setCategory] = useState("otros_gastos");
  const [kind, setKind] = useState<Kind>("gasto");
  const [extra, setExtra] = useState(false);
  const [note, setNote] = useState("");
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
    setSimilar(true);
    setErr(null);
    setDone(null);
  }, [item]);
  if (!item) return null;
  const options = CATEGORIES.filter((c) => c.key !== "sin_clasificar" && (kind === "gasto" || kind === "devolucion" ? c.kind === "gasto" : kind === "ingreso" ? c.kind === "ingreso" : c.kind === kind));
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const cat = options.some((o) => o.key === category) ? category : options[0]?.key ?? "otros_gastos";
      const r = await fapi<{ similar: number }>("transaction", { id: item.id, category: cat, kind, extraordinary: extra, note, applyToSimilar: similar });
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

// ---------------------------------------------------------------------------------------------------------
// Movimientos: cabecera común (buscar, periodo, filtrar, agrupar, ordenar), cuentas, tabla agrupada con
// subtotales y selección para cambiar varios a la vez.
// ---------------------------------------------------------------------------------------------------------
type Group = "none" | "bucket" | "category" | "kind" | "account";
type Status = "all" | "revisar" | "usuario" | "extra";
type Sort = NonNullable<ToolbarSort>;

const SORTS: { label: string; value: Sort }[] = [
  { label: "Más recientes", value: { key: "date", dir: -1 } },
  { label: "Más antiguos", value: { key: "date", dir: 1 } },
  { label: "Mayor importe", value: { key: "abs", dir: -1 } },
  { label: "Mayor gasto", value: { key: "amount", dir: 1 } },
  { label: "Mayor ingreso", value: { key: "amount", dir: -1 } },
  { label: "Concepto A-Z", value: { key: "text", dir: 1 } },
];
const GROUPS: { value: Group; label: string }[] = [
  { value: "none", label: "Sin agrupar" },
  { value: "bucket", label: "Ciclo o mes" },
  { value: "category", label: "Categoría" },
  { value: "kind", label: "Tipo" },
  { value: "account", label: "Cuenta" },
];
const PAGE = 150;
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const isReview = (t: Item) => t.source === "auto" || t.source === "pendiente";
const label = (t: Item) => t.counterparty || t.description;

/** Ingresos, gastos y neto de unas filas (sin movimientos entre cuentas ni cuentas excluidas). */
function sums(rows: Item[]) {
  let income = 0, expenses = 0, saved = 0;
  for (const t of rows) {
    if (t.excluded) continue;
    if (t.kind === "ingreso" || t.kind === "regalo") income += t.amount;
    else if (t.kind === "gasto" || t.kind === "devolucion") expenses -= t.amount;
    else if (t.kind === "ahorro") saved -= t.amount;
  }
  return { income, expenses, saved, net: income - expenses };
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento: vale para esta visita.
  }
}

/** Categorías que encajan con un tipo (un gasto o una devolución usan las de gasto). */
const categoriesFor = (kind: Kind) =>
  CATEGORIES.filter((c) => c.key !== "sin_clasificar" && (kind === "gasto" || kind === "devolucion" ? c.kind === "gasto" : c.kind === kind));

/** Cambio rápido desde la propia fila: tipo o categoría con un toque. */
function QuickEdit({ t, onMore, onDone }: { t: Item; onMore: () => void; onDone: (msg: string) => void }) {
  const apply = async (patch: { kind?: Kind; category?: string }) => {
    try {
      await fapi("transactions/bulk", { ids: [t.id], ...patch });
      onDone("Movimiento actualizado");
      refreshFinance();
    } catch (e) {
      onDone(errorText(e));
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-full hover:opacity-80" aria-label="Cambiar tipo o categoría">
          <CategoryPill t={t} />
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60vh] w-60 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-caption text-muted-foreground">Tipo</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={t.kind} onValueChange={(v) => void apply({ kind: v as Kind })}>
          {KINDS.map((k) => <DropdownMenuRadioItem key={k} value={k}>{KIND_LABEL[k]}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        {categoriesFor(t.kind).length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-caption text-muted-foreground">Categoría</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={t.category} onValueChange={(v) => void apply({ category: v })}>
              {categoriesFor(t.kind).map((c) => <DropdownMenuRadioItem key={c.key} value={c.key}>{c.label}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onMore}><Sparkles className="mr-2 h-4 w-4" />Más opciones y aplicar a parecidos…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Barra de la selección: cambiar tipo, categoría o extraordinario de todos a la vez. */
function BulkBar({ ids, onClear, onDone }: { ids: string[]; onClear: () => void; onDone: (msg: string) => void }) {
  const [similar, setSimilar] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (patch: { kind?: Kind; category?: string; extraordinary?: boolean }) => {
    setBusy(true);
    try {
      const r = await fapi<{ changed: number; similar: number }>("transactions/bulk", { ids, ...patch, applyToSimilar: similar });
      onDone(`${r.changed} ${r.changed === 1 ? "movimiento cambiado" : "movimientos cambiados"}${r.similar ? ` y ${r.similar} parecidos` : ""}`);
      onClear();
      refreshFinance();
    } catch (e) {
      onDone(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50";
  return (
    <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-1 border-t border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white">
      <span className="mr-2 font-semibold tabular-nums">{ids.length} {ids.length === 1 ? "seleccionado" : "seleccionados"}</span>
      {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" disabled={busy} className={btn}>Tipo <ChevronDown className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {KINDS.map((k) => <DropdownMenuItem key={k} onSelect={() => void run({ kind: k })}>{KIND_LABEL[k]}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" disabled={busy} className={btn}>Categoría <ChevronDown className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[60vh] w-60 overflow-y-auto">
          <DropdownMenuLabel className="text-caption text-muted-foreground">Gastos</DropdownMenuLabel>
          {categoriesFor("gasto").map((c) => <DropdownMenuItem key={c.key} onSelect={() => void run({ category: c.key })}>{c.label}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-caption text-muted-foreground">Ingresos</DropdownMenuLabel>
          {categoriesFor("ingreso").map((c) => <DropdownMenuItem key={c.key} onSelect={() => void run({ category: c.key })}>{c.label}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" disabled={busy} className={btn}><Star className="h-3.5 w-3.5" /> Extraordinario <ChevronDown className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onSelect={() => void run({ extraordinary: true })}>Marcar como extraordinarios</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void run({ extraordinary: false })}>Quitar la marca</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <label className="ml-1 inline-flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-200 hover:bg-white/10" title="Crea una regla por cada comercio y la aplica a los demás movimientos suyos y a los que lleguen">
        <input type="checkbox" checked={similar} onChange={(e) => setSimilar(e.target.checked)} className="h-4 w-4 rounded border-slate-500" />
        y a los parecidos
      </label>
      <button type="button" onClick={onClear} className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Quitar la selección"><X className="h-4 w-4" /></button>
    </div>
  );
}

function Check({ checked, partial = false, onChange, label: aria }: { checked: boolean; partial?: boolean; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={aria}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = partial && !checked;
      }}
      onClick={(e) => e.stopPropagation()}
      onChange={onChange}
      className="h-4 w-4 cursor-pointer rounded border-slate-300 align-middle"
    />
  );
}

export function MovementsPanel() {
  const params = useSearchParams();
  const { data, error, loading } = useFinance<List>("transactions");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [category, setCategory] = useState(params.get("categoria") ?? "all");
  const [status, setStatus] = useState<Status>(params.get("revisar") === "1" ? "revisar" : "all");
  const [group, setGroup] = useState<Group>("none");
  const [sort, setSort] = useState<Sort>(SORTS[0].value);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [editing, setEditing] = useState<Item | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reclassifying, setReclassifying] = useState(false);

  // Agrupación y orden: se recuerdan en este navegador.
  useEffect(() => {
    setGroup(readLocal<Group>("crs-finance:mov-group", "bucket"));
    setSort(readLocal<Sort>("crs-finance:mov-sort", SORTS[0].value));
  }, []);
  useEffect(() => writeLocal("crs-finance:mov-group", group), [group]);
  useEffect(() => writeLocal("crs-finance:mov-sort", sort), [sort]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);
  useEffect(() => setShown(PAGE), [q, kind, category, status, group, sort, data?.from, data?.to]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = fold(q.trim());
    const out = data.items.filter((t) =>
      (kind === "all" || t.kind === kind) &&
      (category === "all" || t.category === category) &&
      (status === "all" || (status === "revisar" ? isReview(t) : status === "usuario" ? t.source === "usuario" : t.extraordinary)) &&
      (!needle || fold(`${t.description} ${t.counterparty ?? ""} ${t.note ?? ""} ${t.account} ${Math.abs(t.amount).toFixed(2).replace(".", ",")}`).includes(needle)));
    const v = (t: Item): string | number => (sort.key === "date" ? t.date : sort.key === "abs" ? Math.abs(t.amount) : sort.key === "amount" ? t.amount : fold(label(t)));
    return [...out].sort((a, b) => {
      const x = v(a), y = v(b);
      const c = typeof x === "string" && typeof y === "string" ? x.localeCompare(y, "es") : (x as number) - (y as number);
      return c === 0 ? b.date.localeCompare(a.date) : c * sort.dir;
    });
  }, [data, q, kind, category, status, sort]);

  const groups = useMemo(() => {
    if (group === "none") return [{ key: "all", title: "", rows }];
    const keyOf = (t: Item) => (group === "bucket" ? t.bucket : group === "category" ? t.category : group === "kind" ? t.kind : t.accountId);
    const titleOf = (k: string, t: Item) =>
      group === "bucket" ? data?.bucketLabels[k] ?? k : group === "category" ? categoryOf(k).label : group === "kind" ? KIND_LABEL[k as Kind] : t.account;
    const map = new Map<string, { key: string; title: string; rows: Item[] }>();
    for (const t of rows) {
      const k = keyOf(t);
      if (!map.has(k)) map.set(k, { key: k, title: titleOf(k, t), rows: [] });
      map.get(k)!.rows.push(t);
    }
    const list = [...map.values()];
    if (group === "bucket") list.sort((a, b) => (sort.key === "date" && sort.dir === 1 ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key)));
    else if (group === "kind") list.sort((a, b) => KINDS.indexOf(a.key as Kind) - KINDS.indexOf(b.key as Kind));
    else if (group === "category") list.sort((a, b) => Math.abs(sums(b.rows).expenses) - Math.abs(sums(a.rows).expenses) || b.rows.length - a.rows.length);
    else list.sort((a, b) => a.title.localeCompare(b.title, "es"));
    return list;
  }, [rows, group, sort, data]);

  const total = useMemo(() => sums(rows), [rows]);
  const allIds = rows.map((t) => t.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  // Al cambiar los datos o los filtros, la selección se queda solo con lo que sigue a la vista.
  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(rows.map((t) => t.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const reclassify = async () => {
    setReclassifying(true);
    try {
      await fapi("reclassify", {});
      refreshFinance();
      requestClassify();
    } finally {
      setReclassifying(false);
    }
  };

  // Filas a pintar: por páginas de 150 (los grupos plegados no cuentan).
  let budget = shown;
  const painted = groups.map((g) => {
    const open = !collapsed.has(g.key);
    const take = open ? g.rows.slice(0, Math.max(0, budget)) : [];
    budget -= take.length;
    return { ...g, open, visible: take };
  });
  const hiddenCount = groups.reduce((s, g) => s + (collapsed.has(g.key) ? 0 : g.rows.length), 0) - (shown - Math.max(0, budget));
  const filters = Number(kind !== "all") + Number(category !== "all") + Number(status !== "all");

  const rowCells = (t: Item) => (
    <>
      <td className="w-10 px-3 py-2.5"><Check checked={selected.has(t.id)} onChange={() => toggle([t.id], !selected.has(t.id))} label="Seleccionar" /></td>
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{shortDay(t.date)}</td>
      <td className="max-w-[28rem] px-3 py-2.5">
        <span className="flex items-center gap-1.5">
          {t.kind === "interna" && <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          {t.extraordinary && <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Extraordinario" />}
          <span className="truncate font-medium text-slate-900" title={t.description}>{label(t)}</span>
        </span>
        {t.note ? <span className="block truncate text-xs text-slate-500">{t.note}</span> : t.counterparty ? <span className="block truncate text-xs text-slate-400">{t.description}</span> : null}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <QuickEdit t={t} onMore={() => setEditing(t)} onDone={setToast} />
        {isReview(t) && <span className="ml-1.5 text-xs text-amber-700">revisar</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{t.account}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right"><Amount t={t} /></td>
    </>
  );

  const groupHeader = (g: (typeof painted)[number], mobile: boolean) => {
    const s = sums(g.rows);
    const ids = g.rows.map((t) => t.id);
    const all = ids.every((id) => selected.has(id));
    const some = ids.some((id) => selected.has(id));
    const flip = () => setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(g.key)) next.delete(g.key);
      else next.add(g.key);
      return next;
    });
    const body = (
      <div className="flex items-center gap-3">
        <Check checked={all} partial={some} onChange={() => toggle(ids, !all)} label={`Seleccionar ${g.title}`} />
        <button type="button" onClick={flip} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${g.open ? "" : "-rotate-90"}`} />
          <span className="truncate font-semibold text-slate-900">{g.title}</span>
          <span className="shrink-0 text-xs text-slate-400">{g.rows.length}</span>
        </button>
        <span className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
          {s.income ? <span className="text-emerald-700">+{eur(s.income, 2)}</span> : null}
          {s.expenses ? <span className="text-slate-700">−{eur(s.expenses, 2)}</span> : null}
          {!mobile && s.income && s.expenses ? <b className={s.net >= 0 ? "text-emerald-700" : "text-red-700"}>{eur(s.net, 2)}</b> : null}
        </span>
      </div>
    );
    return mobile ? (
      <li key={`h:${g.key}`} className="sticky top-0 z-10 bg-slate-50 px-4 py-2 text-sm">{body}</li>
    ) : (
      <tr key={`h:${g.key}`} className="bg-slate-50/80">
        <td colSpan={6} className="px-3 py-2 text-sm">{body}</td>
      </tr>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TableToolbar
        search={q}
        onSearchChange={setQ}
        searchPlaceholder="Buscar concepto, comercio, nota o importe..."
        extra={data ? <PeriodPicker view={data.view} label={data.label} /> : null}
        filters={{
          groups: [
            { key: "status", label: "Estado", value: status, allLabel: "Todos", options: [{ value: "revisar", label: "Por revisar" }, { value: "usuario", label: "Corregidos por mí" }, { value: "extra", label: "Extraordinarios" }] },
            { key: "kind", label: "Tipo", value: kind, allLabel: "Todos los tipos", allIcon: ListFilter, options: KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })) },
            { key: "category", label: "Categoría", value: category, allLabel: "Todas las categorías", allIcon: ListFilter, options: CATEGORIES.filter((c) => c.key !== "sin_clasificar").map((c) => ({ value: c.key, label: c.label })) },
          ],
          onChange: (key, value) => (key === "status" ? setStatus(value as Status) : key === "kind" ? setKind(value) : setCategory(value)),
          onClear: () => {
            setStatus("all");
            setKind("all");
            setCategory("all");
          },
        }}
        group={{ value: group, options: GROUPS, onChange: (v) => setGroup(v as Group) }}
        sort={{ value: sort, options: SORTS, onChange: (v) => v && setSort(v), textKeys: ["text"] }}
      />
      {data && <div className="pb-3"><AccountChips accounts={data.accounts.filter((a) => a.included)} view={data.view} /></div>}

      {data && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pb-3 text-sm text-slate-600">
          <span>{rows.length === data.items.length ? `${rows.length} movimientos` : `${rows.length} de ${data.items.length} movimientos`}</span>
          <span>Ingresos <b className="tabular-nums text-emerald-700">{eur(total.income, 2)}</b></span>
          <span>Gastos <b className="tabular-nums text-slate-900">{eur(total.expenses, 2)}</b></span>
          <span>Neto <b className={`tabular-nums ${total.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{eur(total.net, 2)}</b></span>
          {total.saved ? <span>A ahorro <b className="tabular-nums text-slate-900">{eur(total.saved, 2)}</b></span> : null}
          {filters > 0 && <button type="button" onClick={() => { setStatus("all"); setKind("all"); setCategory("all"); }} className="text-xs font-medium text-blue-700 hover:underline">Quitar filtros</button>}
          {status === "revisar" && rows.length > 0 && (
            <button type="button" onClick={() => void reclassify()} disabled={reclassifying} className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline disabled:opacity-50">
              {reclassifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Volver a intentarlo con la IA
            </button>
          )}
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className={`${panel} flex min-h-0 flex-1 flex-col max-md:-mx-3 max-md:rounded-none max-md:border-x-0 max-md:shadow-none`}>
        {!data ? <SkeletonList rows={10} /> : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">{q ? "Nada coincide con la búsqueda." : status === "revisar" ? "No hay nada por revisar. 👌" : filters ? "Ningún movimiento cumple los filtros." : "No hay movimientos en este periodo."}</p>
        ) : (
          <div className={`min-h-0 flex-1 overflow-auto ${loading ? "opacity-70" : ""}`}>
            {/* Ordenador: tabla */}
            <table className="hidden w-full text-sm md:table">
              <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#f1f5f9]">
                <tr>
                  <th className={`${th} w-10`}><Check checked={allSelected} partial={selected.size > 0} onChange={() => (allSelected ? setSelected(new Set()) : toggle(allIds, true))} label="Seleccionar todo" /></th>
                  <th className={th}>Fecha</th>
                  <th className={th}>Concepto</th>
                  <th className={th}>Categoría</th>
                  <th className={th}>Cuenta</th>
                  <th className={`${th} text-right`}>Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {painted.map((g) => (
                  <Fragment key={g.key}>
                    {group !== "none" && groupHeader(g, false)}
                    {g.visible.map((t) => (
                      <tr key={t.id} onClick={() => setEditing(t)} className={`cursor-pointer hover:bg-slate-50 ${selected.has(t.id) ? "bg-blue-50/60" : ""} ${t.excluded ? "opacity-50" : ""}`}>
                        {rowCells(t)}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {/* Móvil: filas */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {painted.map((g) => (
                <Fragment key={g.key}>
                  {group !== "none" && groupHeader(g, true)}
                  {g.visible.map((t) => (
                    <li key={t.id} className={`flex items-center gap-3 px-4 py-3 ${selected.has(t.id) ? "bg-blue-50/60" : ""}`}>
                      <Check checked={selected.has(t.id)} onChange={() => toggle([t.id], !selected.has(t.id))} label="Seleccionar" />
                      <button type="button" onClick={() => setEditing(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            {t.kind === "interna" && <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                            {t.extraordinary && <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                            <span className="truncate text-[15px] font-medium text-slate-900">{label(t)}</span>
                          </span>
                          <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            <span>{shortDay(t.date)}</span>
                            <CategoryPill t={t} />
                            {isReview(t) && <span className="text-amber-700">revisar</span>}
                          </span>
                        </span>
                        <Amount t={t} />
                      </button>
                    </li>
                  ))}
                </Fragment>
              ))}
            </ul>
            {hiddenCount > 0 && (
              <button type="button" onClick={() => setShown((n) => n + PAGE * 2)} className="m-3 flex h-10 w-[calc(100%-1.5rem)] items-center justify-center rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Ver más ({hiddenCount})
              </button>
            )}
          </div>
        )}
        {selected.size > 0 && <BulkBar ids={[...selected]} onClear={() => setSelected(new Set())} onDone={setToast} />}
      </div>
      {toast && (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg md:bottom-8">{toast}</div>
      )}
      <EditModal item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
