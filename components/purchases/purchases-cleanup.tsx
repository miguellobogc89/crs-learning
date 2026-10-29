"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";

/** Above «Productos comprados»: the lines whose own figures prove they were misread, fixed with one click. */
export function PurchasesCleanup({ summary, canEdit }: { summary: { total: number; descuentos: number; envases: number; cantidades: number }; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  if (!summary.total && !result) return null;
  const parts = [summary.descuentos && `${summary.descuentos.toLocaleString("es-ES")} con el descuento en %`, summary.envases && `${summary.envases.toLocaleString("es-ES")} con envases y su contenido`,
    summary.cantidades && `${summary.cantidades.toLocaleString("es-ES")} con la cantidad mal leída`].filter(Boolean);
  async function run() {
    setBusy(true); setResult(null);
    const r = await fetch("/api/purchases/cleanup", { method: "POST" });
    const d = await r.json().catch(() => null) as { corregidas?: number; error?: string } | null;
    setBusy(false);
    setResult(r.ok ? `Listo: ${(d?.corregidas ?? 0).toLocaleString("es-ES")} compras corregidas.` : d?.error ?? "No se pudo completar.");
    router.refresh();
  }
  return <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-[#0A58FF]/20 bg-[#0A58FF]/[0.04] px-4 py-3 text-sm">
    <Wand2 className="size-4 shrink-0 text-[#0A58FF]" />
    <p className="min-w-0 flex-1 text-slate-700">{result ?? <>
      <span className="font-semibold text-slate-900">{summary.total.toLocaleString("es-ES")} compras se leyeron mal y sus propias cifras lo demuestran</span>: {parts.join(", ")}. Lo leído antes queda en el historial.</>}</p>
    {canEdit && !result && <button type="button" disabled={busy} onClick={() => { void run(); }}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0A58FF] px-3.5 text-sm font-medium text-white hover:bg-[#0848d6] disabled:opacity-50">
      {busy && <Loader2 className="size-4 animate-spin" />}Corregir</button>}
  </div>;
}
