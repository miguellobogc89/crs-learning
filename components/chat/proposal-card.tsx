"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, Loader2, RotateCcw, Wand2 } from "lucide-react";
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
      // The assistant's follow-up («Hecho… puedes verla aquí… siguiente paso») appears in the open chat.
      if (json.message) window.dispatchEvent(new CustomEvent("crs:assistant-message", { detail: json.message }));
      if (accion !== "descartar") router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  const tables = proposal.tablas.filter(t => t.startsWith("tabla:") || t.startsWith("plantilla:") || ["facturas", "compras", "empresas", "suministros"].includes(t));
  const warnings = proposal.pasos.reduce((n, p) => n + p.avisos.length, 0);
  const pending = (proposal.pendientes ?? []).reduce((n, p) => n + p.filas, 0);
  const closed = proposal.estado === "descartada" || proposal.estado === "deshecha";
  return <div className={cn("mt-2 overflow-hidden rounded-xl border bg-white", closed ? "border-slate-200 opacity-70" : "border-slate-200")}>
    <div className="flex items-start gap-2.5 px-3 py-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#0A58FF]/10 text-[#0A58FF]"><Wand2 className="size-3.5" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[13px] font-semibold text-slate-900">{proposal.titulo}</p>
          {proposal.objetivo && <span className="rounded-full bg-[#0A58FF]/10 px-1.5 py-px text-[10px] font-medium text-[#0A58FF]">Paso {proposal.objetivo.actual} de {proposal.objetivo.pasos.length}</span>}
          {proposal.estado !== "pendiente" && <span className={cn("rounded-full px-1.5 py-px text-[10px] font-medium", state.chip)}>{state.label}</span>}
        </div>
        {proposal.explicacion && <p className="mt-0.5 text-xs leading-5 text-slate-500">{proposal.explicacion}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {figures(proposal.cifras).map(f => <span key={f} className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-medium tabular-nums text-slate-600">{f}</span>)}
          {pending > 0 && !closed && <span className="rounded bg-amber-50 px-1.5 py-px text-[10px] font-medium tabular-nums text-amber-700">{pending.toLocaleString("es-ES")} por completar</span>}
          {warnings > 0 && <span className="rounded bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-700">{warnings} {warnings === 1 ? "aviso" : "avisos"}</span>}
          <button type="button" onClick={() => setOpen(open === null ? -1 : null)} className="inline-flex items-center gap-0.5 px-1 text-[11px] font-medium text-[#0A58FF] hover:underline">
            <ChevronDown className={cn("size-3 transition-transform", open === null && "-rotate-90")} />{open === null ? "Ver detalle" : "Ocultar detalle"}</button>
        </div>
      </div>
    </div>

    {open !== null && <ol className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/40">
      {proposal.pasos.map((p, i) => <li key={i} className="px-3 py-2">
        <p className="text-[11px] text-slate-700"><span className="mr-1 font-semibold text-slate-400">{i + 1}.</span>{p.texto}</p>
        {p.avisos.map((a, j) => <p key={j} className="mt-0.5 flex items-start gap-1 text-[11px] text-amber-700"><AlertTriangle className="mt-px size-3 shrink-0" />{a}</p>)}
        {p.muestra && <div className="mt-1.5 overflow-auto rounded-md border border-slate-100 bg-white">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-500"><tr>{p.muestra.columnas.map(c => <th key={c.key} className="whitespace-nowrap px-2 py-1 text-left font-semibold">{c.label}</th>)}</tr></thead>
            <tbody>{p.muestra.filas.map((r, k) => <tr key={k} className="border-t border-slate-100">{p.muestra!.columnas.map(c =>
              <td key={c.key} className={cn("whitespace-nowrap px-2 py-1 text-slate-700", (c.kind === "money" || c.kind === "number") && "text-right tabular-nums")}>{cell(r[c.key] ?? null, c.kind)}</td>)}</tr>)}</tbody>
          </table>
        </div>}
      </li>)}
    </ol>}

    {(error || proposal.error) && <p className="border-t border-rose-100 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{error ?? proposal.error}</p>}

    {!closed && proposal.estado !== "error" && <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-3 py-2">
      {proposal.estado === "pendiente" && <>
        <button type="button" disabled={!!busy} onClick={() => void decide("aplicar")}
          className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#0A58FF] px-2.5 text-xs font-semibold text-white hover:bg-[#0848d6] disabled:opacity-50">
          {busy === "aplicar" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Sí, créalo</button>
        <button type="button" disabled={!!busy} onClick={() => void decide("descartar")}
          className="inline-flex h-7 items-center rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50">No</button>
        <span className="ml-auto text-[10px] text-slate-400">Se puede deshacer</span>
      </>}
      {proposal.estado === "aplicada" && <>
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="size-3.5" />Hecho</span>
        {tables.slice(0, 2).map(t => <Link key={t} href={`/analytics?view=tablas&table=${encodeURIComponent(t)}`} target="_blank" rel="noopener" className="text-xs font-medium text-[#0A58FF] hover:underline">Ver tabla</Link>)}
        {pending > 0 && proposal.pendientes?.[0] && <Link href={`/analytics?view=tablas&table=${encodeURIComponent(proposal.pendientes[0].tabla)}&pendiente=${encodeURIComponent(proposal.pendientes[0].columna)}`} target="_blank" rel="noopener"
          className="text-xs font-medium text-amber-700 hover:underline">Completar ({pending})</Link>}
        <button type="button" disabled={!!busy} onClick={() => void decide("deshacer")}
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50">
          {busy === "deshacer" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}Deshacer</button>
      </>}
    </div>}
  </div>;
}
