"use client";

import { useState } from "react";

type Row = {
  localId: string;
  entityKey: string;
  action: string;
  reason: string;
  existingId?: string;
};
type Candidate = {
  localId: string;
  values: Record<string, string | number | boolean | null>;
  evidence: string;
};
export type Decision = { kind: "keep" | "incoming" | "omit" | "custom"; note: string };

export function EngineConflictReview({
  fileId,
  rows,
  candidates,
  blockers,
  answers,
  onAnswersChange,
}: {
  fileId: string;
  rows: Row[];
  candidates: Candidate[];
  blockers: string[];
  answers: Record<string, Decision>;
  onAnswersChange: (next: Record<string, Decision>) => void;
}) {
  const setAnswers = onAnswersChange;
  const [expanded, setExpanded] = useState<string | null>(null);
  const pending = rows.filter(row => row.action === "review" || row.action === "extend");
  const resolved = pending.filter(row => Boolean(answers[row.localId])).length;
  if (!pending.length && !blockers.length) return null;
  return (
    <section aria-label="Conflictos de importación" className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">Conflictos pendientes · {pending.length - resolved} de {pending.length}</h4>
        <p className="mt-1 text-xs text-slate-600">Revisa las diferencias antes de insertar. Las respuestas no modifican Engine.</p>
      </div>
      {pending.map(row => {
        const candidate = candidates.find(item => item.localId === row.localId);
        const answer = answers[row.localId];
        const open = expanded === row.localId;
        const fields = row.reason.startsWith("Conflicto en:")
          ? row.reason.slice("Conflicto en:".length).split(",").map(value => value.trim())
          : [];
        return (
          <div key={fileId + ":" + row.localId} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : row.localId)}
              className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-xs">
              <span><strong>{row.entityKey} / {row.localId}</strong><span className="ml-2 text-slate-500">{row.reason}</span></span>
              <span className={answer ? "text-emerald-700" : "text-amber-700"}>{answer ? "Respondido · Editar" : "Revisar"} ▾</span>
            </button>
            {open ? (
              <div className="space-y-3 border-t border-slate-100 p-3 text-xs">
                <p className="font-semibold text-slate-800">
                  {fields.length ? `El documento propone otros valores para ${fields.join(", ")}. ¿Cómo debemos tratar este registro?`
                    : `Este registro requiere revisión (${row.reason}). ¿Cómo debemos proceder?`}
                </p>
                {candidate ? (
                  <div className="space-y-1">
                    <p className="font-medium text-slate-600">Valores del documento</p>
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2">{JSON.stringify(candidate.values, null, 2)}</pre>
                    <p className="font-medium text-slate-600">Evidencia</p>
                    <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{candidate.evidence}</p>
                  </div>
                ) : null}
                <label className="block font-medium text-slate-700" htmlFor={fileId + row.localId}>Decisión</label>
                <select id={fileId + row.localId} value={answer?.kind ?? ""} onChange={event => {
                  const kind = event.target.value as Decision["kind"] | "";
                  setAnswers((() => {
                    const next = { ...current };
                    if (!kind) delete next[row.localId];
                    else next[row.localId] = { kind, note: current[row.localId]?.note ?? "" };
                    return next;
                  })());
                }} className="w-full rounded-md border border-slate-300 bg-white p-2">
                  <option value="">Seleccionar una respuesta</option>
                  <option value="keep">Mantener el registro actual</option>
                  <option value="incoming">Proponer los valores del documento</option>
                  <option value="omit">Omitir este registro y sus vínculos dependientes</option>
                  <option value="custom">Otra respuesta / aclaración</option>
                </select>
                {answer?.kind === "custom" ? (
                  <textarea aria-label="Aclaración del conflicto" value={answer.note}
                    onChange={event => setAnswers({
                      ...answers, [row.localId]: { kind: "custom", note: event.target.value },
                    })}
                    placeholder="Explica cómo debe resolverse" rows={3}
                    className="w-full rounded-md border border-slate-300 p-2" />
                ) : null}
                <p className="text-amber-800">La decisión se aplicará únicamente al confirmar la inserción y tras validar el plan en el servidor.</p>
              </div>
            ) : null}
          </div>
        );
      })}
      {blockers.filter(blocker => !blocker.startsWith("Valores contradictorios:") &&
        !blocker.startsWith("Actualización de registro pendiente de aprobación:") &&
        !blocker.startsWith("Vínculo pendiente:")).map((blocker, index) => (
        <p key={index} className="text-xs text-amber-800">{blocker}</p>
      ))}
      <p className="text-xs text-slate-600">
        {resolved} decisiones provisionales registradas. Se validarán de nuevo en el servidor antes de confirmar la escritura.
      </p>
    </section>
  );
}
