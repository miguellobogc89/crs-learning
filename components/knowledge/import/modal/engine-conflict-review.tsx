"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";

type Value = string | number | boolean | null;
type Row = { localId: string; entityKey: string; action: string; reason: string; existingId?: string; existingValues?: Record<string, unknown> };
type Candidate = { localId: string; values: Record<string, Value>; evidence: string };
export type Decision = { kind: "keep" | "incoming" | "omit"; note: string };

const readable = (value: unknown) => value === null || value === undefined || value === "" ? "Sin indicar" : String(value);
const label = (field: string) => field.replace(/_/g, " ");
export function EngineConflictReview({ fileId, rows, candidates, blockers, answers, onAnswersChange }: {
  fileId: string; rows: Row[]; candidates: Candidate[]; blockers: string[];
  answers: Record<string, Decision>; onAnswersChange: (next: Record<string, Decision>) => void;
}) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const pending = rows.filter(row => row.action === "review" || row.action === "extend");
  useEffect(() => { setIndex(0); setLeaving(false); }, [fileId]);
  if (!pending.length) return null;
  const currentIndex = Math.min(index, pending.length - 1);
  const row = pending[currentIndex];
  const candidate = candidates.find(item => item.localId === row.localId);
  const answer = answers[row.localId];
  const identity = candidate?.values.codigo_cliente ?? candidate?.values.referencia ?? candidate?.values.nombre ?? "";
  const title = label(row.entityKey);
  const fields = row.reason.startsWith("Conflicto en:")
    ? row.reason.slice("Conflicto en:".length).split(",").map(field => field.trim())
    : row.action === "extend"
      ? Object.keys(candidate?.values ?? {}).filter(field => candidate?.values[field] !== null &&
          candidate?.values[field] !== undefined && (row.existingValues?.[field] === null || row.existingValues?.[field] === undefined))
      : [];
  const changed = fields.map(field => ({ field, old: row.existingValues?.[field], incoming: candidate?.values[field] }))
    .filter(item => item.incoming !== undefined);
  const known = Boolean(row.existingId && row.existingValues && changed.length);
  const canUseExisting = known && (row.reason.startsWith("Conflicto en:") || row.action === "extend");
  const options: Array<{ kind: Decision["kind"]; title: string; description: string }> = [
    ...(canUseExisting ? [{ kind: "keep" as const, title: "Dejarlo como estaba", description: "Mantener los valores que ya tienes guardados." }] : []),
    ...(canUseExisting ? [{ kind: "incoming" as const, title: "Cambiarlo por el nuevo", description: "Guardar los valores del documento y conservar un historial." }] : []),
    ...(!canUseExisting ? [{ kind: "omit" as const, title: "No añadir este registro", description: "Dejarlo fuera de esta importación." }] : []),
  ];
  const resolved = pending.filter(item => Boolean(answers[item.localId])).length;
  function navigate(next: number) {
    if (leaving || next < 0 || next >= pending.length) return;
    setLeaving(true);
    window.setTimeout(() => { setIndex(next); setLeaving(false); }, 230);
  }
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
      <div className={`space-y-5 transition-all duration-[230ms] ease-in-out ${leaving ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"}`}>
        <div className="rounded-2xl bg-slate-50 px-5 py-6 text-center">
          <p className="text-base font-medium leading-7 text-slate-900">
            {known ? `Hemos encontrado información diferente sobre ${title}${identity ? ` «${identity}»` : ""}. ¿Qué valores quieres guardar?`
              : `No hemos podido comprobar los datos de ${title}${identity ? ` «${identity}»` : ""}. Puedes dejarlo fuera de esta importación.`}
          </p>
          {known ? <div className="mt-5 space-y-3 text-left">
            {changed.map(item => <div key={item.field} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-center text-xs font-semibold capitalize text-slate-600">{label(item.field)}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-100 px-3 py-3"><p className="text-[11px] text-slate-500">Valor guardado</p><p className="mt-1 break-words text-sm font-bold text-slate-900">{readable(item.old)}</p></div>
                <div className="rounded-lg bg-blue-50 px-3 py-3"><p className="text-[11px] text-blue-600">Nuevo documento</p><p className="mt-1 break-words text-sm font-bold text-slate-900">{readable(item.incoming)}</p></div>
              </div>
            </div>)}
          </div> : <p className="mt-3 text-xs text-slate-500">{row.reason}</p>}
        </div>
        <div role="radiogroup" aria-label="Elige una respuesta" className="space-y-2">
          {options.map(option => <button key={option.kind} type="button" role="radio" aria-checked={answer?.kind === option.kind}
            onClick={() => onAnswersChange({ ...answers, [row.localId]: { kind: option.kind, note: "" } })}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${answer?.kind === option.kind ? "border-[#0A58FF] bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"}`}>
            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${answer?.kind === option.kind ? "border-[#0A58FF] bg-[#0A58FF] text-white" : "border-slate-300"}`}>
              {answer?.kind === option.kind ? <Check className="size-3" /> : null}
            </span>
            <span><span className="block text-sm font-semibold text-slate-900">{option.title}</span><span className="mt-0.5 block text-xs text-slate-500">{option.description}</span></span>
          </button>)}
        </div>
        <div className="flex items-center justify-between gap-3">
          <button type="button" disabled={currentIndex === 0 || leaving} onClick={() => navigate(currentIndex - 1)}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-30"><ArrowLeft className="size-4" /> Anterior</button>
          {currentIndex < pending.length - 1 ? <button type="button" disabled={!answer || leaving} onClick={() => navigate(currentIndex + 1)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0A58FF] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Siguiente <ArrowRight className="size-4" /></button>
            : <span className="text-xs font-medium text-slate-500">{resolved === pending.length ? "Todas las decisiones registradas" : "Elige una opción para continuar"}</span>}
        </div>
      </div>
      <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-500"><ShieldCheck className="size-4" /> Tranquilo, podrás editar los datos en cualquier momento.</p>
      {blockers.filter(blocker => !blocker.startsWith("Valores contradictorios:") &&
        !blocker.startsWith("Actualización de registro pendiente de aprobación:") &&
        !blocker.startsWith("Vínculo pendiente:")).map((blocker, i) =>
        <p key={i} role="alert" className="text-xs text-amber-700">{blocker}</p>)}
    </section>
  );
}
