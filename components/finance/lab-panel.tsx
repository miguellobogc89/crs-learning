"use client";
// Laboratorio (/finanzas/laboratorio, fuera de los menús): pantalla para iterar el diseño de Plan con los datos
// reales del usuario. Solo lectura: usa los mismos endpoints que Plan y no guarda nada; lo que se prueba aquí no
// toca los paquetes reales. Lo que funcione se pasa después a Plan.
//
// Iteración 2: las partidas son solo grupos de categorías (cada categoría en una sola partida). Lista con líneas
// finas; al pulsar una partida se despliegan sus categorías con su gasto, y se pueden quitar o añadir (en memoria,
// sin guardar) desde una lista que sube desde abajo. «Moda», «Comida a domicilio» y «Mascotas» aún no existen como categorías: aquí se simulan por
// comercio, sacándolas de la categoría que tengan hoy (Compras, Restaurantes, Otros…).
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { packagesView } from "@/lib/finance/service";
import { EXPENSE_CATEGORIES, categoryLabel } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useFinance } from "./api";

type Packages = Awaited<ReturnType<typeof packagesView>>;
type Charge = Packages["charges"][number];

/** Categorías simuladas por comercio (palabra completa en el concepto). */
const VIRTUAL: { key: string; label: string; merchants: string[] }[] = [
  { key: "lab_domicilio", label: "Comida a domicilio", merchants: ["glovo", "uber eats", "ubereats", "just eat", "justeat", "deliveroo", "telepizza", "dominos", "domino s"] },
  { key: "lab_moda", label: "Moda", merchants: ["zara", "mango", "primark", "h m", "pull bear", "pull and bear", "bershka", "stradivarius", "massimo dutti", "shein", "zalando", "springfield", "lefties", "oysho", "uniqlo", "levis", "nike", "adidas", "adidases", "foot locker", "jd sports", "parfois", "pandora", "vinted"] },
  { key: "lab_mascotas", label: "Mascotas", merchants: ["veterinario", "veterinaria", "veterinarios", "kiwoko", "tiendanimal", "zooplus", "miscota", "mascotas", "animalia"] },
];
const fold = (s: string) => ` ${s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
const labCategory = (c: Charge) => {
  const text = fold(`${c.description} ${c.detail}`);
  return VIRTUAL.find((v) => v.merchants.some((m) => text.includes(` ${m} `)))?.key ?? c.category;
};
const labelOf = (key: string) => VIRTUAL.find((v) => v.key === key)?.label ?? categoryLabel(key);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const round2 = (v: number) => Math.round(v * 100) / 100;

type Group = { key: string; name: string; categories: string[] };
const INITIAL: Group[] = [
  { key: "fijos", name: "Gastos fijos", categories: ["suministros", "suscripciones", "prestamos"] },
  { key: "ocio", name: "Ocio", categories: ["restaurantes", "ocio", "videojuegos"] },
  { key: "moda", name: "Moda y complementos", categories: ["lab_moda"] },
  { key: "domicilio", name: "Comida a domicilio", categories: ["lab_domicilio"] },
];

function Diff({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return <span className="block text-xs text-slate-400">sin ciclo anterior</span>;
  const d = round2(current - previous);
  if (Math.abs(d) < 0.01) return <span className="block text-xs text-slate-400">igual que el anterior</span>;
  return <span className={`block text-xs font-medium tabular-nums ${d > 0 ? "text-red-600" : "text-emerald-600"}`}>{d > 0 ? "+" : "−"}{eur(Math.abs(d), 2)} vs anterior</span>;
}


/**
 * «Añadir a <partida>»: lista que sube desde abajo (como el historial de categoría de Inicio). Arriba las categorías
 * libres, por gasto del ciclo; debajo, en gris, las que están en otra partida, que se pueden traer (se mueven).
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
  const needle = fold(q.trim()).trim();
  const ownerOf = new Map(groups.flatMap((g) => g.categories.map((k) => [k, g] as const)));
  const candidates = allKeys
    .filter((k) => ownerOf.get(k)?.key !== target?.key)
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
      <SheetContent side="bottom" showCloseButton={false} className="data-[side=bottom]:h-[80dvh] max-h-[80dvh] gap-0 overflow-hidden rounded-t-3xl border-slate-200 bg-white p-0 sm:mx-auto sm:max-w-lg">
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
              <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sin partida</p>
              <ul className="divide-y divide-slate-100">{free.map(row)}</ul>
            </section>
          )}
          {elsewhere.length > 0 && (
            <section className="pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">En otras partidas</p>
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

export function LabPanel() {
  const { data, error } = useFinance<Packages>("packages");
  const [groups, setGroups] = useState<Group[]>(INITIAL);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<Group | null>(null);

  // Gasto por categoría (con las simuladas) en este ciclo y en el anterior hasta el mismo día del ciclo.
  const byCategory = useMemo(() => {
    if (!data) return null;
    const { cycle } = data;
    const prev = data.averageRanges[0] ?? null;
    const prevTo = prev ? (addDays(prev.start, cycle.day - 1) < prev.end ? addDays(prev.start, cycle.day - 1) : prev.end) : null;
    const now = new Map<string, number>();
    const before = new Map<string, number>();
    for (const c of data.charges) {
      if (c.patrimonial) continue;
      const k = labCategory(c);
      if (c.date >= cycle.start && c.date <= cycle.end) now.set(k, (now.get(k) ?? 0) - c.amount);
      if (prev && prevTo && c.date >= prev.start && c.date <= prevTo) before.set(k, (before.get(k) ?? 0) - c.amount);
    }
    return { now, before, hasPrev: !!prev };
  }, [data]);

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data || !byCategory) return <SkeletonList rows={4} />;

  const used = new Set(groups.flatMap((g) => g.categories));
  const allKeys = [...EXPENSE_CATEGORIES.map((c) => c.key), "sin_clasificar", ...VIRTUAL.map((v) => v.key)];
  const free = allKeys.filter((k) => !used.has(k)).sort((a, b) => labelOf(a).localeCompare(labelOf(b), "es"));
  const cur = (k: string) => round2(byCategory.now.get(k) ?? 0);
  const prv = (k: string) => (byCategory.hasPrev ? round2(byCategory.before.get(k) ?? 0) : null);
  const sum = (keys: string[], f: (k: string) => number | null) => {
    const vals = keys.map(f);
    return vals.some((v) => v === null) ? null : round2(vals.reduce((s: number, v) => s + (v ?? 0), 0));
  };
  // «Sin partida»: categorías que no están en ninguna partida y tienen gasto (para que nada se escape).
  const rows = [
    ...groups.map((g) => ({ ...g, editable: true })),
    { key: "sin", name: "Sin partida", categories: free.filter((k) => cur(k) > 0 || (prv(k) ?? 0) > 0), editable: false },
  ];

  const removeCat = (g: string, k: string) => setGroups((gs) => gs.map((x) => (x.key === g ? { ...x, categories: x.categories.filter((c) => c !== k) } : x)));
  // Añade a la partida; si alguna estaba en otra partida, se mueve (cada categoría en una sola partida).
  const addCats = (g: string, keys: string[]) => {
    setGroups((gs) => gs.map((x) => (x.key === g
      ? { ...x, categories: [...x.categories, ...keys.filter((k) => !x.categories.includes(k))] }
      : { ...x, categories: x.categories.filter((c) => !keys.includes(c)) })));
    setAdding(null);
  };

  return (
    <div className="mx-auto max-w-xl pb-6">
      <ul className="divide-y divide-slate-100 border-y border-slate-100">
        {rows.map((g) => {
          const isOpen = open === g.key;
          const now = sum(g.categories, cur) ?? 0;
          const before = sum(g.categories, prv);
          const sorted = [...g.categories].sort((a, b) => cur(b) - cur(a));
          const subtitle = sorted.slice(0, 3).map(labelOf).join(", ") + (sorted.length > 3 ? "…" : "");
          const muted = !g.editable;
          return (
            <li key={g.key}>
              <button type="button" onClick={() => setOpen(isOpen ? null : g.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-1 py-4 text-left active:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className={`block text-base font-semibold ${muted ? "text-slate-500" : "text-slate-900"}`}>{g.name}</span>
                  <span className="mt-0.5 block truncate text-sm text-slate-400">{subtitle || "Sin categorías"}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-lg font-semibold tabular-nums ${muted ? "text-slate-500" : "text-slate-900"}`}>{eur(now, 2)}</span>
                  <Diff current={now} previous={before} />
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="pb-3 pl-3">
                  <ul className="divide-y divide-slate-50">
                    {sorted.map((k) => (
                      <li key={k} className="flex items-center gap-3 py-2.5">
                        <span className="min-w-0 flex-1 text-sm text-slate-700">{labelOf(k)}</span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm tabular-nums text-slate-900">{eur(cur(k), 2)}</span>
                          <Diff current={cur(k)} previous={prv(k)} />
                        </span>
                        {g.editable && (
                          <button type="button" onClick={() => removeCat(g.key, k)} aria-label={`Quitar ${labelOf(k)}`} className="shrink-0 rounded-lg p-1.5 text-slate-300 active:bg-slate-100 active:text-red-600">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    ))}
                    {sorted.length === 0 && <li className="py-2.5 text-sm text-slate-400">{g.editable ? "Sin categorías." : "Todo tu gasto está en alguna partida."}</li>}
                  </ul>
                  {g.editable && (
                    <button type="button" onClick={() => setAdding(groups.find((x) => x.key === g.key) ?? null)} className="mt-2 inline-flex items-center gap-1.5 py-1.5 text-sm font-medium text-blue-600">
                      <Plus className="h-4 w-4" /> Añadir categoría
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <AddCategoriesSheet target={adding} groups={groups} allKeys={allKeys} cur={cur} onClose={() => setAdding(null)} onConfirm={(keys) => adding && addCats(adding.key, keys)} />
    </div>
  );
}
