"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { Proposal } from "@/lib/purchases/agent";

const GROUPS: { kind: Proposal["kind"]; label: string }[] = [
  { kind: "duplicado", label: "Productos duplicados" },
  { kind: "no_producto", label: "No son productos" },
  { kind: "cantidad", label: "Cantidades sospechosas" },
  { kind: "tarifa", label: "Cambios de tarifa de más del 10 %" },
  { kind: "no_cuadra", label: "No cuadran: hace falta el ticket" },
];

/**
 * Above the catalog and «Productos comprados»: what the correction agent needs an owner to decide. Each answer is
 * kept; a proposal answered does not come back.
 */
export function CorrectionAgent({ proposals, canEdit }: { proposals: Proposal[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const pending = proposals.filter(p => !done.has(p.id));
  if (!pending.length) return null;

  async function answer(p: Proposal, decision: "aplicar" | "descartar") {
    setBusy(p.id); setError(null);
    const r = await fetch("/api/purchases/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, decision }) });
    const d = await r.json().catch(() => null) as { error?: string } | null;
    setBusy(null);
    if (!r.ok) { setError(d?.error ?? "No se pudo completar."); return; }
    setDone(prev => new Set(prev).add(p.id));
    startTransition(() => router.refresh());
  }

  const asks = pending.filter(p => p.nivel === "pregunta").length;
  return <section className="border border-slate-200 bg-white">
    <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-slate-50">
      {open ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
      <Bot className="size-4 text-[#0A58FF]" />
      <span className="font-semibold text-slate-900">Agente de corrección</span>
      <span className="text-slate-600">· {pending.length - asks} {pending.length - asks === 1 ? "propuesta" : "propuestas"} para decidir{asks ? ` y ${asks} ${asks === 1 ? "compra" : "compras"} sin cuadrar` : ""}</span>
    </button>
    {open && <div className="border-t border-slate-200">
      {error && <p className="border-b border-slate-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</p>}
      {GROUPS.map(g => {
        const items = pending.filter(p => p.kind === g.kind);
        if (!items.length) return null;
        return <div key={g.kind}>
          <p className="border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label} · {items.length}</p>
          <ul>{items.map(p => <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">{p.titulo}</p>
              <p className="mt-0.5 text-xs text-slate-600">{p.detalle}</p>
            </div>
            {canEdit && <div className="flex shrink-0 items-center gap-2">
              {busy === p.id && <Loader2 className="size-4 animate-spin text-slate-400" />}
              {p.accion && <button type="button" disabled={!!busy} onClick={() => void answer(p, "aplicar")}
                className="border border-[#0A58FF] bg-[#0A58FF] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0848d6] disabled:opacity-50">Aplicar</button>}
              <button type="button" disabled={!!busy} onClick={() => void answer(p, "descartar")}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50">
                {p.kind === "tarifa" ? "Es correcto" : p.accion ? "No" : "Descartar"}</button>
            </div>}
          </li>)}</ul>
        </div>;
      })}
    </div>}
  </section>;
}
