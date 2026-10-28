"use client";
import { useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, Eye, EyeOff, Loader2, RotateCcw, Settings2 } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { groupable } from "@/lib/analytics/table-view";
import { cn } from "@/lib/utils";
import { useSharedTableView } from "./table-view-context";

/** «Ajustes» in the header of a table: columns to show and grouping. Saved for this person. */
export function TableSettingsButton() {
  const ctx = useSharedTableView();
  const [open, setOpen] = useState(false);
  if (!ctx) return null;
  const { columns, view, update, reset, saving, error } = ctx;
  const hidden = new Set(view.hidden);
  const shown = columns.length - columns.filter(c => hidden.has(c.key)).length;
  const toggle = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else if (shown > 1) next.add(key);
    update({ hidden: [...next] });
  };
  const changed = view.hidden.length > 0 || !!view.groupBy;

  return <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
    <PopoverPrimitive.Trigger asChild>
      <button type="button" aria-label="Ajustes de la tabla"
        className={cn("inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-medium shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors",
          open ? "border-[#0A58FF] text-[#0A58FF]" : "border-slate-200 text-slate-700 hover:border-slate-300 hover:text-slate-900")}>
        <Settings2 className="size-4" />Ajustes
        {changed && <span className="size-1.5 rounded-full bg-[#0A58FF]" aria-label="Vista personalizada" />}
      </button>
    </PopoverPrimitive.Trigger>
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align="end" sideOffset={8}
        className="z-50 w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] outline-none">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Ajustes de la tabla</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            {saving ? <><Loader2 className="size-3 animate-spin" />Guardando…</> : error ? <span className="text-rose-600">{error}</span> : <><Check className="size-3 text-emerald-600" />Se guarda para ti</>}
          </p>
        </div>

        <div className="space-y-1.5 border-b border-slate-100 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Agrupar por</p>
          <Combobox className="h-9 w-full" ariaLabel="Agrupar por" value={view.groupBy ?? ""}
            options={[{ value: "", label: "Sin agrupar" }, ...columns.filter(groupable).map(c => ({ value: c.key, label: c.label }))]}
            onChange={v => update({ groupBy: v || null })} />
        </div>

        <div className="px-2 py-2">
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Columnas <span className="font-medium normal-case tracking-normal text-slate-400">· {shown} de {columns.length}</span></p>
            {view.hidden.length > 0 && <button type="button" onClick={() => update({ hidden: [] })} className="text-xs font-medium text-[#0A58FF] hover:underline">Mostrar todas</button>}
          </div>
          <ul className="max-h-[300px] overflow-y-auto">
            {columns.map(c => {
              const on = !hidden.has(c.key);
              const last = on && shown === 1;
              return <li key={c.key}><button type="button" disabled={last} onClick={() => toggle(c.key)} title={last ? "Debe quedar al menos una columna" : undefined}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border transition-colors", on ? "border-[#0A58FF] bg-[#0A58FF] text-white" : "border-slate-300 bg-white")}>
                  {on && <Check className="size-3" strokeWidth={3} />}</span>
                <span className={cn("min-w-0 flex-1 truncate", on ? "text-slate-800" : "text-slate-400")}>{c.label}</span>
                {on ? <Eye className="size-3.5 text-slate-300" /> : <EyeOff className="size-3.5 text-slate-300" />}
              </button></li>;
            })}
          </ul>
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
          <button type="button" disabled={!changed && !view.sort && view.pageSize === 25} onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-40">
            <RotateCcw className="size-3.5" />Restablecer vista</button>
        </div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>;
}
