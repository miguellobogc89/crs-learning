"use client";
// Laboratorio (/finanzas/laboratorio, fuera de los menús): pantalla para iterar el diseño de Plan con los datos
// reales del usuario. Solo lectura: usa los mismos endpoints que Plan y no guarda nada; lo que se prueba aquí no
// toca los paquetes reales. Lo que funcione se pasa después a Plan.
//
// Iteración 2: las partidas son solo grupos de categorías (cada categoría en una sola partida). Lista con líneas
// finas; al pulsar una partida se despliegan sus categorías con su gasto, y se pueden quitar o añadir (en memoria,
// sin guardar). «Moda», «Comida a domicilio» y «Mascotas» aún no existen como categorías: aquí se simulan por
// comercio, sacándolas de la categoría que tengan hoy (Compras, Restaurantes, Otros…).
import { useMemo, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
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

export function LabPanel() {
  const { data, error } = useFinance<Packages>("packages");
  const [groups, setGroups] = useState<Group[]>(INITIAL);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

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
  const addCat = (g: string, k: string) => {
    setGroups((gs) => gs.map((x) => (x.key === g ? { ...x, categories: [...x.categories, k] } : x)));
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
              <button type="button" onClick={() => { setOpen(isOpen ? null : g.key); setAdding(null); }} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-1 py-4 text-left active:bg-slate-50">
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
                  {g.editable && (adding === g.key ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {free.length === 0 && <span className="text-xs text-slate-400">Todas las categorías ya están en alguna partida.</span>}
                      {free.map((k) => (
                        <button key={k} type="button" onClick={() => addCat(g.key, k)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-50">
                          {labelOf(k)}{cur(k) > 0 ? ` · ${eur(cur(k), 2)}` : ""}
                        </button>
                      ))}
                      <button type="button" onClick={() => setAdding(null)} className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-400">Cancelar</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setAdding(g.key)} className="mt-2 inline-flex items-center gap-1.5 py-1.5 text-sm font-medium text-blue-600">
                      <Plus className="h-4 w-4" /> Añadir categoría
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
