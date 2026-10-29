"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Question } from "@/lib/purchases/questions";

type Payload = { preguntas: Question[]; total: number; resumen?: { compras: number; corregidas_solas: number; regalos: number } };

/**
 * The only place the person sees the purchase validation: the few lines that could not be fixed automatically, asked
 * one by one in plain words (no tables), with the invoice at hand. Answers are saved apart from the invoice.
 */
export function PurchaseQuestions() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/purchases/questions").then(r => r.ok ? r.json() : null).then((d: Payload | null) => { if (!cancelled && d) setData(d); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const pending = useMemo(() => (data?.preguntas ?? []).filter(q => !skipped.has(q.lineId)), [data, skipped]);
  const current = pending[0];
  if (!data || (!data.total && !answered)) return null;

  async function answer(body: Record<string, unknown>) {
    if (!current) return;
    setBusy(true); setError(null);
    const r = await fetch("/api/purchases/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lineId: current.lineId, ...body }) });
    const d = await r.json().catch(() => null) as (Payload & { error?: string }) | null;
    setBusy(false);
    if (!r.ok || !d) { setError(d?.error ?? "No se pudo guardar."); return; }
    setData(d); setValue(""); setAnswered(n => n + 1);
    router.refresh();
  }
  const typed = Number(value.replace(/\./g, "").replace(",", "."));

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)}
      className="mt-4 flex w-full items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-left transition-colors hover:border-amber-300 hover:bg-amber-50">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
      <span className="min-w-0 flex-1 text-[13px] leading-5 text-slate-700">
        <span className="font-semibold text-slate-900">Tengo {data.total === 1 ? "una pregunta" : `${data.total.toLocaleString("es-ES")} preguntas`} sobre tus facturas.</span>{" "}
        {!!data.resumen?.corregidas_solas && <>El resto lo he arreglado yo ({data.resumen.corregidas_solas.toLocaleString("es-ES")} compras).</>}
        <span className="mt-0.5 block font-medium text-[#0A58FF]">Responder</span>
      </span>
    </button>;
  }

  if (!current) {
    return <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-[13px] leading-5 text-emerald-800">
      <Check className="mr-1 inline size-4" />{pending.length || !data.total ? "¡Listo! No me quedan preguntas. Gracias." : "Has saltado las que quedaban; te las volveré a preguntar más adelante."}
    </div>;
  }

  return <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
      <span>Pregunta {answered + skipped.size + 1} de {answered + data.total}</span>
      <button type="button" onClick={() => setOpen(false)} className="hover:text-slate-700">Cerrar</button>
    </div>
    <p className="mt-1.5 text-[14px] font-semibold leading-5 text-slate-900">{current.titulo}</p>
    <p className="mt-1 text-[13px] leading-5 text-slate-600">{current.detalle}</p>
    {current.documento && <a href={`/api/knowledge/intake/files/${current.documento}`} target="_blank" rel="noreferrer"
      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[#0A58FF] hover:underline"><FileText className="size-3.5" />Ver la factura</a>}
    {!!current.opciones.length && <div className="mt-2.5 flex flex-wrap gap-1.5">
      {current.opciones.map(o => <button key={o.valor} type="button" disabled={busy} onClick={() => { void answer({ [current.pide]: o.valor }); }}
        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-700 hover:border-[#0A58FF]/40 hover:bg-[#0A58FF]/[0.04] disabled:opacity-50">{o.etiqueta}</button>)}
    </div>}
    <form className="mt-2.5 flex items-center gap-1.5" onSubmit={e => { e.preventDefault(); if (typed > 0) void answer({ [current.pide]: typed }); }}>
      <input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder={current.pide === "importe" ? "Importe en €" : current.opciones.length ? "Otra cantidad" : "Cantidad"}
        className="h-8 w-32 rounded-lg border border-slate-200 px-2 text-[13px] outline-none focus:border-[#0A58FF]/50" />
      <button type="submit" disabled={busy || !(typed > 0)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#0A58FF] px-3 text-[13px] font-medium text-white disabled:opacity-40">
        {busy && <Loader2 className="size-3.5 animate-spin" />}Guardar</button>
    </form>
    <div className="mt-2 flex gap-3 text-xs">
      <button type="button" disabled={busy} onClick={() => { void answer({ ignorar: true }); }} className="text-slate-500 hover:text-slate-800">No lo sé</button>
      <button type="button" disabled={busy} onClick={() => setSkipped(s => new Set(s).add(current.lineId))} className={cn("text-slate-500 hover:text-slate-800")}>Saltar</button>
    </div>
    {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
  </div>;
}
