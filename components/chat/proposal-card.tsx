"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, Loader2, RotateCcw, Wand2, X } from "lucide-react";
import type { Proposal } from "@/lib/assistant/changes/service";
import type { CellValue } from "@/lib/analytics/compute";
import { fmtDate, fmtMoney, fmtNumber } from "@/components/analytics/format";
import { cn } from "@/lib/utils";

export type ProposalView = Omit<Proposal, "undo" | "operaciones">;

const STATE: Record<ProposalView["estado"], { label: string; chip: string }> = {
  pendiente: { label: "Pendiente de aplicar", chip: "bg-amber-50 text-amber-700" },
  aplicada: { label: "Aplicada", chip: "bg-emerald-50 text-emerald-700" },
  descartada: { label: "Descartada", chip: "bg-slate-100 text-slate-500" },
  deshecha: { label: "Deshecha", chip: "bg-slate-100 text-slate-500" },
  error: { label: "No se pudo aplicar", chip: "bg-rose-50 text-rose-700" },
};

function cell(value: CellValue, kind?: string) {
  if (value === null || value === undefined || value === "") return <span className="text-slate-300">—</span>;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (kind === "money" && typeof value === "number") return fmtMoney(value);
  if (typeof value === "number") return fmtNumber(value);
  if (kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return fmtDate(value);
  return String(value);
}

function figures(c: ProposalView["cifras"]) {
  const n = (v: number, one: string, many: string) => v ? `${v.toLocaleString("es-ES")} ${v === 1 ? one : many}` : null;
  return [n(c.tablas, "tabla nueva", "tablas nuevas"), n(c.columnas, "columna", "columnas"), n(c.filas_nuevas, "fila nueva", "filas nuevas"),
    n(c.filas_cambiadas, "fila cambiada", "filas cambiadas"), n(c.enlaces, "enlace", "enlaces"), n(c.filas_borradas, "fila borrada", "filas borradas")].filter(Boolean) as string[];
}

/**
 * A change the assistant proposed: what it will do (steps, figures, warnings and a sample of each step), and the
 * person's decision. Nothing changes until «Aplicar»; once applied it can be undone.
 */
export function ProposalCard({ messageId, proposal: initial }: { messageId: string; proposal: ProposalView }) {
  const router = useRouter();
  const [proposal, setProposal] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const state = STATE[proposal.estado] ?? STATE.pendiente;

  async function decide(accion: "aplicar" | "descartar" | "deshacer") {
    setBusy(accion); setError(null);
    try {
      const r = await fetch("/api/assistant/proposals", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, proposalId: proposal.id, accion }) });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error ?? "No se pudo completar.");
      setProposal(json.proposal);
      if (accion !== "descartar") router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  const tables = proposal.tablas.filter(t => t.startsWith("tabla:") || t.startsWith("plantilla:") || ["facturas", "compras", "empresas", "suministros"].includes(t));
  return <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0A58FF]/10 text-[#0A58FF]"><Wand2 className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{proposal.titulo}</p>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", state.chip)}>{state.label}</span>
        </div>
        {proposal.explicacion && <p className="mt-0.5 text-xs text-slate-500">{proposal.explicacion}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {figures(proposal.cifras).map(f => <span key={f} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">{f}</span>)}
        </div>
      </div>
    </div>

    <ol className="divide-y divide-slate-100">
      {proposal.pasos.map((p, i) => <li key={i} className="px-4 py-2.5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-800">{p.texto}</p>
            {p.avisos.map((a, j) => <p key={j} className="mt-1 flex items-start gap-1 text-[11px] text-amber-700"><AlertTriangle className="mt-px size-3 shrink-0" />{a}</p>)}
            {p.muestra && <button type="button" onClick={() => setOpen(open === i ? null : i)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#0A58FF] hover:underline">
              <ChevronDown className={cn("size-3 transition-transform", open !== i && "-rotate-90")} />{open === i ? "Ocultar ejemplo" : "Ver ejemplo"}</button>}
            {open === i && p.muestra && <div className="mt-2 overflow-auto rounded-lg border border-slate-100">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-500"><tr>{p.muestra.columnas.map(c => <th key={c.key} className="whitespace-nowrap px-2 py-1 text-left font-semibold">{c.label}</th>)}</tr></thead>
                <tbody>{p.muestra.filas.map((r, k) => <tr key={k} className="border-t border-slate-100">{p.muestra!.columnas.map(c =>
                  <td key={c.key} className={cn("whitespace-nowrap px-2 py-1 text-slate-700", (c.kind === "money" || c.kind === "number") && "text-right tabular-nums")}>{cell(r[c.key] ?? null, c.kind)}</td>)}</tr>)}</tbody>
              </table>
            </div>}
          </div>
        </div>
      </li>)}
    </ol>

    {(error || proposal.error) && <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error ?? proposal.error}</p>}

    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
      {proposal.estado === "pendiente" && <>
        <button type="button" disabled={!!busy} onClick={() => void decide("aplicar")}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0A58FF] px-3 text-xs font-semibold text-white hover:bg-[#0848d6] disabled:opacity-50">
          {busy === "aplicar" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Aplicar</button>
        <button type="button" disabled={!!busy} onClick={() => void decide("descartar")}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-50"><X className="size-3.5" />Descartar</button>
        <span className="ml-auto text-[11px] text-slate-500">Queda en el historial y se puede deshacer.</span>
      </>}
      {proposal.estado === "aplicada" && <>
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="size-3.5" />Aplicada{proposal.aplicada?.en ? ` el ${new Date(proposal.aplicada.en).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}` : ""}</span>
        {tables.slice(0, 3).map(t => <Link key={t} href={`/analytics?view=tablas&table=${encodeURIComponent(t)}`} className="text-xs font-medium text-[#0A58FF] hover:underline">Ver tabla →</Link>)}
        <button type="button" disabled={!!busy} onClick={() => void decide("deshacer")}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-50">
          {busy === "deshacer" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}Deshacer</button>
      </>}
      {(proposal.estado === "descartada" || proposal.estado === "deshecha" || proposal.estado === "error") &&
        <span className="text-[11px] text-slate-500">{proposal.estado === "error" ? "Pide al asistente que la vuelva a preparar con los datos actuales." : "No se ha cambiado nada en tus datos."}</span>}
    </div>
  </div>;
}
