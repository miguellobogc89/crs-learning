"use client";
// Mi plan: paquetes de gasto que crea cada usuario (Fijos, Tabaco, Gasolina…). Primer paso, solo la carcasa:
// crear, renombrar y borrar paquetes y elegir sus cargos en un modal con buscador y filtros, por concepto (entran
// los cargos pasados y futuros) o por movimiento (solo ese cargo).
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ListFilter, Loader2, Package, Pencil, Plus, Trash2 } from "lucide-react";
import type { packagesView } from "@/lib/finance/service";
import { SELECTABLE_CATEGORIES, categoryLabel } from "@/lib/finance/categories";
import { card, eur, field, flat, ghost, primary } from "@/components/trading/format";
import { CardHeader, ErrorNote, Modal, SectionTitle } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { TableToolbar } from "@/components/ui/table-toolbar";
import { errorText, fapi, refreshFinance, shortDay, useFinance } from "./api";

type View = Awaited<ReturnType<typeof packagesView>>;
type Pack = View["packages"][number];

/** Para buscar sin mayúsculas ni tildes. */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Charge = View["charges"][number];
type ConceptGroup = { key: string; label: string; rows: Charge[]; total: number; last: Charge };

/** Casilla con estado intermedio (concepto con solo algunos cargos marcados a mano). */
function TriCheckbox({ checked, partial, disabled, onChange, label }: { checked: boolean; partial?: boolean; disabled?: boolean; onChange: () => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !checked && !!partial; }, [checked, partial]);
  return <input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} onClick={(e) => e.stopPropagation()} aria-label={label} className="h-4 w-4 rounded border-slate-300 disabled:opacity-60" />;
}

const VIEWS = [{ value: "concepto", label: "Por concepto" }, { value: "movimiento", label: "Por movimiento" }];

