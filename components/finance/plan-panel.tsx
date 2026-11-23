"use client";
// Mi plan («Tu mes», 23/11/2026): arriba lo que cobras (tus últimas nóminas) repartido en una barra — cada grupo
// con su objetivo (o su media, en tono suave), lo que no está en ningún grupo, tu ahorro — y si cuadra. Debajo,
// el ahorro con el margen que queda (positivo o negativo) y cada grupo con lo que te queda este mes (objetivo o
// media − lo que llevas). Al tocar una fila se despliega: sus categorías (cada una a su detalle), el objetivo
// editable y añadir categorías / renombrar o borrar. «Sin grupo», abajo del todo. Al volver de un detalle, la
// pantalla queda como se dejó. Los grupos se guardan en finance_plan_groups (acciones plan/group* de la API).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, FolderPlus, Landmark, Pencil, PiggyBank, Plus, Search, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { planView } from "@/lib/finance/service";
import { EXPENSE_CATEGORIES, categoryHex, categoryLabel } from "@/lib/finance/categories";
import { eur, primary } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { errorText, fapi, refreshFinance, useFinance } from "./api";
import { aboveKeyboard, useKeyboardInset } from "./use-keyboard-inset";
import { CategoryIcon } from "./category-icon";

type View = Awaited<ReturnType<typeof planView>>;
type Group = View["groups"][number];

