"use client";
// Laboratorio de Plan · detalle de una categoría: entra desde la derecha, con flecha para volver. Solo la lista de
// sus movimientos de este ciclo, sin filtros; al tocar uno se edita con la misma ventana que en Movimientos
// (movement-edit.tsx). Si cambia de categoría, sale de la lista y, al volver, la cifra del grupo ya está al día.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { packagesView } from "@/lib/finance/service";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { shortDay, useFinance } from "./api";
import { EditModal, MovementRowButton, type Item, type List } from "./movement-edit";
import { labCategory, labLabel } from "./lab-categories";

type Packages = Awaited<ReturnType<typeof packagesView>>;

export function LabCategoryPanel({ categoryKey }: { categoryKey: string }) {
  const router = useRouter();
  const list = useFinance<List>("transactions?all=1");
  const plan = useFinance<Packages>("packages");
  const [editing, setEditing] = useState<Item | null>(null);
  const back = () => (window.history.length > 1 ? router.back() : router.push("/finanzas/laboratorio"));

  const error = list.error ?? plan.error;
  const cycle = plan.data?.cycle;
  // Mismos cargos que cuenta el grupo: gastos de cuentas incluidas, en este ciclo y de esta categoría.
  const rows = list.data && cycle
    ? list.data.items
      .filter((t) => !t.excluded && t.kind === "gasto" && t.amount < 0 && t.date >= cycle.start && t.date <= cycle.end
        && labCategory(t.category, t.description, t.counterparty, t.alias) === categoryKey)
      .sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const total = Math.round(rows.reduce((s, t) => s - t.amount, 0) * 100) / 100;

  return (
    <div className="mx-auto max-w-xl animate-in fade-in-0 slide-in-from-right-10 pb-6 duration-200">
      <header className="sticky top-0 z-10 -mx-1 mb-1 flex items-center gap-2 bg-white px-1 py-2">
        <button type="button" onClick={back} aria-label="Volver" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-slate-900">{labLabel(categoryKey)}</h2>
          {cycle && (
            <p className="text-xs text-slate-500">
              {shortDay(cycle.start)} – {shortDay(cycle.end)} · {rows.length} {rows.length === 1 ? "cargo" : "cargos"} · <span className="font-medium tabular-nums text-slate-700">{eur(total, 2)}</span>
            </p>
          )}
        </div>
      </header>

      {error && !list.data ? <ErrorNote>{error}</ErrorNote>
        : !list.data || !cycle ? <SkeletonList rows={6} />
        : rows.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No hay movimientos de esta categoría en este ciclo.</p>
        : (
          <ul className="divide-y divide-slate-100 border-y border-slate-100">
            {rows.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-1 py-3">
                <MovementRowButton t={t} onClick={() => setEditing(t)} />
              </li>
            ))}
          </ul>
        )}
      <EditModal item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
