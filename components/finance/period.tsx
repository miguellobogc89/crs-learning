"use client";
// components/finance/period.tsx
// Periodo y cuentas visibles: un solo ajuste para Inicio y Movimientos que se guarda en el servidor
// (vale para la próxima visita y en cualquier dispositivo). Mismo botón que la cabecera de las tablas.
import { useState } from "react";
import { CalendarRange, Check, ChevronDown, Loader2 } from "lucide-react";
import type { ViewPref } from "@/lib/finance/logic";
import { field, ghost, primary } from "@/components/trading/format";
import { ErrorNote, Modal } from "@/components/trading/ui";
import { toolbarButton } from "@/components/ui/table-toolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorText, fapi, refreshFinance } from "./api";

/** Guarda el periodo y avisa a las pantallas para que recarguen. */
export async function saveView(view: ViewPref) {
  await fapi("view", view);
  refreshFinance();
}

export function PeriodPicker({ view, label, className = "" }: { view: ViewPref; label: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(false);
  const unitWord = view.unit === "mes" ? "mes" : "ciclo";
  const set = async (patch: Partial<ViewPref>) => {
    setBusy(true);
    try {
      await saveView({ ...view, ...patch, ...(patch.range && patch.range !== "custom" ? { from: null, to: null } : {}) });
    } finally {
      setBusy(false);
    }
  };
  const ranges: { value: ViewPref["range"]; label: string }[] = [
    { value: "actual", label: `Este ${unitWord}` },
    { value: "anterior", label: `${unitWord === "mes" ? "Mes" : "Ciclo"} anterior` },
    { value: "3", label: `Últimos 3 ${unitWord === "mes" ? "meses" : "ciclos"}` },
    { value: "6", label: `Últimos 6 ${unitWord === "mes" ? "meses" : "ciclos"}` },
    { value: "12", label: `Últimos 12 ${unitWord === "mes" ? "meses" : "ciclos"}` },
    { value: "anio", label: "Este año" },
    { value: "todo", label: "Todo el historial" },
  ];
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={`${toolbarButton} max-w-full justify-between ${className}`} title={`Periodo: ${label}`} aria-label={`Periodo: ${label}`}>
            <span className="flex min-w-0 items-center gap-2">
              {busy ? <Loader2 className="size-icon-md animate-spin" /> : <CalendarRange className="size-icon-md" />}
              <span className="truncate">{label}</span>
            </span>
            <ChevronDown className="size-icon-md shrink-0 text-slate-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-caption text-muted-foreground">Contar por</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={view.unit} onValueChange={(v) => void set({ unit: v as ViewPref["unit"] })}>
            <DropdownMenuRadioItem value="ciclo">Ciclo de nómina</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="mes">Mes natural</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-caption text-muted-foreground">Periodo</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={view.range} onValueChange={(v) => v !== "custom" && void set({ range: v as ViewPref["range"] })}>
            {ranges.map((r) => (
              <DropdownMenuRadioItem key={r.value} value={r.value}>{r.label}</DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCustom(true)}>
            {view.range === "custom" ? <Check className="mr-2 size-icon-md" /> : <CalendarRange className="mr-2 size-icon-md" />}
            Elegir fechas…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CustomRange open={custom} view={view} onClose={() => setCustom(false)} />
    </>
  );
}

function CustomRange({ open, view, onClose }: { open: boolean; view: ViewPref; onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(view.from ?? `${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(view.to ?? today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const apply = async () => {
    if (!from || !to) return setErr("Pon las dos fechas");
    setBusy(true);
    setErr(null);
    try {
      await saveView({ ...view, range: "custom", from, to });
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
      title="Elegir fechas"
      subtitle={`Se agrupa por ${view.unit === "mes" ? "mes natural" : "ciclo de nómina"}; puedes cambiarlo en el mismo menú.`}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghost}>Cancelar</button>
          <button type="button" onClick={() => void apply()} disabled={busy} className={primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Aplicar</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="block">
          <span className="mb-1.5 block font-medium text-slate-800">Desde</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} w-full`} />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-medium text-slate-800">Hasta</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${field} w-full`} />
        </label>
      </div>
      {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
    </Modal>
  );
}

export type AccountChip = { id: string; name: string; bank: string | null; last4: string | null; hidden: boolean; balance?: number | null };

/** Cuentas que entran en los números: un toque para quitar o poner cada una (se guarda). */
export function AccountChips({ accounts, view }: { accounts: AccountChip[]; view: ViewPref }) {
  const [pending, setPending] = useState<string | null>(null);
  if (accounts.length < 2) return null;
  const toggle = async (id: string) => {
    const hidden = new Set(view.hiddenAccounts);
    if (hidden.has(id)) hidden.delete(id);
    else {
      // Siempre queda al menos una cuenta visible.
      if (accounts.filter((a) => !hidden.has(a.id)).length <= 1) return;
      hidden.add(id);
    }
    setPending(id);
    try {
      await saveView({ ...view, hiddenAccounts: [...hidden] });
    } finally {
      setPending(null);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Cuentas incluidas">
      {accounts.map((a) => {
        const on = !a.hidden;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => void toggle(a.id)}
            aria-pressed={on}
            title={on ? "Quitar de los números" : "Incluir en los números"}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${on ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
          >
            {pending === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : on ? <Check className="h-3.5 w-3.5" /> : null}
            {a.name}
          </button>
        );
      })}
    </div>
  );
}