const labelOf = categoryLabel;
const fold = (s: string) => ` ${s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
const round2 = (v: number) => Math.round(v * 100) / 100;
const PLAN_OPEN = "crs-finance:plan-open";
const PLAN_SCROLL = "crs-finance:plan-scroll";
/** El contenedor que hace scroll en Finanzas (el <main> de la estructura). */
const scroller = () => document.querySelector<HTMLElement>("main");
/** Todas las categorías de gasto que se pueden repartir en grupos. */
const ALL_KEYS = [...EXPENSE_CATEGORIES.map((c) => c.key), "sin_clasificar"];

/**
 * «Añadir a <grupo>»: lista que sube desde abajo (como el historial de categoría de Inicio). Arriba las categorías
 * libres, por gasto del ciclo; debajo, en gris, las que están en otro grupo, que se pueden traer (se mueven).
 */
function AddCategoriesSheet({ target, groups, allKeys, cur, onClose, onConfirm }: {
  target: Group | null;
  groups: Group[];
  allKeys: string[];
  cur: (k: string) => number;
  onClose: () => void;
  onConfirm: (keys: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const startY = useRef<number | null>(null);
  useEffect(() => { if (target) { setQ(""); setPicked(new Set()); } }, [target]);
  const inset = useKeyboardInset(target !== null);
  const needle = fold(q.trim()).trim();
  const ownerOf = new Map(groups.flatMap((g) => g.categories.map((k) => [k, g] as const)));
  const candidates = allKeys
    .filter((k) => ownerOf.get(k)?.id !== target?.id)
    .filter((k) => !needle || fold(labelOf(k)).includes(needle))
    .sort((a, b) => cur(b) - cur(a) || labelOf(a).localeCompare(labelOf(b), "es"));
  const free = candidates.filter((k) => !ownerOf.has(k));
  const elsewhere = candidates.filter((k) => ownerOf.has(k));
  const toggle = (k: string) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const moving = [...picked].filter((k) => ownerOf.has(k)).length;

  const row = (k: string) => {
    const on = picked.has(k);
    const owner = ownerOf.get(k);
    return (
      <li key={k}>
        <button type="button" onClick={() => toggle(k)} aria-pressed={on} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-slate-50">
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>{on && <Check className="h-3.5 w-3.5" />}</span>
          <span className="min-w-0 flex-1">
            <span className={`block text-sm font-medium ${owner && !on ? "text-slate-500" : "text-slate-900"}`}>{labelOf(k)}</span>
            {owner && <span className="block text-xs text-slate-400">{on ? `Se moverá desde ${owner.name}` : `En ${owner.name}`}</span>}
          </span>
          <span className={`shrink-0 text-sm tabular-nums ${cur(k) > 0 ? "text-slate-900" : "text-slate-400"}`}>{eur(cur(k), 2)}</span>
        </button>
      </li>
    );
  };

  return (
    <Sheet open={target !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" showCloseButton={false} onOpenAutoFocus={(e) => e.preventDefault()} style={aboveKeyboard(inset, true)} className="data-[side=bottom]:h-[80dvh] max-h-[80dvh] gap-0 overflow-hidden rounded-t-3xl border-slate-200 bg-white p-0 sm:mx-auto sm:max-w-lg">
        <div
          className="shrink-0 touch-none px-5 pb-3 pt-3"
          onTouchStart={(e) => { startY.current = e.touches[0]?.clientY ?? null; }}
          onTouchEnd={(e) => { if (startY.current !== null && (e.changedTouches[0]?.clientY ?? 0) - startY.current > 70) onClose(); startY.current = null; }}
          onTouchCancel={() => { startY.current = null; }}
        >
          <div aria-hidden="true" className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-slate-300" />
          <SheetTitle className="text-lg font-semibold text-slate-900">Añadir a {target?.name}</SheetTitle>
          <SheetDescription className="mt-0.5 text-xs text-slate-500">Gasto de este ciclo en cada categoría. Desliza hacia abajo para cerrar.</SheetDescription>
          <label className="mt-3 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar categoría" className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
          {free.length > 0 && (
            <section>
              <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sin grupo</p>
              <ul className="divide-y divide-slate-100">{free.map(row)}</ul>
            </section>
          )}
          {elsewhere.length > 0 && (
            <section className="pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">En otros grupos</p>
              <ul className="divide-y divide-slate-100">{elsewhere.map(row)}</ul>
            </section>
          )}
          {candidates.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No hay categorías con ese nombre.</p>}
        </div>
        <div className="shrink-0 border-t border-slate-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={() => { if (picked.size) onConfirm([...picked]); else onClose(); }} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700">
            {picked.size ? `Añadir (${picked.size})${moving ? ` · ${moving} se mueven` : ""}` : "Cerrar"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** «Nuevo grupo»: nombre y, si se quiere, un objetivo en euros por ciclo. */
/** Crear un grupo o, si se pasa `editing`, cambiar su nombre y su objetivo (y borrarlo). */
function NewGroupSheet({ open, onClose, onCreate, editing = null, onDelete }: {
  open: boolean; onClose: () => void; onCreate: (name: string, goal: number | null) => void;
  editing?: { name: string; goal: number | null } | null; onDelete?: () => void;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const startY = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setGoal(editing?.goal ? String(editing.goal).replace(".", ",") : "");
    setErr(null); setConfirmDelete(false);
  }, [open, editing]);
  const inset = useKeyboardInset(open);
  const submit = () => {
    if (!name.trim()) { setErr("Ponle un nombre al grupo"); return; }
    const t = goal.trim().replace(/\s|€/g, "");
    const value = t ? Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) : null;
    if (value !== null && !(value > 0)) { setErr("El objetivo debe ser un importe mayor que cero"); return; }
    onCreate(name.trim().slice(0, 40), value === null ? null : Math.round(value * 100) / 100);
  };
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" showCloseButton={false} style={aboveKeyboard(inset, false)} className="gap-0 rounded-t-3xl border-slate-200 bg-white p-0 sm:mx-auto sm:max-w-lg">
        <div
          className="touch-none px-5 pt-3"
          onTouchStart={(e) => { startY.current = e.touches[0]?.clientY ?? null; }}
          onTouchEnd={(e) => { if (startY.current !== null && (e.changedTouches[0]?.clientY ?? 0) - startY.current > 70) onClose(); startY.current = null; }}
          onTouchCancel={() => { startY.current = null; }}
        >
          <div aria-hidden="true" className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-slate-300" />
          <SheetTitle className="text-lg font-semibold text-slate-900">{editing ? "Editar grupo" : "Nuevo grupo"}</SheetTitle>
          <SheetDescription className="mt-0.5 text-xs text-slate-500">{editing ? "El objetivo es lo máximo que quieres gastar en el grupo cada mes." : "Después eliges qué categorías entran en él."}</SheetDescription>
        </div>
        <form className="space-y-4 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-800">Nombre</span>
            <input value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} placeholder="Tabaco, Gasolina, Gimnasio…" maxLength={40} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-800">Objetivo al mes <span className="font-normal text-slate-400">(opcional)</span></span>
            <span className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
              <input inputMode="decimal" value={goal} onChange={(e) => { setGoal(e.target.value); setErr(null); }} placeholder="0,00" className="min-w-0 flex-1 bg-transparent py-3 text-base tabular-nums text-slate-900 outline-none" />
              <span className="text-base text-slate-400">€</span>
            </span>
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button type="submit" className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700">{editing ? "Guardar" : "Crear y elegir categorías"}</button>
          {editing && onDelete && (
            <button type="button" onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              className={`w-full rounded-xl py-3 text-sm font-semibold ${confirmDelete ? "bg-red-600 text-white" : "text-red-600 active:bg-red-50"}`}>
              {confirmDelete ? "Sí, borrar el grupo (sus categorías quedan sin grupo)" : "Borrar grupo"}
            </button>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Casilla de importe que guarda al salir de ella (o con Intro). Vacía = sin importe. */
function AmountInput({ value, onCommit, placeholder, label }: { value: number | null; onCommit: (v: number | null) => void; placeholder: string; label: string }) {
  const show = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  const commit = () => {
    const t = text.trim().replace(/\s|€/g, "");
    const v = t ? Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) : null;
    if (v !== null && (!Number.isFinite(v) || v < 0)) { setText(show(value)); return; }
    const next = v === null || v === 0 ? null : round2(v);
    if (next !== value) onCommit(next);
  };
  return (
    <span className="flex w-28 shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
      <input aria-label={label} inputMode="decimal" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="min-w-0 flex-1 bg-transparent py-2 text-right text-[16px] tabular-nums text-slate-900 outline-none placeholder:text-slate-300" />
      <span className="text-sm text-slate-400">€</span>
    </span>
  );
}

export function PlanPanel() {
  const { data, error } = useFinance<View>("plan");
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [savingOverride, setSavingOverride] = useState<number | null | undefined>(undefined);
  const [incomeOverride, setIncomeOverride] = useState<number | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(t); }, []);
  const [adding, setAdding] = useState<Group | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Lo guardado manda; los cambios se pintan al momento y se confirman con el servidor.
  useEffect(() => { if (data) setGroups(data.groups); }, [data]);
  // Al volver del detalle, la pantalla queda como se dejó: grupo desplegado y scroll (en esta sesión).
  useEffect(() => {
    try { setOpen(window.sessionStorage.getItem(PLAN_OPEN) || null); } catch { /* sin almacenamiento */ }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try { if (open) window.sessionStorage.setItem(PLAN_OPEN, open); else window.sessionStorage.removeItem(PLAN_OPEN); } catch { /* ignorar */ }
  }, [open, restored]);
  useEffect(() => {
    if (!restored || !data) return;
    try {
      const y = Number(window.sessionStorage.getItem(PLAN_SCROLL));
      if (y > 0) requestAnimationFrame(() => { const el = scroller(); if (el) el.scrollTop = y; });
      window.sessionStorage.removeItem(PLAN_SCROLL);
    } catch { /* ignorar */ }
  }, [restored, data]);

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data || !restored) return <SkeletonList rows={4} />;

  // Antes de nada, una cuenta conectada: sin movimientos no hay nada que repartir ni que proponer.
  if (!data.hasAccounts || !data.hasData) {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Landmark className="h-6 w-6" /></span>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">{data.hasAccounts ? "Aún no hay movimientos" : "Conecta tu banco para empezar"}</h2>
        <p className="mt-2 text-sm text-slate-500">
          {data.hasAccounts
            ? "En cuanto entren tus movimientos, te propondremos tus primeros grupos de gasto."
            : "Con tus movimientos te propondremos tus grupos de gasto (fijos, ocio, moda…) y verás cada ciclo dónde se va tu dinero."}
        </p>
        <Link href="/finanzas/cuentas" className={`${primary} mt-6`}><Landmark className="h-4 w-4" /> {data.hasAccounts ? "Ver mis cuentas" : "Conectar mi banco"}</Link>
      </section>
    );
  }

  const cur = (k: string) => data.totals.now[k] ?? 0;
  const extra = (k: string) => data.totals.extrasNow?.[k] ?? 0;
  const sumOf = (keys: string[], f: (k: string) => number) => round2(keys.reduce((t, k) => t + f(k), 0));
  // Media por categoría de los 3 ciclos cerrados anteriores (sin extraordinarios), para los grupos sin objetivo.
  const closed = (data.history ?? []).slice(1, 4);
  const avgOf = (keys: string[]) => (closed.length ? Math.round(closed.reduce((t, c) => t + keys.reduce((u, k) => u + (c.full[k] ?? 0), 0), 0) / closed.length) : 0);
  const used = new Set(groups.flatMap((g) => g.categories));
  const free = ALL_KEYS.filter((k) => !used.has(k));
  const looseKeys = free.filter((k) => cur(k) > 0 || extra(k) > 0 || avgOf([k]) > 0);

  const income = incomeOverride === undefined ? data.budget.income : incomeOverride;
  const saving = savingOverride === undefined ? data.budget.savingsGoal : savingOverride;
  const rows = groups.map((g) => {
    const avg = avgOf(g.categories);
    const base = g.goal ?? avg;
    const spent = sumOf(g.categories, cur);
    return { g, avg, base, spent, left: round2(base - spent), estimate: g.goal === null, color: categoryHex(g.categories[0] ?? "otros_gastos") };
  });
  const looseAvg = avgOf(looseKeys);
  const planned = rows.reduce((t, r) => t + r.base, 0) + looseAvg + (saving ?? 0);
  const margin = income === null ? null : round2(income - planned);
  const total = Math.max(income ?? 0, planned, 1);
  const pct = (v: number) => `${(Math.max(0, v) / total) * 100}%`;
  const segs = [
    ...rows.filter((r) => r.base > 0).map((r) => ({ key: r.g.id, label: r.g.name, amount: r.base, color: r.color, estimate: r.estimate })),
    ...(looseAvg > 0 ? [{ key: "sin", label: "Sin grupo", amount: looseAvg, color: "#94a3b8", estimate: true }] : []),
    ...(saving ? [{ key: "ahorro", label: "Ahorro", amount: saving, color: "#10b981", estimate: false }] : []),
  ];
  const verdict = income === null ? { text: "No encontramos tu nómina: dinos cuánto cobras al mes para ver si tu plan cuadra.", tone: "text-slate-500" }
    : margin !== null && margin >= 0 ? { text: `Tu plan cuadra: te quedan ${eur(margin, 0)} de margen al mes.`, tone: "text-emerald-700" }
    : { text: `Tu plan se pasa ${eur(-(margin ?? 0), 0)} de lo que cobras: baja algún objetivo o ahorra menos.`, tone: "text-rose-700" };

  const save = async (path: string, payload: unknown) => {
    setErr(null);
    try {
      return await fapi<{ id?: string }>(path, payload);
    } catch (e) {
      setErr(errorText(e));
      return null;
    } finally {
      refreshFinance();
    }
  };
  const createGroup = async (name: string, goal: number | null) => {
    setCreating(false);
    const r = await save("plan/group", { name, goal });
    if (!r?.id) return;
    const g: Group = { id: r.id, name, categories: [], goal };
    setGroups((gs) => [...gs, g]);
    setOpen(g.id);
    setAdding(g);
  };
  const setGoal = (g: Group, goal: number | null) => {
    setGroups((gs) => gs.map((x) => (x.id === g.id ? { ...x, goal } : x)));
    void save("plan/group", { id: g.id, name: g.name, goal });
  };
  const updateGroup = (g: Group, name: string, goal: number | null) => {
    setEditing(null);
    setGroups((gs) => gs.map((x) => (x.id === g.id ? { ...x, name, goal } : x)));
    void save("plan/group", { id: g.id, name, goal });
  };
  const deleteGroup = (g: Group) => {
    setEditing(null);
    setOpen(null);
    setGroups((gs) => gs.filter((x) => x.id !== g.id));
    void save("plan/group/delete", { id: g.id });
  };
  const removeCat = (id: string, k: string) => {
    setGroups((gs) => gs.map((x) => (x.id === id ? { ...x, categories: x.categories.filter((c) => c !== k) } : x)));
    void save("plan/group/categories", { id, remove: [k] });
  };
  // Añade al grupo; si alguna estaba en otro grupo, se mueve (cada categoría en un solo grupo).
  const addCats = (id: string, keys: string[]) => {
    setGroups((gs) => gs.map((x) => (x.id === id
      ? { ...x, categories: [...x.categories, ...keys.filter((k) => !x.categories.includes(k))] }
      : { ...x, categories: x.categories.filter((c) => !keys.includes(c)) })));
    setAdding(null);
    void save("plan/group/categories", { id, add: keys });
  };
  const saveSettings = (patch: { savingsGoal?: number | null; expectedIncome?: number | null }) => {
    if ("savingsGoal" in patch) setSavingOverride(patch.savingsGoal ?? null);
    if ("expectedIncome" in patch) setIncomeOverride(patch.expectedIncome ?? undefined);
    void save("settings", patch);
  };
  const rememberScroll = () => {
    try { window.sessionStorage.setItem(PLAN_SCROLL, String(scroller()?.scrollTop ?? 0)); } catch { /* ignorar */ }
  };
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));

  /** Categorías de un grupo con su gasto del mes; cada una abre su detalle. */
  const CategoryList = ({ keys, groupId }: { keys: string[]; groupId: string | null }) => (
    <ul className="divide-y divide-slate-100">
      {[...keys].sort((a, b) => cur(b) - cur(a)).map((k) => (
        <li key={k} className="flex items-center gap-1">
          <Link href={`/finanzas/plan/categoria/${encodeURIComponent(k)}`} onClick={rememberScroll} scroll={false} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 active:bg-slate-50">
            <CategoryIcon category={k} />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{labelOf(k)}</span>
            <span className="shrink-0 text-right">
              <span className="amount block text-sm tabular-nums text-slate-900">{eur(cur(k), 2)}</span>
              {extra(k) > 0 && <span className="amount block text-[11px] text-slate-500">+{eur(extra(k), 2)} extraordinarios</span>}
            </span>
          </Link>
          {groupId && (
            <button type="button" onClick={() => removeCat(groupId, k)} aria-label={`Quitar ${labelOf(k)} del grupo`} className="shrink-0 rounded-lg p-1.5 text-slate-300 active:bg-slate-100 active:text-red-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </li>
      ))}
      {keys.length === 0 && <li className="py-2.5 text-sm text-slate-400">Sin categorías todavía.</li>}
    </ul>
  );

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-6">
      {err && <ErrorNote>{err}</ErrorNote>}

      {/* Tu mes: lo que cobras, repartido */}
      <section>
        <p className="text-sm text-slate-500">Tu mes</p>
        <div className="mt-0.5 flex items-end justify-between gap-3">
          <p className="amount text-[30px] font-semibold leading-none tracking-tight text-slate-900">{income === null ? "—" : eur(income, 0)}</p>
          <span className="text-right text-xs text-slate-500">{data.budget.fromSettings ? "lo que cobras al mes" : "según tus últimas nóminas"}</span>
        </div>
        {income === null && (
          <div className="mt-3 flex items-center gap-3">
            <span className="flex-1 text-sm text-slate-600">¿Cuánto cobras al mes?</span>
            <AmountInput label="Lo que cobras al mes" value={null} placeholder="0" onCommit={(v) => saveSettings({ expectedIncome: v })} />
          </div>
        )}
        <div className="mt-4 flex h-11 w-full overflow-hidden rounded-xl bg-slate-100" role="img"
          aria-label={`Reparto: ${segs.map((x) => `${x.label} ${eur(x.amount, 0)}`).join(", ")}. ${verdict.text}`}>
          {segs.map((x) => (
            <span key={x.key} className="h-full border-r-2 border-white transition-[width] duration-700 ease-out last:border-r-0 motion-reduce:transition-none"
              style={{ width: ready ? pct(x.amount) : "0%", backgroundColor: x.color, opacity: x.estimate ? 0.45 : 1 }} />
          ))}
        </div>
        {margin !== null && margin < 0 && (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <span className="ml-auto block h-full rounded-full bg-rose-500" style={{ width: pct(-margin) }} />
          </div>
        )}
        <p className={`mt-3 text-[15px] font-medium ${verdict.tone}`}>{verdict.text}</p>
        <p className="mt-1 text-[11px] text-slate-400">En tono suave, los grupos sin objetivo: cuentan con lo que sueles gastar.</p>
      </section>

      <ul className="divide-y divide-slate-100 border-y border-slate-100">
        {/* Ahorro: tu objetivo y el margen que te queda (positivo o negativo) */}
        <li>
          <button type="button" onClick={() => toggle("ahorro")} aria-expanded={open === "ahorro"} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-slate-50">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-b from-emerald-400 to-emerald-500" aria-hidden="true"><PiggyBank className="h-5 w-5 text-white" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-slate-900">Ahorro</span>
              <span className="amount block text-xs text-slate-500">{saving ? `Quieres apartar ${eur(saving, 0)} al mes` : "Aún no has dicho cuánto quieres ahorrar"}</span>
            </span>
            {margin !== null && (
              <span className={`amount shrink-0 text-right text-[15px] font-semibold tabular-nums ${margin >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {margin >= 0 ? "+" : "−"}{eur(Math.abs(margin), 0)}
                <span className="block text-[11px] font-normal text-slate-500">de margen</span>
              </span>
            )}
          </button>
          {open === "ahorro" && (
            <div className="flex items-center gap-3 pb-4 pl-12">
              <span className="flex-1 text-sm text-slate-600">Ahorro al mes</span>
              <AmountInput label="Ahorro al mes" value={saving} placeholder="0" onCommit={(v) => saveSettings({ savingsGoal: v })} />
            </div>
          )}
        </li>

        {/* Grupos: lo que te queda (objetivo o media − lo que llevas este mes) */}
        {rows.map(({ g, avg, base, spent, left, estimate }) => {
          const isOpen = open === g.id;
          const x = sumOf(g.categories, extra);
          return (
            <li key={g.id}>
              <button type="button" onClick={() => toggle(g.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-slate-50">
                <CategoryIcon category={g.categories[0] ?? "otros_gastos"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-slate-900">{g.name}</span>
                  <span className="amount block truncate text-xs text-slate-500">
                    Llevas {eur(spent, 0)} de {estimate ? `~${eur(base, 0)} (tu media)` : eur(base, 0)}
                  </span>
                </span>
                <span className={`amount shrink-0 text-right text-[15px] font-semibold tabular-nums ${left >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {left >= 0 ? eur(left, 0) : `−${eur(-left, 0)}`}
                  <span className="block text-[11px] font-normal text-slate-500">{left >= 0 ? "te quedan" : "te has pasado"}</span>
                </span>
              </button>
              {isOpen && (
                <div className="pb-4 pl-3">
                  {!estimate && avg > 0 && <p className="amount mb-1 text-xs text-slate-500">Sueles gastar ~{eur(avg, 0)} al mes.</p>}
                  {x > 0 && <p className="amount mb-1 text-xs text-slate-500">Además, {eur(x, 2)} en extraordinarios, aparte.</p>}
                  <CategoryList keys={g.categories} groupId={g.id} />
                  <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800">Objetivo al mes</span>
                      <span className="amount block text-xs text-slate-500">{g.goal === null ? (avg > 0 ? `Vacío: cuenta con tu media (~${eur(avg, 0)})` : "Vacío: sin objetivo") : "Lo máximo que quieres gastar"}</span>
                    </span>
                    <AmountInput label={`Objetivo de ${g.name}`} value={g.goal} placeholder={avg > 0 ? String(avg) : "0"} onCommit={(v) => setGoal(g, v)} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5">
                    <button type="button" onClick={() => setAdding(g)} className="inline-flex items-center gap-1.5 py-1.5 text-sm font-medium text-blue-600">
                      <Plus className="h-4 w-4" /> Añadir categorías
                    </button>
                    <button type="button" onClick={() => setEditing(g)} className="inline-flex items-center gap-1.5 py-1.5 text-sm font-medium text-slate-500">
                      <Pencil className="h-4 w-4" /> Renombrar o borrar
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}

        <li>
          <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-2 py-4 text-left text-[15px] font-medium text-blue-600 active:bg-slate-50">
            <FolderPlus className="h-5 w-5" /> Añadir grupo
          </button>
        </li>

        {/* Lo que no está en ningún grupo, abajo del todo */}
        {looseKeys.length > 0 && (
          <li>
            <button type="button" onClick={() => toggle("sin")} aria-expanded={open === "sin"} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-slate-50">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-slate-500">Sin grupo</span>
                <span className="amount block truncate text-xs text-slate-400">Llevas {eur(sumOf(looseKeys, cur), 0)}; sueles gastar ~{eur(looseAvg, 0)}</span>
              </span>
            </button>
            {open === "sin" && (
              <div className="pb-4 pl-3">
                <CategoryList keys={looseKeys} groupId={null} />
                <p className="mt-2 text-xs text-slate-400">Para meter una en un grupo, ábrelo y pulsa «Añadir categorías».</p>
              </div>
            )}
          </li>
        )}
      </ul>

      <NewGroupSheet open={creating} onClose={() => setCreating(false)} onCreate={(name, goal) => void createGroup(name, goal)} />
      <NewGroupSheet open={!!editing} editing={editing} onClose={() => setEditing(null)}
        onCreate={(name, goal) => editing && updateGroup(editing, name, goal)} onDelete={() => editing && deleteGroup(editing)} />
      <AddCategoriesSheet target={adding} groups={groups} allKeys={ALL_KEYS} cur={cur} onClose={() => setAdding(null)} onConfirm={(keys) => adding && addCats(adding.id, keys)} />
    </div>
  );
}
