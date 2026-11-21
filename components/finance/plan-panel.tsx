"use client";
// Mi plan: paquetes de gasto que crea cada usuario (Fijos, Tabaco, Gasolina…). Primer paso, solo la carcasa:
// crear, renombrar y borrar paquetes y elegir sus cargos en un modal con buscador y filtros.
import { useEffect, useMemo, useState } from "react";
import { ListFilter, Loader2, Package, Pencil, Plus, Trash2 } from "lucide-react";
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

function PackageModal({ view, pack, open, onClose }: { view: View; pack: Pack | null; open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [account, setAccount] = useState("all");
  const [category, setCategory] = useState("all");
  const [onlyPicked, setOnlyPicked] = useState("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setName(pack?.name ?? "");
    setPicked(new Set(pack?.txIds ?? []));
    setQ("");
    setAccount("all");
    setCategory("all");
    setOnlyPicked("all");
    setErr(null);
  }, [open, pack]);

  const accName = useMemo(() => new Map(view.accounts.map((a) => [a.id, a.name])), [view.accounts]);
  const usedCategories = useMemo(() => new Set(view.charges.map((c) => c.category)), [view.charges]);
  const rows = useMemo(() => {
    const needle = fold(q.trim());
    return view.charges.filter((c) =>
      (account === "all" || c.accountId === account) &&
      (category === "all" || c.category === category) &&
      (onlyPicked === "all" || picked.has(c.id)) &&
      (!needle || fold(`${c.description} ${c.detail} ${String(-c.amount).replace(".", ",")}`).includes(needle)));
  }, [view.charges, q, account, category, onlyPicked, picked]);
  const shown = rows.slice(0, 500);
  const allShownPicked = shown.length > 0 && shown.every((c) => picked.has(c.id));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleShown = () => setPicked((s) => { const n = new Set(s); for (const c of shown) { if (allShownPicked) n.delete(c.id); else n.add(c.id); } return n; });

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await fapi("package", { id: pack?.id, name, txIds: [...picked] });
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
      width="max-w-5xl"
      title={pack ? "Editar paquete" : "Nuevo paquete"}
      subtitle="Ponle un nombre y marca los cargos que entran en él."
      footer={
        <>
          <span className="mr-auto text-sm text-slate-500">{picked.size} {picked.size === 1 ? "cargo marcado" : "cargos marcados"}</span>
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
                <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={allShownPicked} onChange={toggleShown} aria-label="Marcar todos los visibles" className="h-4 w-4 rounded border-slate-300" /></th>
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5">Concepto</th>
                <th className="hidden px-3 py-2.5 md:table-cell">Cuenta</th>
                <th className="hidden px-3 py-2.5 md:table-cell">Categoría</th>
                <th className="px-3 py-2.5 text-right">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {shown.map((c) => (
                <tr key={c.id} onClick={() => toggle(c.id)} className={`cursor-pointer ${picked.has(c.id) ? "bg-blue-50/60" : "hover:bg-slate-50"}`}>
                  <td className="px-3 py-2"><input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 rounded border-slate-300" /></td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{shortDay(c.date)}</td>
                  <td className="max-w-0 px-3 py-2"><span className="block truncate text-slate-900" title={c.detail}>{c.description}</span></td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-slate-500 md:table-cell">{accName.get(c.accountId) ?? "—"}</td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-slate-500 md:table-cell">{categoryLabel(c.category)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{eur(-c.amount, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-10 text-center text-slate-400">No hay cargos con estos filtros.</p>}
          {rows.length > shown.length && <p className="py-3 text-center text-xs text-slate-400">Se muestran 500 de {rows.length}. Afina la búsqueda para ver el resto.</p>}
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
                  <span className="block text-xs text-slate-500">{p.txIds.length} {p.txIds.length === 1 ? "cargo" : "cargos"}</span>
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
