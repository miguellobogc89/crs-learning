"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";

type Row = { localId: string; entityKey: string; action: string; reason: string; existingId?: string };
type Candidate = { localId: string; values: Record<string, string | number | boolean | null>; evidence: string };
export type Decision = { kind: "keep" | "incoming" | "omit"; note: string };

export function EngineConflictReview({ fileId, rows, candidates, blockers, answers, onAnswersChange }: {
  fileId: string; rows: Row[]; candidates: Candidate[]; blockers: string[];
  answers: Record<string, Decision>; onAnswersChange: (next: Record<string, Decision>) => void;
}) {
  const [index, setIndex] = useState(0);
  const pending = rows.filter(row => row.action === "review" || row.action === "extend");
  useEffect(() => { setIndex(0); }, [fileId]);
  if (!pending.length) return null;
  const currentIndex = Math.min(index, pending.length - 1);
  const row = pending[currentIndex];
  const candidate = candidates.find(item => item.localId === row.localId);
  const answer = answers[row.localId];
  const identity = candidate?.values.codigo_cliente ?? candidate?.values.referencia ?? candidate?.values.nombre ?? "";
  const title = row.entityKey.replace(/_/g, " ");
  const fields = row.reason.startsWith("Conflicto en:")
    ? row.reason.slice("Conflicto en:".length).split(",").map(field => field.trim()) : [];
  const changed = fields.map(field => ({ field, value: candidate?.values[field] })).filter(item => item.value !== undefined);
  const simple = changed.length === 1;
  const question = simple
    ? `Ya tenemos un ${title}${identity ? ` (${identity})` : ""} guardado, pero el nuevo documento indica un valor distinto para «${changed[0].field.replace(/_/g, " ")}»: ${changed[0].value}. ¿Qué prefieres hacer?`
    : `Este documento contiene información diferente para ${title}${identity ? ` (${identity})` : ""}. ¿Qué datos quieres conservar?`;
  const canUseExisting = Boolean(row.existingId) && row.reason.startsWith("Conflicto en:");
  const options: Array<{ kind: Decision["kind"]; title: string; description: string }> = [
    ...(canUseExisting ? [{ kind: "keep" as const, title: "Conservar lo que ya tenía", description: "No cambiar los datos guardados." }] : []),
    ...(canUseExisting ? [{ kind: "incoming" as const, title: "Usar los datos del documento", description: "Actualizar el registro y guardar el valor anterior en el historial." }] : []),
    { kind: "omit", title: "No importar este registro", description: "Dejar los datos actuales intactos y no añadir sus nuevas relaciones." },
  ];
  const resolved = pending.filter(item => Boolean(answers[item.localId])).length;
  return (
    <section aria-label="Revisión de diferencias" className="mx-auto max-w-2xl space-y-5 py-3">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#0A58FF]">Necesitamos tu decisión</p>
        <h3 className="mt-2 text-lg font-semibold text-slate-900">Diferencia {currentIndex + 1} de {pending.length}</h3>
        <p className="mt-1 text-xs text-slate-500">{resolved} de {pending.length} resueltas</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[#0A58FF] transition-all" style={{ width: `${(resolved / pending.length) * 100}%` }} />
        </div>
      </div>
      <div className="rounded-2xl bg-slate-50 px-5 py-7 text-center">
        <p className="text-base font-medium leading-7 text-slate-900">{question}</p>
        {candidate && changed.length > 1 ? <p className="mt-2 text-xs text-slate-500">Valores propuestos: {changed.map(item => `${item.field}: ${item.value}`).join(" · ")}</p> : null}
      </div>
      <div role="radiogroup" aria-label="Elige una respuesta" className="space-y-2">
        {options.map(option => (
          <button key={option.kind} type="button" role="radio" aria-checked={answer?.kind === option.kind}
            onClick={() => onAnswersChange({ ...answers, [row.localId]: { kind: option.kind, note: "" } })}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${answer?.kind === option.kind ? "border-[#0A58FF] bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"}`}>
            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${answer?.kind === option.kind ? "border-[#0A58FF] bg-[#0A58FF] text-white" : "border-slate-300"}`}>
              {answer?.kind === option.kind ? <Check className="size-3" /> : null}
            </span>
            <span><span className="block text-sm font-semibold text-slate-900">{option.title}</span><span className="mt-0.5 block text-xs text-slate-500">{option.description}</span></span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" disabled={currentIndex === 0} onClick={() => setIndex(currentIndex - 1)}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-30"><ArrowLeft className="size-4" /> Anterior</button>
        {currentIndex < pending.length - 1 ? <button type="button" disabled={!answer} onClick={() => setIndex(currentIndex + 1)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0A58FF] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Siguiente <ArrowRight className="size-4" /></button>
          : <span className="text-xs font-medium text-slate-500">{resolved === pending.length ? "Todas las decisiones registradas" : "Elige una opción para continuar"}</span>}
      </div>
      <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-500"><ShieldCheck className="size-4" /> Tranquilo, podrás editar los datos en cualquier momento.</p>
      {blockers.filter(blocker => !blocker.startsWith("Valores contradictorios:") &&
        !blocker.startsWith("Actualización de registro pendiente de aprobación:") &&
        !blocker.startsWith("Vínculo pendiente:")).map((blocker, i) =>
        <p key={i} role="alert" className="text-xs text-amber-700">{blocker}</p>)}
    </section>
  );
}