function PackageModal({ view, pack, open, onClose }: { view: View; pack: Pack | null; open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [concepts, setConcepts] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState("concepto");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [account, setAccount] = useState("all");
  const [category, setCategory] = useState("all");
  const [onlyPicked, setOnlyPicked] = useState("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setName(pack?.name ?? "");
    setConcepts(new Set(pack?.conceptKeys ?? []));
    setPicked(new Set(pack?.txIds ?? []));
    setMode("concepto");
    setExpanded(new Set());
    setQ("");
    setAccount("all");
    setCategory("all");
    setOnlyPicked("all");
    setErr(null);
  }, [open, pack]);

  const accName = useMemo(() => new Map(view.accounts.map((a) => [a.id, a.name])), [view.accounts]);
  const usedCategories = useMemo(() => new Set(view.charges.map((c) => c.category)), [view.charges]);
  const included = (c: Charge) => concepts.has(c.concept) || picked.has(c.id);
  const rows = useMemo(() => {
    const needle = fold(q.trim());
    return view.charges.filter((c) =>
      (account === "all" || c.accountId === account) &&
      (category === "all" || c.category === category) &&
      (onlyPicked === "all" || concepts.has(c.concept) || picked.has(c.id)) &&
      (!needle || fold(`${c.description} ${c.detail} ${String(-c.amount).replace(".", ",")}`).includes(needle)));
  }, [view.charges, q, account, category, onlyPicked, picked, concepts]);
  const groups = useMemo(() => {
    const map = new Map<string, ConceptGroup>();
    for (const c of rows) {
      const g = map.get(c.concept);
      if (g) { g.rows.push(c); g.total += -c.amount; }
      else map.set(c.concept, { key: c.concept, label: c.description, rows: [c], total: -c.amount, last: c });
    }
    return [...map.values()].sort((a, b) => b.last.date.localeCompare(a.last.date));
  }, [rows]);

  const shownRows = rows.slice(0, 500);
  const shownGroups = groups.slice(0, 500);
  const toggleConcept = (g: ConceptGroup) => {
    const on = concepts.has(g.key);
    setConcepts((s) => { const n = new Set(s); if (on) n.delete(g.key); else n.add(g.key); return n; });
    // Al marcar o desmarcar el concepto entero, sus cargos sueltos dejan de hacer falta.
    setPicked((s) => { const n = new Set(s); for (const c of view.charges) if (c.concept === g.key) n.delete(c.id); return n; });
  };
  const toggleRow = (c: Charge) => {
    if (concepts.has(c.concept)) return;
    setPicked((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; });
  };
  const allShown = mode === "concepto" ? shownGroups.length > 0 && shownGroups.every((g) => concepts.has(g.key)) : shownRows.length > 0 && shownRows.every(included);
  const toggleShown = () => {
    if (mode === "concepto") {
      setConcepts((s) => { const n = new Set(s); for (const g of shownGroups) { if (allShown) n.delete(g.key); else n.add(g.key); } return n; });
      const keys = new Set(shownGroups.map((g) => g.key));
      setPicked((s) => { const n = new Set(s); for (const c of view.charges) if (keys.has(c.concept)) n.delete(c.id); return n; });
    } else {
      setPicked((s) => { const n = new Set(s); for (const c of shownRows) { if (concepts.has(c.concept)) continue; if (allShown) n.delete(c.id); else n.add(c.id); } return n; });
    }
  };
  const toggleExpanded = (key: string) => setExpanded((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const totalIncluded = useMemo(() => view.charges.filter((c) => concepts.has(c.concept) || picked.has(c.id)).length, [view.charges, concepts, picked]);
  const accountsOf = (g: ConceptGroup) => {
    const ids = [...new Set(g.rows.map((r) => r.accountId))];
    return ids.length === 1 ? accName.get(ids[0]) ?? "—" : "Varias";
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await fapi("package", { id: pack?.id, name, conceptKeys: [...concepts], txIds: [...picked] });
      refreshFinance();
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const th = "px-3 py-2.5";
  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-5xl"
      title={pack ? "Editar paquete" : "Nuevo paquete"}
      subtitle="Marca un concepto para que entren todos sus cargos (los de antes y los que lleguen), o un cargo suelto en la vista por movimiento."
      footer={
        <>
          <span className="mr-auto text-sm text-slate-500">
            {concepts.size} {concepts.size === 1 ? "concepto" : "conceptos"} · {picked.size} {picked.size === 1 ? "cargo suelto" : "cargos sueltos"} · <b className="text-slate-700">{totalIncluded} cargos en el último año</b>
          </span>
          <button type="button" onClick={onClose} className={ghost}>Cancelar</button>
          <button type="button" onClick={() => void save()} disabled={busy} className={primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar</button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del paquete (p. ej. Fijos, Tabaco, Gasolina)" className={`${field} w-full`} />
        <TableToolbar
          search={q}
          onSearchChange={setQ}
          searchPlaceholder="Buscar concepto, comercio o importe..."
          group={{ value: mode, options: VIEWS, onChange: setMode }}
          filters={{
            groups: [
              { key: "account", label: "Cuenta", value: account, allLabel: "Todas las cuentas", allIcon: ListFilter, options: view.accounts.map((a) => ({ value: a.id, label: a.name })) },
              { key: "category", label: "Categoría", value: category, allLabel: "Todas las categorías", allIcon: ListFilter, options: SELECTABLE_CATEGORIES.filter((c) => usedCategories.has(c.key)).map((c) => ({ value: c.key, label: c.label })) },
              { key: "picked", label: "Marcados", value: onlyPicked, allLabel: "Todos", options: [{ value: "si", label: "Solo los marcados" }] },
            ],
            onChange: (key, value) => (key === "account" ? setAccount(value) : key === "category" ? setCategory(value) : setOnlyPicked(value)),
            onClear: () => { setAccount("all"); setCategory("all"); setOnlyPicked("all"); },
          }}
        />
        <div className="h-[50vh] overflow-y-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className={`${th} w-10`}><TriCheckbox checked={allShown} onChange={toggleShown} label="Marcar todo lo visible" /></th>
                {mode === "concepto" ? (
                  <>
                    <th className={th}>Concepto</th>
                    <th className={`${th} hidden md:table-cell`}>Cuenta</th>
                    <th className={`${th} hidden md:table-cell`}>Último</th>
                    <th className={`${th} text-right`}>Media</th>
                  </>
                ) : (
                  <>
                    <th className={th}>Fecha</th>
                    <th className={th}>Concepto</th>
                    <th className={`${th} hidden md:table-cell`}>Cuenta</th>
                    <th className={`${th} hidden md:table-cell`}>Categoría</th>
                    <th className={`${th} text-right`}>Importe</th>
                  </>
                )}
              </tr>
            </thead>
            {mode === "concepto" ? (
              <tbody>
                {shownGroups.map((g) => {
                  const full = concepts.has(g.key);
                  const partial = !full && g.rows.some((r) => picked.has(r.id));
                  const isOpen = expanded.has(g.key);
                  return (
                    <Fragment key={g.key}>
                      <tr onClick={() => toggleConcept(g)} className={`cursor-pointer border-b border-slate-50 ${full ? "bg-blue-50/60" : partial ? "bg-blue-50/30" : "hover:bg-slate-50"}`}>
                        <td className="px-3 py-2"><TriCheckbox checked={full} partial={partial} onChange={() => toggleConcept(g)} label={`Marcar ${g.label}`} /></td>
                        <td className="max-w-0 px-3 py-2">
                          <span className="flex items-center gap-1.5">
                            <button type="button" onClick={(e) => { e.stopPropagation(); toggleExpanded(g.key); }} aria-label={isOpen ? "Ocultar cargos" : "Ver cargos"} className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                              <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                            </button>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-900">{g.label}</span>
                              <span className="block text-xs text-slate-500">{g.rows.length} {g.rows.length === 1 ? "cargo" : "cargos"} · {categoryLabel(g.last.category)}</span>
                            </span>
                          </span>
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-slate-500 md:table-cell">{accountsOf(g)}</td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-slate-500 md:table-cell">{shortDay(g.last.date)} · <span className="tabular-nums">{eur(-g.last.amount, 2)}</span></td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{eur(g.total / g.rows.length, 2)}</td>
                      </tr>
                      {isOpen && g.rows.map((c) => (
                        <tr key={c.id} onClick={() => toggleRow(c)} className={`border-b border-slate-50 bg-slate-50/50 text-xs ${full ? "" : "cursor-pointer hover:bg-slate-100/60"}`}>
                          <td className="py-1.5 pl-8 pr-3"><TriCheckbox checked={included(c)} disabled={full} onChange={() => toggleRow(c)} label="Marcar este cargo" /></td>
                          <td className="max-w-0 px-3 py-1.5"><span className="block truncate pl-6 text-slate-600" title={c.detail}>{shortDay(c.date)} · {c.detail}</span></td>
                          <td className="hidden whitespace-nowrap px-3 py-1.5 text-slate-500 md:table-cell">{accName.get(c.accountId) ?? "—"}</td>
                          <td className="hidden px-3 py-1.5 md:table-cell">{full && <span className="text-slate-400">por concepto</span>}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-700">{eur(-c.amount, 2)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            ) : (
              <tbody className="divide-y divide-slate-50">
                {shownRows.map((c) => {
                  const byConcept = concepts.has(c.concept);
                  return (
                    <tr key={c.id} onClick={() => toggleRow(c)} className={`${byConcept ? "" : "cursor-pointer"} ${included(c) ? "bg-blue-50/60" : "hover:bg-slate-50"}`}>
                      <td className="px-3 py-2"><TriCheckbox checked={included(c)} disabled={byConcept} onChange={() => toggleRow(c)} label="Marcar este cargo" /></td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{shortDay(c.date)}</td>
                      <td className="max-w-0 px-3 py-2">
                        <span className="block truncate text-slate-900" title={c.detail}>{c.description}</span>
                        {byConcept && <span className="block text-xs text-slate-400">entra por su concepto</span>}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-slate-500 md:table-cell">{accName.get(c.accountId) ?? "—"}</td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-slate-500 md:table-cell">{categoryLabel(c.category)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{eur(-c.amount, 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
          {rows.length === 0 && <p className="py-10 text-center text-slate-400">No hay cargos con estos filtros.</p>}
          {mode === "concepto" ? groups.length > shownGroups.length && <p className="py-3 text-center text-xs text-slate-400">Se muestran 500 de {groups.length} conceptos. Afina la búsqueda.</p>
            : rows.length > shownRows.length && <p className="py-3 text-center text-xs text-slate-400">Se muestran 500 de {rows.length}. Afina la búsqueda para ver el resto.</p>}
        </div>
        {err && <ErrorNote>{err}</ErrorNote>}
      </div>
    </Modal>
  );
}

export function PlanPanel() {
  const { data, error } = useFinance<View>("packages");
  const [editing, setEditing] = useState<Pack | null>(null);
  const [open, setOpen] = useState(false);
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={6} />;
  const create = () => { setEditing(null); setOpen(true); };
  const remove = async (p: Pack) => {
    if (!window.confirm(`¿Borrar el paquete «${p.name}»?`)) return;
    await fapi("package/delete", { id: p.id });
    refreshFinance();
  };
  return (
    <div className="space-y-4 pb-4">
      {data.packages.length === 0 ? (
        <section className={`${card} ${flat} flex flex-col items-center px-6 py-12 text-center`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Package className="h-6 w-6" /></span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Crea tus paquetes</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">Agrupa lo que quieres controlar: fijos, tabaco, restaurantes, gasolina… Cada paquete reúne los cargos que tú elijas.</p>
          <button type="button" onClick={create} className={`${primary} mt-6`}><Plus className="h-4 w-4" /> Crear paquete</button>
        </section>
      ) : (
        <section className={`${card} ${flat}`}>
          <CardHeader actions={<button type="button" onClick={create} className={ghost}><Plus className="h-4 w-4" /> Crear paquete</button>}>
            <SectionTitle icon={Package} tint="blue" size="base">Mis paquetes</SectionTitle>
          </CardHeader>
          <ul className="divide-y divide-slate-100">
            {data.packages.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{p.name}</span>
                  <span className="block text-xs text-slate-500">{p.count} {p.count === 1 ? "cargo" : "cargos"} en el último año · {p.conceptKeys.length} {p.conceptKeys.length === 1 ? "concepto" : "conceptos"}{p.txIds.length ? ` y ${p.txIds.length} sueltos` : ""}</span>
                </span>
                <button type="button" onClick={() => { setEditing(p); setOpen(true); }} aria-label="Editar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => void remove(p)} aria-label="Borrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <PackageModal view={data} pack={editing} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
