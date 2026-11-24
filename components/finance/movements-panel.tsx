"use client";
// Movimientos: los del periodo elegido (el mismo de Inicio), con su significado (gasto, interna, ahorro…) y su
// categoría. Se buscan, filtran, agrupan y ordenan con la cabecera común; se cambian de uno en uno o varios a la
// vez, y al corregir se puede aplicar a los parecidos: la app crea una regla y aprende.
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ArrowLeftRight, CheckSquare2, ChevronDown, Filter, ListFilter, Loader2, RefreshCw, Search, X } from "lucide-react";
import type { listTransactions } from "@/lib/finance/service";
import { SELECTABLE_CATEGORIES, KINDS, KIND_LABEL, categoryOf, type Kind } from "@/lib/finance/categories";
import { eur, panel, th } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { MovementDetailSheet } from "./movement-detail";
import { PlannedList } from "./planned";
import { Amount, CategoryPill, MovementRowButton, categoriesFor, isReview, label, type Item, type List } from "./movement-edit";
import { SkeletonList } from "@/components/trading/skeletons";
import { errorText, fapi, refreshFinance, shortDay, useFinance } from "./api";
import { requestClassify } from "./shell";
import { AccountChips, AccountDropdown, PeriodPicker } from "./period";
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
        <DropdownMenuItem onSelect={onMore}><ListFilter className="mr-2 h-4 w-4" />Más opciones y aplicar a parecidos…</DropdownMenuItem>
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
        <DropdownMenuTrigger asChild><button type="button" disabled={busy} className={btn}>Extraordinario <ChevronDown className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
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
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [category, setCategory] = useState(params.get("categoria") ?? "all");
  const [status, setStatus] = useState<Status>(params.get("revisar") === "1" ? "revisar" : "all");
  // «Por revisar» mira todo el historial (no solo el periodo elegido): es lo que cuenta el aviso de Inicio.
  const { data, error, loading } = useFinance<List>(status === "revisar" ? "transactions?all=1" : "transactions");
  const [group, setGroup] = useState<Group>("none");
  const [sort, setSort] = useState<Sort>(SORTS[0].value);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  // Detalle a pantalla completa (capa sobre la lista): por id, para mostrar siempre los datos al día.
  const [viewingId, setViewingId] = useState<string | null>(null);
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
      // Los traspasos entre tus cuentas no se ven (no aportan); solo si los filtras a propósito, para corregir uno.
      (kind === "all" ? t.kind !== "interna" : t.kind === kind) &&
      (category === "all" || t.category === category) &&
      (status === "all" || (status === "revisar" ? isReview(t) : status === "usuario" ? t.source === "usuario" : t.extraordinary)) &&
      (!needle || fold(`${t.description} ${t.counterparty ?? ""} ${t.alias ?? ""} ${t.subcategory ?? ""} ${t.note ?? ""} ${t.account} ${Math.abs(t.amount).toFixed(2).replace(".", ",")}`).includes(needle)));
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
          {t.extraordinary && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Extra</span>}
          <span className="truncate font-medium text-slate-900" title={t.description}>{label(t)}</span>
        </span>
        {t.note ? <span className="block truncate text-xs text-slate-500">{t.note}</span> : (t.alias || t.counterparty) ? <span className="block truncate text-xs text-slate-400">{t.description}</span> : null}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <QuickEdit t={t} onMore={() => setViewingId(t.id)} onDone={setToast} />
        {t.subcategory && <span className="ml-1 text-xs text-slate-500">· {t.subcategory}</span>}
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
        {(!mobile || selectionMode) && <Check checked={all} partial={some} onChange={() => toggle(ids, !all)} label={`Seleccionar ${g.title}`} />}
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
      <div className="mb-3 flex h-11 shrink-0 items-center gap-1.5 md:hidden" role="toolbar" aria-label="Buscar y filtrar movimientos">
        {mobileSearchOpen ? (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-50 px-3">
              <Search className="h-4 w-4 shrink-0 text-slate-500" />
              <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setMobileSearchOpen(false); }} placeholder="Buscar movimientos" aria-label="Buscar movimientos" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
            </div>
            <button type="button" onClick={() => setMobileSearchOpen(false)} aria-label="Cerrar búsqueda" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600"><X className="h-5 w-5" /></button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setMobileSearchOpen(true)} aria-label="Buscar movimientos" title="Buscar" className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
              <Search className="h-5 w-5" />
              {q && <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-blue-600" />}
            </button>
            {data && <AccountDropdown accounts={data.accounts.filter((a) => a.included)} view={data.view} />}
            {data && <PeriodPicker view={data.view} label={data.label} iconOnly className="h-10 px-2.5" />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Filtrar movimientos" title="Filtrar" className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
                  <Filter className="h-5 w-5" />
                  {filters > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] text-white">{filters}</span>}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <DropdownMenuLabel className="p-0">Filtros</DropdownMenuLabel>
                  {filters > 0 && <button type="button" onClick={(e) => { e.preventDefault(); setStatus("all"); setKind("all"); setCategory("all"); }} className="text-xs font-medium text-blue-700">Limpiar</button>}
                </div>
                {[
                  { title: "Estado", value: status, options: [{ value: "all", label: "Todos" }, { value: "revisar", label: "Por revisar" }, { value: "usuario", label: "Corregidos por mí" }, { value: "extra", label: "Extraordinarios" }], change: (v: string) => setStatus(v as Status) },
                  { title: "Tipo", value: kind, options: [{ value: "all", label: "Todos los tipos" }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))], change: setKind },
                  { title: "Categoría", value: category, options: [{ value: "all", label: "Todas las categorías" }, ...SELECTABLE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))], change: setCategory },
                ].map((f) => (
                  <div key={f.title}>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-slate-500">{f.title}</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={f.value} onValueChange={f.change}>
                      {f.options.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>)}
                    </DropdownMenuRadioGroup>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Ordenar y agrupar movimientos" title="Ordenar y agrupar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100"><ArrowDownUp className="h-5 w-5" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[70dvh] w-56 overflow-y-auto">
                <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={`${sort.key}:${sort.dir}`} onValueChange={(v) => { const option = SORTS.find((s) => `${s.value.key}:${s.value.dir}` === v); if (option) setSort(option.value); }}>
                  {SORTS.map((s) => <DropdownMenuRadioItem key={s.label} value={`${s.value.key}:${s.value.dir}`}>{s.label}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Agrupar por</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={group} onValueChange={(v) => setGroup(v as Group)}>
                  {GROUPS.map((option) => <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { setSelectionMode((v) => !v); setSelected(new Set()); }}>
                  <CheckSquare2 className="h-4 w-4" /> {selectionMode ? "Terminar selección" : "Seleccionar movimientos"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
      <div className="hidden md:block"><TableToolbar
        search={q}
        onSearchChange={setQ}
        searchPlaceholder="Buscar concepto, comercio, nota o importe..."
        extra={data ? <PeriodPicker view={data.view} label={data.label} /> : null}
        filters={{
          groups: [
            { key: "status", label: "Estado", value: status, allLabel: "Todos", options: [{ value: "revisar", label: "Por revisar" }, { value: "usuario", label: "Corregidos por mí" }, { value: "extra", label: "Extraordinarios" }] },
            { key: "kind", label: "Tipo", value: kind, allLabel: "Todos los tipos", allIcon: ListFilter, options: KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })) },
            { key: "category", label: "Categoría", value: category, allLabel: "Todas las categorías", allIcon: ListFilter, options: SELECTABLE_CATEGORIES.map((c) => ({ value: c.key, label: c.label })) },
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
      /></div>
      {data && <div className="hidden pb-3 md:block"><AccountChips accounts={data.accounts.filter((a) => a.included)} view={data.view} /></div>}

      {data && (
        <div className="amount-block hidden flex-wrap items-center gap-x-5 gap-y-1 pb-3 text-sm text-slate-600 md:flex">
          <span>{rows.length === data.items.length ? `${rows.length} movimientos` : `${rows.length} de ${data.items.length} movimientos`}</span>
          <span>Ingresos <b className="tabular-nums text-emerald-700">{eur(total.income, 2)}</b></span>
          <span>Gastos <b className="tabular-nums text-slate-900">{eur(total.expenses, 2)}</b></span>
          <span>Neto <b className={`tabular-nums ${total.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{eur(total.net, 2)}</b></span>
          {total.saved ? <span>A ahorro <b className="tabular-nums text-slate-900">{eur(total.saved, 2)}</b></span> : null}
          {filters > 0 && <button type="button" onClick={() => { setStatus("all"); setKind("all"); setCategory("all"); }} className="text-xs font-medium text-blue-700 hover:underline">Quitar filtros</button>}
          {status === "revisar" && rows.length > 0 && (
            <button type="button" onClick={() => void reclassify()} disabled={reclassifying} className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline disabled:opacity-50">
              {reclassifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Volver a intentarlo con la IA
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
            {/* Gastos previstos, en azul y arriba (los de la categoría filtrada, si hay filtro) */}
            {status === "all" && !q && (kind === "all" || kind === "gasto") && (
              <PlannedList className="px-3 pb-2 md:px-4" items={(data.planned ?? []).filter((x) => category === "all" || x.category === category)} />
            )}
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
                      <tr key={t.id} onClick={() => setViewingId(t.id)} className={`cursor-pointer hover:bg-slate-50 ${selected.has(t.id) ? "bg-blue-50/60" : ""} ${t.excluded ? "opacity-50" : ""}`}>
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
                      {selectionMode && <Check checked={selected.has(t.id)} onChange={() => toggle([t.id], !selected.has(t.id))} label="Seleccionar" />}
                      <MovementRowButton t={t} onClick={() => setViewingId(t.id)} />
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
        {selected.size > 0 && <BulkBar ids={[...selected]} onClear={() => { setSelected(new Set()); setSelectionMode(false); }} onDone={setToast} />}
      </div>
      {toast && (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg md:bottom-8">{toast}</div>
      )}
      <MovementDetailSheet item={data?.items.find((t) => t.id === viewingId) ?? null} items={data?.items} onClose={() => setViewingId(null)} />
    </div>
  );
}
