"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import type { DuplicatedLines } from "@/lib/analytics/compute";
import { removeDuplicatedLinesAction } from "@/app/(app)/analytics/actions";
import { fmtDate, fmtMoney } from "./format";

/** Invoices whose lines were read twice (original + copy): shown, and fixed only when the person confirms. */
export function DuplicateLinesReview({ issues, canEdit }: { issues: DuplicatedLines[]; canEdit: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();
  if (!issues.length && !message) return null;
  async function fix() {
    setBusy(true); setConfirming(false);
    const result = await removeDuplicatedLinesAction({ invoiceIds: issues.map(i => i.invoiceId) });
    setBusy(false);
    setMessage(result.ok ? { ok: true, text: `Corregidas ${result.facturas} facturas: ${result.lineas} líneas repetidas quitadas (quedan archivadas).` } : { ok: false, text: result.error });
    startTransition(() => router.refresh());
  }
  return <section className="rounded-2xl border border-amber-200 bg-amber-50/50 px-5 py-4">
    {message && <p className={"mb-2 text-sm " + (message.ok ? "text-emerald-800" : "text-rose-700")}>{message.text}</p>}
    {issues.length > 0 && <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Copy className="size-4 text-amber-600" />
            {issues.length} {issues.length === 1 ? "factura tiene" : "facturas tienen"} las líneas leídas dos veces</p>
          <p className="mt-0.5 text-xs text-slate-600">Sus líneas suman exactamente el doble de la base: el documento traía el original y la copia. Se quita una de cada pareja (queda archivada, no se borra).</p>
        </div>
        {canEdit && (confirming
          ? <span className="flex items-center gap-2"><span className="text-xs text-slate-600">¿Quitar las copias?</span>
              <button type="button" onClick={() => void fix()} className="rounded-md bg-[#0A58FF] px-3 py-1.5 text-xs font-medium text-white">Sí, quitar</button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-3 py-1.5 text-xs text-slate-500 hover:bg-white">Cancelar</button></span>
          : <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:border-amber-400">
              {busy && <Loader2 className="size-3.5 animate-spin" />}Quitar las copias</button>)}
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-2">
        {issues.map(i => <li key={i.invoiceId} className="truncate">{i.fecha ? fmtDate(i.fecha) : "—"} · {i.emisor ?? "Sin emisor"} · {i.numero ?? "sin número"}: líneas {fmtMoney(i.sumaLineas)} / base {fmtMoney(i.base)}</li>)}
      </ul>
    </>}
  </section>;
}
