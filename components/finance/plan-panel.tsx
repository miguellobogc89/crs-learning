"use client";
// Plan: grupos de gasto del usuario (Gastos fijos, Ocio, Moda…). Cada grupo es un conjunto de categorías (cada
// categoría en un solo grupo) con un objetivo opcional por ciclo. Lista con líneas finas; al pulsar un grupo se
// despliegan sus categorías con su gasto del ciclo y la diferencia con el anterior a la misma altura; se añaden
// desde una lista que sube desde abajo y se quitan con la ×. Al tocar una categoría, su detalle entra desde la
// derecha (/finanzas/plan/categoria/<clave>). Al volver, la pantalla queda como se dejó (desplegado y scroll).
// Los grupos se guardan en finance_plan_groups (planView y acciones plan/group* de la API).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, FolderPlus, Landmark, Plus, Search, Target, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { planView } from "@/lib/finance/service";
import { EXPENSE_CATEGORIES, categoryLabel } from "@/lib/finance/categories";
import { eur, primary } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { errorText, fapi, refreshFinance, useFinance } from "./api";
import { aboveKeyboard, useKeyboardInset } from "./use-keyboard-inset";

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

function Diff({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return <span className="block text-xs text-slate-400">sin ciclo anterior</span>;
  const d = round2(current - previous);
  if (Math.abs(d) < 0.01) return <span className="block text-xs text-slate-400">igual que el anterior</span>;
  return <span className={`block text-xs font-medium tabular-nums ${d > 0 ? "text-red-600" : "text-emerald-600"}`}>{d > 0 ? "+" : "−"}{eur(Math.abs(d), 2)} vs anterior</span>;
}

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

export function PlanPanel() {
  const { data, error } = useFinance<View>("plan");
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
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
  const prv = (k: string) => (data.previous ? data.totals.before[k] ?? 0 : null);
  const sum = (keys: string[], f: (k: string) => number | null) => {
    const vals = keys.map(f);
    return vals.some((v) => v === null) ? null : round2(vals.reduce((s: number, v) => s + (v ?? 0), 0));
  };
  const used = new Set(groups.flatMap((g) => g.categories));
  const free = ALL_KEYS.filter((k) => !used.has(k));
  // «Sin grupo»: categorías con gasto que no están en ningún grupo (para que nada se escape).
  const rows = [
    ...groups.map((g) => ({ ...g, editable: true })),
    { id: "sin", name: "Sin grupo", categories: free.filter((k) => cur(k) > 0 || (prv(k) ?? 0) > 0), goal: null, editable: false },
  ];

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
  const rememberScroll = () => {
    try { window.sessionStorage.setItem(PLAN_SCROLL, String(scroller()?.scrollTop ?? 0)); } catch { /* ignorar */ }
  };

  return (
    <div className="mx-auto max-w-xl pb-6">
      {err && <div className="mb-3"><ErrorNote>{err}</ErrorNote></div>}
      <ul className="divide-y divide-slate-100 border-y border-slate-100">
        {rows.map((g) => {
          const isOpen = open === g.id;
          const now = sum(g.categories, cur) ?? 0;
          const before = sum(g.categories, prv);
          const sorted = [...g.categories].sort((a, b) => cur(b) - cur(a));
          const subtitle = sorted.slice(0, 3).map(labelOf).join(", ") + (sorted.length > 3 ? "…" : "");
          const muted = !g.editable;
          const addButton = !g.editable && (
            <li key="add-group">
              <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-2 px-1 py-4 text-left text-base font-medium text-blue-600 active:bg-slate-50">
                <FolderPlus className="h-5 w-5" /> Añadir grupo
              </button>
            </li>
          );
          return [addButton,
            <li key={g.id}>
              <button type="button" onClick={() => setOpen(isOpen ? null : g.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-1 py-4 text-left active:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className={`block text-base font-semibold ${muted ? "text-slate-500" : "text-slate-900"}`}>{g.name}</span>
                  <span className="mt-0.5 block truncate text-sm text-slate-400">{subtitle || "Sin categorías"}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-lg font-semibold tabular-nums ${muted ? "text-slate-500" : g.goal && now > g.goal ? "text-red-600" : "text-slate-900"}`}>
                    {eur(now, 2)}{g.goal ? <span className="text-sm font-normal text-slate-400"> / {eur(g.goal, 2)}</span> : null}
                  </span>
                  <Diff current={now} previous={before} />
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="pb-3 pl-3">
                  <ul className="divide-y divide-slate-50">
                    {sorted.map((k) => (
                      <li key={k} className="flex items-center gap-1">
                        <Link href={`/finanzas/plan/categoria/${encodeURIComponent(k)}`} onClick={rememberScroll} scroll={false} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 active:bg-slate-50">
                          <span className="min-w-0 flex-1 text-sm text-slate-700">{labelOf(k)}</span>
                          <span className="shrink-0 text-right">
                            <span className="block text-sm tabular-nums text-slate-900">{eur(cur(k), 2)}</span>
                            <Diff current={cur(k)} previous={prv(k)} />
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                        </Link>
                        {g.editable && (
                          <button type="button" onClick={() => removeCat(g.id, k)} aria-label={`Quitar ${labelOf(k)}`} className="shrink-0 rounded-lg p-1.5 text-slate-300 active:bg-slate-100 active:text-red-600">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    ))}
                    {sorted.length === 0 && <li className="py-2.5 text-sm text-slate-400">{g.editable ? "Sin categorías." : "Todo tu gasto está en algún grupo."}</li>}
                  </ul>
                  {g.editable && (
                    <div className="mt-2 flex flex-wrap gap-x-5">
                      <button type="button" onClick={() => setAdding(groups.find((x) => x.id === g.id) ?? null)} className="inline-flex items-center gap-1.5 py-1.5 text-sm font-medium text-blue-600">
                        <Plus className="h-4 w-4" /> Añadir categoría
                      </button>
                      <button type="button" onClick={() => setEditing(groups.find((x) => x.id === g.id) ?? null)} className="inline-flex items-center gap-1.5 py-1.5 text-sm font-medium text-blue-600">
                        <Target className="h-4 w-4" /> {g.goal ? "Cambiar objetivo o nombre" : "Poner objetivo"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>,
          ];
        })}
      </ul>
      <NewGroupSheet open={creating} onClose={() => setCreating(false)} onCreate={(name, goal) => void createGroup(name, goal)} />
      <NewGroupSheet open={!!editing} editing={editing} onClose={() => setEditing(null)}
        onCreate={(name, goal) => editing && updateGroup(editing, name, goal)} onDelete={() => editing && deleteGroup(editing)} />
      <AddCategoriesSheet target={adding} groups={groups} allKeys={ALL_KEYS} cur={cur} onClose={() => setAdding(null)} onConfirm={(keys) => adding && addCats(adding.id, keys)} />
    </div>
  );
}
