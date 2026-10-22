"use client";
import { useState } from "react";
import type { IdentityQuestion } from "@/lib/engine/ingestion/suggest-identity-questions";

export type IdentityAnswer = "same" | "different" | "unsure";
export function EngineIdentityReview({ questions, answers, onAnswersChange }: {
  questions: IdentityQuestion[];
  answers: Record<string, IdentityAnswer>;
  onAnswersChange: (answers: Record<string, IdentityAnswer>) => void;
}) {
  const [index, setIndex] = useState(0);
  if (!questions.length) return null;
  const current = questions[Math.min(index, questions.length - 1)];
  const choices: Array<{ key: IdentityAnswer; text: string }> = [
    { key: "same", text: "Sí, son la misma entidad" },
    { key: "different", text: "No, son diferentes" },
    { key: "unsure", text: "No estoy seguro" },
  ];
  return <section className="mx-auto max-w-2xl space-y-4 py-4">
    <div className="text-center">
      <p className="text-xs font-bold uppercase text-blue-600">Confirmar identidades</p>
      <h3 className="mt-2 text-lg font-bold">Pregunta {index + 1} de {questions.length}</h3>
    </div>
    <div key={current.id} className="animate-in fade-in duration-300 rounded-xl bg-slate-50 p-5">
      <p className="text-center text-base font-semibold">{current.question}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[{ name: current.leftName, evidence: current.leftEvidence }, { name: current.rightName, evidence: current.rightEvidence }].map((item, i) =>
          <div key={i} className="min-w-0 rounded-lg bg-white p-3">
            <p className="break-words text-sm font-bold">{item.name}</p>
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-xs text-slate-500">{item.evidence}</p>
          </div>)}
      </div>
    </div>
    <div className="space-y-2">
      {choices.map(choice => <button key={choice.key} type="button"
        onClick={() => onAnswersChange({ ...answers, [current.id]: choice.key })}
        className={`block w-full rounded-xl border p-3 text-left text-sm font-medium ${answers[current.id] === choice.key ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
        {choice.text}
      </button>)}
    </div>
    <div className="flex justify-between">
      <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)} className="px-3 py-2 text-sm disabled:opacity-30">Anterior</button>
      {index < questions.length - 1 ? <button type="button" disabled={!answers[current.id]} onClick={() => setIndex(index + 1)}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">Siguiente</button> : null}
    </div>
    <p className="text-center text-xs text-amber-700">Revisión previa: estas respuestas todavía no modifican registros. La inserción permanece bloqueada.</p>
  </section>;
}
