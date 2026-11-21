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
import { BudgetBar } from "./charts";

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
  const [goal, setGoal] = useState("");
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
    setGoal(pack?.goal ? String(pack.goal).replace(".", ",") : "");
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
  const packName = useMemo(() => new Map(view.packages.map((p) => [p.id, p.name])), [view.packages]);
  /** Paquete (otro) que ya tiene este cargo: entonces aquí no se puede marcar. */
  const takenBy = (c: Charge) => (c.owner && c.owner !== pack?.id ? packName.get(c.owner) ?? "otro paquete" : null);
  const included = (c: Charge) => !takenBy(c) && (concepts.has(c.concept) || picked.has(c.id));
  const rows = useMemo(() => {
    const needle = fold(q.trim());
    return view.charges.filter((c) =>
      (account === "all" || c.accountId === account) &&
      (category === "all" || c.category === category) &&
      (onlyPicked === "all" || (onlyPicked === "si" ? !(c.owner && c.owner !== pack?.id) && (concepts.has(c.concept) || picked.has(c.id)) : !(c.owner && c.owner !== pack?.id))) &&
      (!needle || fold(`${c.description} ${c.detail} ${String(-c.amount).replace(".", ",")}`).includes(needle)));
  }, [view.charges, q, account, category, onlyPicked, picked, concepts, pack?.id]);
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
  const groupTaken = (g: ConceptGroup) => g.rows.map(takenBy).find((x) => x) ?? null;
  const toggleConcept = (g: ConceptGroup) => {
    if (groupTaken(g)) return;
    const on = concepts.has(g.key);
    setConcepts((s) => { const n = new Set(s); if (on) n.delete(g.key); else n.add(g.key); return n; });
    // Al marcar o desmarcar el concepto entero, sus cargos sueltos dejan de hacer falta.
    setPicked((s) => { const n = new Set(s); for (const c of view.charges) if (c.concept === g.key) n.delete(c.id); return n; });
  };
  const toggleRow = (c: Charge) => {
    if (concepts.has(c.concept) || takenBy(c)) return;
    setPicked((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; });
  };
  const allShown = mode === "concepto"
    ? shownGroups.some((g) => !groupTaken(g)) && shownGroups.every((g) => groupTaken(g) || concepts.has(g.key))
    : shownRows.some((c) => !takenBy(c)) && shownRows.every((c) => takenBy(c) || included(c));
  const toggleShown = () => {
    if (mode === "concepto") {
      const free = shownGroups.filter((g) => !groupTaken(g));
      setConcepts((s) => { const n = new Set(s); for (const g of free) { if (allShown) n.delete(g.key); else n.add(g.key); } return n; });
      const keys = new Set(free.map((g) => g.key));
      setPicked((s) => { const n = new Set(s); for (const c of view.charges) if (keys.has(c.concept)) n.delete(c.id); return n; });
    } else {
      setPicked((s) => { const n = new Set(s); for (const c of shownRows) { if (concepts.has(c.concept) || takenBy(c)) continue; if (allShown) n.delete(c.id); else n.add(c.id); } return n; });
    }
  };
  const toggleExpanded = (key: string) => setExpanded((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const totalIncluded = view.charges.filter(included).length;
  // Media por ciclo de lo que va quedando marcado: la propuesta para el objetivo.
  const suggested = view.averageRanges.length
    ? Math.round((view.charges.filter(included).reduce((s, c) => s + (view.averageRanges.some((r) => c.date >= r.start && c.date <= r.end) ? -c.amount : 0), 0) / view.averageRanges.length) * 100) / 100
    : null;
  const goalValue = (() => {
    const t = goal.trim().replace(/\s|€/g, "");
    if (!t) return null;
    return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  })();
  const accountsOf = (g: ConceptGroup) => {
    const ids = [...new Set(g.rows.map((r) => r.accountId))];
    return ids.length === 1 ? accName.get(ids[0]) ?? "—" : "Varias";
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (goalValue !== null && !(goalValue > 0)) throw new Error("El objetivo debe ser un importe mayor que cero");
      await fapi("package", { id: pack?.id, name, goal: goalValue, conceptKeys: [...concepts], txIds: [...picked] });
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
      subtitle="Marca un concepto para que entren todos sus cargos (los de antes y los que lleguen), o un cargo suelto en la vista por movimiento. Solo aparecen gastos: los traspasos entre tus cuentas y las aportaciones a ahorro o inversión no son consumo."
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
        <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="P. ej. Fijos, Tabaco, Gasolina" className={`${field} w-full`} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Asigna un objetivo por ciclo (opcional)</span>
            <span className="flex items-center gap-2">
              <input inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={suggested ? `Tu media: ${eur(suggested, 2)}` : "0,00 €"} className={`${field} w-full text-right tabular-nums`} />
              {suggested !== null && suggested > 0 && <button type="button" onClick={() => setGoal(String(suggested).replace(".", ","))} className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50" title="Usar tu media de los últimos ciclos">Media</button>}
            </span>
          </label>
        </div>
        <TableToolbar
          search={q}
          onSearchChange={setQ}
          searchPlaceholder="Buscar concepto, comercio o importe..."
          group={{ value: mode, options: VIEWS, onChange: setMode }}
          filters={{
            groups: [
              { key: "account", label: "Cuenta", value: account, allLabel: "Todas las cuentas", allIcon: ListFilter, options: view.accounts.map((a) => ({ value: a.id, label: a.name })) },
              { key: "category", label: "Categoría", value: category, allLabel: "Todas las categorías", allIcon: ListFilter, options: SELECTABLE_CATEGORIES.filter((c) => usedCategories.has(c.key)).map((c) => ({ value: c.key, label: c.label })) },
              { key: "picked", label: "Marcados", value: onlyPicked, allLabel: "Todos", options: [{ value: "si", label: "Solo los marcados" }, { value: "libres", label: "Disponibles (sin otro paquete)" }] },
            ],
            onChange: (key, value) => (key === "account" ? setAccount(value) : key === "category" ? setCategory(value) : setOnlyPicked(value)),
            onClear: () => { setAccount("all"); setCategory("all"); setOnlyPicked("all"); },
          }}
        />
        <div className="h-[50vh] overflow-y-auto rounded-xl border border-slate-100">
          <table className="w-full table-fixed text-sm">
            {mode === "concepto" ? (
              <colgroup>
                <col className="w-10" />
                <col />
                <col className="hidden w-36 md:table-column" />
                <col className="hidden w-32 md:table-column" />
                <col className="w-24" />
              </colgroup>
            ) : (
              <colgroup>
                <col className="w-10" />
                <col className="w-16" />
                <col />
                <col className="hidden w-36 md:table-column" />
                <col className="hidden w-28 md:table-column" />
                <col className="w-24" />
              </colgroup>
            )}
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
                  const taken = groupTaken(g);
                  const full = !taken && concepts.has(g.key);
                  const partial = !full && g.rows.some((r) => included(r));
                  const isOpen = expanded.has(g.key);
                  return (
                    <Fragment key={g.key}>
                      <tr onClick={() => toggleConcept(g)} className={`border-b border-slate-50 ${taken ? "text-slate-400" : "cursor-pointer"} ${full ? "bg-blue-50/60" : partial ? "bg-blue-50/30" : taken ? "" : "hover:bg-slate-50"}`}>
                        <td className="px-3 py-2"><TriCheckbox checked={full} partial={partial} disabled={!!taken} onChange={() => toggleConcept(g)} label={`Marcar ${g.label}`} /></td>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1.5">
                            <button type="button" onClick={(e) => { e.stopPropagation(); toggleExpanded(g.key); }} aria-label={isOpen ? "Ocultar cargos" : "Ver cargos"} className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                              <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                            </button>
                            <span className="min-w-0">
                              <span className={`block break-words font-medium ${taken ? "text-slate-400" : "text-slate-900"}`}>{g.label}</span>
                              <span className="block text-xs text-slate-500">{taken ? <>En «{taken}»</> : <>{g.rows.length} {g.rows.length === 1 ? "cargo" : "cargos"} · {categoryLabel(g.last.category)}</>}</span>
                            </span>
                          </span>
                        </td>
                        <td className="hidden truncate whitespace-nowrap px-3 py-2 text-slate-500 md:table-cell" title={accountsOf(g)}>{accountsOf(g)}</td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-slate-500 md:table-cell">{shortDay(g.last.date)} · <span className="tabular-nums">{eur(-g.last.amount, 2)}</span></td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{eur(g.total / g.rows.length, 2)}</td>
                      </tr>
                      {isOpen && g.rows.map((c) => (
                        <tr key={c.id} onClick={() => toggleRow(c)} className={`border-b border-slate-50 bg-slate-50/50 text-xs ${full || takenBy(c) ? "" : "cursor-pointer hover:bg-slate-100/60"}`}>
                          <td className="py-1.5 pl-8 pr-3"><TriCheckbox checked={included(c)} disabled={full || !!takenBy(c)} onChange={() => toggleRow(c)} label="Marcar este cargo" /></td>
                          <td className="px-3 py-1.5"><span className="block break-words pl-6 text-slate-600" title={c.detail}>{shortDay(c.date)} · {c.description}</span></td>
                          <td className="hidden truncate whitespace-nowrap px-3 py-1.5 text-slate-500 md:table-cell">{accName.get(c.accountId) ?? "—"}</td>
                          <td className="hidden truncate px-3 py-1.5 md:table-cell">{takenBy(c) ? <span className="text-slate-400">en «{takenBy(c)}»</span> : full && <span className="text-slate-400">por concepto</span>}</td>
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
                  const taken = takenBy(c);
                  const byConcept = !taken && concepts.has(c.concept);
                  return (
                    <tr key={c.id} onClick={() => toggleRow(c)} className={`${byConcept || taken ? "" : "cursor-pointer"} ${taken ? "text-slate-400" : included(c) ? "bg-blue-50/60" : "hover:bg-slate-50"}`}>
                      <td className="px-3 py-2"><TriCheckbox checked={included(c)} disabled={byConcept || !!taken} onChange={() => toggleRow(c)} label="Marcar este cargo" /></td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{shortDay(c.date)}</td>
                      <td className="px-3 py-2">
                        <span className={`block break-words ${taken ? "" : "text-slate-900"}`} title={c.detail}>{c.description}</span>
                        {taken ? <span className="block text-xs text-slate-400">En «{taken}»</span> : byConcept && <span className="block text-xs text-slate-400">entra por su concepto</span>}
                      </td>
                      <td className="hidden truncate whitespace-nowrap px-3 py-2 text-slate-500 md:table-cell">{accName.get(c.accountId) ?? "—"}</td>
                      <td className="hidden truncate whitespace-nowrap px-3 py-2 text-slate-500 md:table-cell">{categoryLabel(c.category)}</td>
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

/** Edita el objetivo de ahorro de Finanzas (mismo dato y endpoint que la previsión de Inicio; no es un paquete). */
function SavingsModal({ savings, open, onClose }: { savings: View["savings"]; open: boolean; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<"mensual" | "semanal">("mensual");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setAmount(savings.amount === null ? "" : String(savings.amount).replace(".", ","));
    setFrequency(savings.frequency);
    setErr(null);
  }, [open, savings]);
  const save = async () => {
    const t = amount.trim().replace(/\s|€/g, "");
    const value = t === "" ? null : Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
    if (value !== null && !(value >= 0)) { setErr("Escribe un importe válido"); return; }
    setBusy(true);
    setErr(null);
    try {
      await fapi("settings", { savingsGoal: value, savingsFrequency: frequency });
      refreshFinance();
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Objetivo de ahorro"
      subtitle="Dinero que quieres reservar cada ciclo. No cuenta como gasto y es el mismo objetivo que ves en la previsión de Inicio."
      footer={<><button type="button" onClick={onClose} className={ghost}>Cancelar</button><button type="button" onClick={() => void save()} disabled={busy} className={primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar</button></>}
    >
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="min-w-0 flex-1 text-xs font-medium text-slate-600">Importe (€)
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Vacío = sin objetivo" className={`${field} mt-1 block w-full`} />
        </label>
        <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Frecuencia del ahorro">
          {(["mensual", "semanal"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={frequency === f} onClick={() => setFrequency(f)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${frequency === f ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>
              {f === "mensual" ? "Mensual" : "Semanal"}
            </button>
          ))}
        </div>
      </div>
      {frequency === "semanal" && <p className="mt-2 text-xs text-slate-500">En el plan se cuenta por ciclo: el importe semanal × 52 / 12.</p>}
      {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
    </Modal>
  );
}

/**
 * Resumen del reparto del ciclo: ingreso medio (del histórico) − objetivos de los paquetes − objetivo de ahorro
 * = pendiente de presupuestar. Son objetivos, no gasto real: lo que ya has gastado está en cada paquete.
 */
function PlanSummary({ view }: { view: View }) {
  const [editSavings, setEditSavings] = useState(false);
  const goals = Math.round(view.packages.reduce((s, p) => s + (p.goal ?? 0), 0) * 100) / 100;
  const withGoal = view.packages.filter((p) => p.goal !== null).length;
  const income = view.averageIncome;
  const saving = view.savings.perCycle ?? 0;
  const pending = income === null ? null : Math.round((income - goals - saving) * 100) / 100;
  const over = pending !== null && pending < 0;
  const box = "rounded-xl bg-slate-50 p-3";
  return (
    <div className="mx-4 mb-3 sm:mx-6">
      <div className="grid gap-2 text-sm sm:grid-cols-4">
        <div className={box}>
          <p className="text-xs text-slate-500">Ingreso medio por ciclo</p>
          <p className="font-semibold tabular-nums text-slate-900">{eur(income, 2)}</p>
          <p className="text-[11px] text-slate-400">{view.averageCycles} {view.averageCycles === 1 ? "ciclo completo" : "ciclos completos"}</p>
        </div>
        <div className={box}>
          <p className="text-xs text-slate-500">Presupuestado en paquetes</p>
          <p className="font-semibold tabular-nums text-slate-900">− {eur(goals, 2)}</p>
          <p className="text-[11px] text-slate-400">{withGoal} de {view.packages.length} paquetes con objetivo</p>
        </div>
        <button type="button" onClick={() => setEditSavings(true)} className={`${box} text-left hover:bg-slate-100`} title="Editar el objetivo de ahorro">
          <p className="flex items-center justify-between gap-2 text-xs text-slate-500">Objetivo de ahorro <Pencil className="h-3.5 w-3.5 text-slate-400" /></p>
          <p className="font-semibold tabular-nums text-slate-900">{view.savings.perCycle === null ? "Sin objetivo" : `− ${eur(view.savings.perCycle, 2)}`}</p>
          <p className="text-[11px] text-slate-400">{view.savings.amount === null ? "Pulsa para fijarlo" : view.savings.frequency === "semanal" ? `${eur(view.savings.amount, 2)} por semana` : "por ciclo"}</p>
        </button>
        <div className={`${box} ${over ? "bg-red-50" : ""}`}>
          <p className="text-xs text-slate-500">{over ? "Presupuestas de más" : "Pendiente de presupuestar"}</p>
          <p className={`font-semibold tabular-nums ${pending === null ? "text-slate-400" : over ? "text-red-700" : "text-emerald-700"}`}>{pending === null ? "—" : eur(Math.abs(pending), 2)}</p>
          <p className="text-[11px] text-slate-400">{over ? "Los objetivos superan tu ingreso medio" : "Ingreso que aún no tiene objetivo"}</p>
        </div>
      </div>
      <SavingsModal savings={view.savings} open={editSavings} onClose={() => setEditSavings(false)} />
    </div>
  );
}

function PackageRow({ p, view, onEdit, onDelete }: { p: Pack; view: View; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const up = p.average !== null && p.average > 0 ? p.current - p.average : null;
  return (
    <li>
      <div onClick={() => setOpen(!open)} className="grid cursor-pointer grid-cols-[1fr_9rem] items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-6 md:grid-cols-[1fr_11rem_7rem_7rem_4.5rem]">
        <span className="flex min-w-0 items-center gap-1.5">
          <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="min-w-0">
            <span className="block break-words font-medium text-slate-900">{p.name}</span>
            <span className="block truncate text-xs text-slate-500">{p.conceptKeys.length} {p.conceptKeys.length === 1 ? "concepto" : "conceptos"}{p.txIds.length ? ` y ${p.txIds.length} sueltos` : ""}</span>
          </span>
        </span>
        <span className="text-right">
          <span className="block whitespace-nowrap tabular-nums">
            <b className={p.progress?.status === "superado" ? "text-red-700" : "text-slate-900"}>{eur(p.current, 2)}</b>
            {p.goal !== null && <span className="text-xs text-slate-500"> de {eur(p.goal, 2)}</span>}
          </span>
          {p.progress && <span className="mt-1 block"><BudgetBar pct={p.progress.pct} expectedPct={p.progress.expectedPct} status={p.progress.status} /></span>}
          <span className="block text-xs text-slate-500 md:hidden">media {eur(p.average, 2)}</span>
        </span>
        <span className="hidden text-right tabular-nums text-slate-600 md:block">{eur(p.previous, 2)}</span>
        <span className="hidden text-right tabular-nums text-slate-600 md:block">{eur(p.average, 2)}</span>
        <span className="hidden items-center justify-end gap-0.5 md:flex">
          <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label="Editar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Borrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
        </span>
      </div>
      {open && (
        <div className="border-t border-slate-50 bg-slate-50/60 px-4 py-3 sm:px-6">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              Cargos de este ciclo ({p.currentCharges.length})
              {p.progress && <> · {p.progress.remaining >= 0 ? `te quedan ${eur(p.progress.remaining, 2)} del objetivo` : `te has pasado ${eur(-p.progress.remaining, 2)} del objetivo`}</>}
              {up !== null && Math.abs(up) >= 0.01 && <> · {up > 0 ? `${eur(up, 2)} por encima de tu media` : `${eur(-up, 2)} por debajo de tu media`} (con el día {view.cycle.day} de {view.cycle.totalDays})</>}
            </span>
            <span className="flex gap-1 md:hidden">
              <button type="button" onClick={onEdit} className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600">Editar</button>
              <button type="button" onClick={onDelete} className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-red-600">Borrar</button>
            </span>
          </div>
          {p.currentCharges.length === 0 ? <p className="text-xs text-slate-500">Sin cargos este ciclo.</p> : (
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {p.currentCharges.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className="w-12 shrink-0 text-xs text-slate-400">{shortDay(c.date)}</span>
                  <span className="min-w-0 flex-1 break-words text-slate-700" title={c.detail}>{c.description}</span>
                  <span className="shrink-0 tabular-nums text-slate-900">{eur(-c.amount, 2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
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
            <SectionTitle icon={Package} tint="blue" size="base">Mis paquetes <span className="ml-1 text-sm font-normal text-slate-500">ciclo {shortDay(data.cycle.start)} – {shortDay(data.cycle.end)} · día {data.cycle.day} de {data.cycle.totalDays}</span></SectionTitle>
          </CardHeader>
          <PlanSummary view={data} />
          <div className="hidden grid-cols-[1fr_11rem_7rem_7rem_4.5rem] gap-3 border-b border-slate-100 px-6 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <span>Paquete</span><span className="text-right">Este ciclo / objetivo</span><span className="text-right">Ciclo anterior</span><span className="text-right">Media {data.averageCycles > 0 ? `(${data.averageCycles})` : ""}</span><span />
          </div>
          <ul className="divide-y divide-slate-100">
            {data.packages.map((p) => <PackageRow key={p.id} p={p} view={data} onEdit={() => { setEditing(p); setOpen(true); }} onDelete={() => void remove(p)} />)}
          </ul>
        </section>
      )}
      <PackageModal view={data} pack={editing} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
