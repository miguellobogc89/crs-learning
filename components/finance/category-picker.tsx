"use client";
// Selector de categorías (árbol del 23/11/2026): buscador, pestañas Gasto / Ingreso / No computable, «Sugeridas»
// según el comercio y las familias como secciones, cada categoría con su pista. Va dentro de una hoja; elegir
// una categoría llama a onPick (quien lo usa decide el tipo del movimiento según la categoría).
import { useMemo, useState } from "react";
import { Check, MagnifyingGlass } from "@phosphor-icons/react";
import { CATEGORIES, FAMILIES, type CategoryDef, type FamilyDef, type Kind } from "@/lib/finance/categories";
import { keywordClass } from "@/lib/finance/logic";
import { CategoryIcon } from "./category-icon";

type Tab = FamilyDef["tab"];
const TABS: { key: Tab; label: string }[] = [
  { key: "gasto", label: "Gasto" }, { key: "ingreso", label: "Ingreso" }, { key: "no_computable", label: "No computable" },
];
const tabOfKind = (kind: Kind): Tab => (kind === "ingreso" || kind === "regalo" ? "ingreso" : kind === "interna" || kind === "ahorro" ? "no_computable" : "gasto");
const tabOfCategory = (c: CategoryDef): Tab => FAMILIES.find((f) => f.key === c.family)?.tab ?? "gasto";
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const PICKABLE = CATEGORIES.filter((c) => c.key !== "sin_clasificar");

export function CategoryPicker({ current, kind, movement, onPick }: {
  current: string;
  kind: Kind;
  /** El movimiento que se está editando, para sugerir categorías por su comercio. */
  movement?: { description: string; counterparty: string | null; amount: number };
  onPick: (category: CategoryDef) => void;
}) {
  const [tab, setTab] = useState<Tab>(() => tabOfKind(kind));
  const [q, setQ] = useState("");
  const suggested = useMemo(() => {
    if (!movement) return [];
    const keys = new Set<string>();
    const hit = keywordClass(movement)?.category;
    if (hit && hit !== current) keys.add(hit);
    return [...keys].map((k) => PICKABLE.find((c) => c.key === k)).filter((c): c is CategoryDef => !!c);
  }, [movement, current]);
  const query = fold(q.trim());
  const familyLabel = (c: CategoryDef) => FAMILIES.find((f) => f.key === c.family)?.label ?? "";
  const results = query ? PICKABLE.filter((c) => fold(`${c.label} ${c.hint} ${familyLabel(c)}`).includes(query)) : null;

  const Row = ({ c }: { c: CategoryDef }) => (
    <li>
      <button type="button" onClick={() => onPick(c)} className="flex w-full items-center gap-3.5 px-5 py-3 text-left active:bg-slate-50">
        <CategoryIcon category={c.key} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] text-slate-900">{c.label}</span>
          {c.hint && <span className="block truncate text-[13px] text-slate-500">{c.hint}</span>}
        </span>
        {c.key === current && <Check size={20} weight="bold" className="shrink-0 text-blue-600" />}
      </button>
    </li>
  );
  const Section = ({ title, items }: { title: string; items: CategoryDef[] }) => (
    <section>
      <h3 className="sticky top-0 z-10 bg-slate-50 px-5 py-2 text-[13px] font-semibold text-slate-600">{title}</h3>
      <ul className="divide-y divide-slate-100">{items.map((c) => <Row key={c.key} c={c} />)}</ul>
    </section>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pb-1">
        <label className="flex h-11 items-center gap-2 rounded-full bg-slate-100 px-4">
          <MagnifyingGlass size={18} className="shrink-0 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar categoría" enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-slate-400" />
        </label>
        {!query && (
          <div className="mt-1 grid grid-cols-3" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={`relative py-2.5 text-[15px] font-medium ${tab === t.key ? "text-slate-900" : "text-slate-400"}`}>
                {t.label}
                {tab === t.key && <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-slate-900" />}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-100 pb-[env(safe-area-inset-bottom)]">
        {results ? (
          results.length ? <Section title={`${results.length} ${results.length === 1 ? "resultado" : "resultados"}`} items={results} />
            : <p className="px-5 py-8 text-center text-sm text-slate-500">Ninguna categoría con «{q}».</p>
        ) : (
          <>
            {suggested.some((c) => tabOfCategory(c) === tab) && <Section title="Sugeridas para este movimiento" items={suggested.filter((c) => tabOfCategory(c) === tab)} />}
            {FAMILIES.filter((f) => f.tab === tab).map((f) => (
              <Section key={f.key} title={f.label} items={f.cats.map((c) => PICKABLE.find((p) => p.key === c.key)!).filter(Boolean)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
