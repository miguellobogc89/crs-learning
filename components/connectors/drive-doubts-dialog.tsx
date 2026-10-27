"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { collectDoubts, decisionsByBatch, OPCION, resolvedBatches, TIPO, type Decision, type Doubt, type PlanLike } from "./doubts";
import { saveClean, type SaveOutcome } from "./intake-queue";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...init });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
}

/**
 * Every pending question of the batches waiting to be saved, grouped: answered once, applied to all of them.
 * "Aplicar y guardar" saves every batch left without questions (the rest keep waiting). Nothing is saved before.
 */
export function DriveDoubtsDialog({ open, onOpenChange, batchIds, onDone }: {
  open: boolean; onOpenChange: (open: boolean) => void; batchIds: string[]; onDone: (outcome: SaveOutcome) => void;
}) {
  const [plans, setPlans] = useState<{ loteId: string; plan: PlanLike }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Decision>>({});
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPlans(null); setError(null); setAnswers({});
    (async () => {
      const loaded: { loteId: string; plan: PlanLike }[] = [];
      // A few at a time: each plan is built on the server from the batch.
      for (let i = 0; i < batchIds.length; i += 4) {
        const part = await Promise.all(batchIds.slice(i, i + 4).map(async id => {
          const r = await call(`/api/knowledge/intake/${id}/writing`);
          return r.ok && r.json.plan ? { loteId: id, plan: r.json.plan as PlanLike } : null;
        }));
        loaded.push(...part.filter((x): x is { loteId: string; plan: PlanLike } => !!x));
      }
      if (!cancelled) setPlans(loaded);
    })().catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [open, batchIds]);

  const doubts = useMemo(() => plans ? collectDoubts(plans) : [], [plans]);
  const ready = useMemo(() => plans ? resolvedBatches(doubts, answers, plans.map(p => p.loteId)) : [], [doubts, answers, plans]);
  const answered = doubts.filter(d => answers[d.key]).length;

  function answerAll(decision: Decision) {
    setAnswers(prev => ({ ...prev, ...Object.fromEntries(doubts.filter(d => d.opciones.includes(decision) && !prev[d.key]).map(d => [d.key, decision])) }));
  }

  async function apply() {
    setSaving({ done: 0, total: ready.length });
    const outcome = await saveClean(ready, call, done => setSaving({ done, total: ready.length }), decisionsByBatch(doubts, answers));
    setSaving(null);
    onDone(outcome);
    onOpenChange(false);
  }

  return <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next); }}>
    <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
      <div className="border-b border-slate-200 px-6 py-4">
        <DialogTitle className="text-base font-semibold text-slate-900">Resolver dudas</DialogTitle>
        <DialogDescription className="mt-0.5 text-xs text-slate-500">
          Cada pregunta aparece una sola vez aunque se repita en muchos documentos: tu respuesta se aplica a todos. Nada se guarda hasta «Aplicar y guardar».
        </DialogDescription>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 px-6 py-4">
        {error ? <p className="text-sm text-rose-600">{error}</p>
          : !plans ? <p className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />Reuniendo las dudas de {plural(batchIds.length, "lote", "lotes")}…</p>
          : !doubts.length ? <p className="py-10 text-center text-sm text-slate-600">No hay dudas: los {plural(plans.length, "lote se puede", "lotes se pueden")} guardar directamente.</p>
          : <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{plural(doubts.length, "pregunta", "preguntas")} en {plural(new Set(doubts.flatMap(d => d.ocurrencias.map(o => o.loteId))).size, "lote", "lotes")}.</span>
                <span className="ml-auto">Responder las que falten con:</span>
                <button type="button" className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:border-slate-300" onClick={() => answerAll("unir")}>Es la misma</button>
                <button type="button" className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:border-slate-300" onClick={() => answerAll("tal_cual")}>Guardar aparte</button>
              </div>
              {doubts.map(d => <DoubtCard key={d.key} doubt={d} answer={answers[d.key]} onAnswer={a => setAnswers(prev => ({ ...prev, [d.key]: a }))} />)}
            </div>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3">
        <p className="text-xs text-slate-500">
          {saving ? `Guardando ${saving.done} de ${saving.total} lotes…`
            : plans ? `${doubts.length ? `${answered} de ${doubts.length} respondidas · ` : ""}se guardarán ${plural(ready.length, "lote", "lotes")}${plans.length - ready.length ? ` (${plans.length - ready.length} siguen esperando)` : ""}` : ""}
        </p>
        <Button variant="brand" disabled={!plans || !ready.length || !!saving} onClick={apply}>
          {saving ? <><Loader2 className="size-4 animate-spin" />Guardando…</> : `Aplicar y guardar ${plural(ready.length, "lote", "lotes")}`}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

function DoubtCard({ doubt: d, answer, onAnswer }: { doubt: Doubt; answer?: Decision; onAnswer: (a: Decision) => void }) {
  return <section className={cn("rounded-xl border bg-white p-4", answer ? "border-emerald-200" : "border-slate-200")}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{TIPO[d.tipo] ?? d.tipo} «{d.nombre}»{d.clave && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{d.clave}</span>}</p>
        <p className="mt-0.5 text-xs text-amber-700">{d.motivo}</p>
      </div>
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{plural(d.ocurrencias.length, "vez", "veces")}</span>
    </div>
    {d.destino && <p className="mt-2 text-sm text-slate-700">¿Es la misma que <b className="font-semibold">«{d.destino.nombre}»</b>{d.destino.clave ? ` (${d.destino.clave})` : ""}{d.destino.existente ? ", que ya está en tus datos" : ""}?</p>}
    {d.archivos.length > 0 && <details className="mt-1 text-[11px] text-slate-500"><summary className="cursor-pointer">En {plural(d.archivos.length, "documento", "documentos")}</summary>
      <p className="mt-1">{d.archivos.slice(0, 12).join(" · ")}{d.archivos.length > 12 ? ` y ${d.archivos.length - 12} más` : ""}</p></details>}
    <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={`Respuesta para ${d.nombre}`}>
      {d.opciones.map(o => <button key={o} type="button" role="radio" aria-checked={answer === o} onClick={() => onAnswer(o)}
        className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
          answer === o ? "border-[#0A58FF] bg-[#EDF3FF] text-[#0A58FF]" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900")}>
        {!d.destino && o === "tal_cual" ? "Guardar igualmente" : OPCION[o]}</button>)}
    </div>
  </section>;
}
