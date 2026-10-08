
"use client";

// components/academy/learning-room/didactic-activity.tsx

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleHelp,
  MessageSquareText,
  RotateCcw,
} from "lucide-react";

import type {
  DidacticActivity as Activity,
} from "@/lib/academy/didactic-package";

type Props = {
  activity: Activity;
  value: string;
  onChange: (value: string) => void;
  reviewed: boolean;
  onReview: () => void;
};

export function DidacticActivity({
  activity,
  value,
  onChange,
  reviewed,
  onReview,
}: Props) {
  const [hintsShown, setHintsShown] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);

  const isDecision =
    activity.kind === "decision" &&
    (activity.options?.length ?? 0) >= 2;

  const selected = activity.options?.find(
    (option) => option.id === value,
  );

  const maxAttempts = Math.max(1, activity.maxAttempts);
  const attemptsRemaining = Math.max(0, maxAttempts - attempts);
  const canRetry =
    isDecision &&
    showFeedback &&
    !selected?.isPreferred &&
    attemptsRemaining > 0;

  useEffect(() => {
    setHintsShown(0);
    setAttempts(0);
    setShowFeedback(false);
  }, [activity]);

  function confirmDecision() {
    if (!selected || showFeedback) return;

    setAttempts((previous) => previous + 1);
    setShowFeedback(true);
    onReview();
  }

  function retryDecision() {
    setShowFeedback(false);
    onChange("");
  }

  return (
    <section className="rounded-3xl border border-[#DEE6F5] bg-white p-5 sm:p-7">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EAF0FF] text-[#315BFF]">
          <MessageSquareText className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-bold">
            Ponlo en práctica
          </h3>
          <p className="text-xs text-slate-500">
            {isDecision
              ? "Toma una decisión y descubre sus consecuencias"
              : "Aplica lo que acabas de aprender"}
          </p>
        </div>
      </div>

      {activity.scenario && (
        <div className="mb-5 rounded-2xl bg-[#F3F6FC] p-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#315BFF]">
            Contexto
          </p>
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
            {activity.scenario}
          </p>
        </div>
      )}

      <p className="text-sm font-semibold leading-7">
        {activity.instruction}
      </p>

      {isDecision ? (
        <div className="mt-5 space-y-3">
          {activity.options?.map((option) => {
            const active = value === option.id;

            return (
              <button
                key={option.id}
                type="button"
                disabled={showFeedback}
                onClick={() => onChange(option.id)}
                className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  active
                    ? "border-[#315BFF] bg-[#EFF4FF]"
                    : "border-slate-200 bg-white hover:border-[#B8CAFF]"
                } disabled:cursor-default`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    active
                      ? "border-[#315BFF] bg-[#315BFF]"
                      : "border-slate-300"
                  }`}
                >
                  {active && (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  )}
                </span>
                <span className="text-sm leading-6">
                  {option.label}
                </span>
              </button>
            );
          })}

          {!showFeedback && (
            <button
              type="button"
              disabled={!selected}
              onClick={confirmDecision}
              className="mt-3 rounded-xl bg-[#315BFF] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Confirmar decisión
            </button>
          )}

          {showFeedback && selected && (
            <div
              className={`mt-5 rounded-2xl border p-5 ${
                selected.isPreferred
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={`h-5 w-5 ${
                    selected.isPreferred
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }`}
                />
                <h4 className="text-sm font-bold">
                  {selected.isPreferred
                    ? "Decisión recomendada"
                    : "Analicemos tu decisión"}
                </h4>
              </div>

              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                Consecuencia
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                {selected.consequence}
              </p>

              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                Explicación
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                {selected.feedback}
              </p>

              {canRetry && (
                <button
                  type="button"
                  onClick={retryDecision}
                  className="mt-5 flex items-center gap-2 text-sm font-semibold text-[#315BFF]"
                >
                  <RotateCcw className="h-4 w-4" />
                  Probar otra alternativa ({attemptsRemaining} restantes)
                </button>
              )}

              {activity.debrief && (
                <p className="mt-5 border-t border-slate-200 pt-4 text-sm leading-7 text-slate-600">
                  {activity.debrief}
                </p>
              )}

              <p className="mt-4 text-xs text-slate-500">
                Feedback formativo, sin calificación ni registro
                de superación.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5">
          <textarea
            value={value}
            disabled={reviewed}
            onChange={(event) => onChange(event.target.value)}
            rows={5}
            placeholder="Escribe tu respuesta..."
            className="w-full resize-y rounded-2xl border border-slate-200 bg-[#F8FAFD] p-4 text-sm leading-7 outline-none focus:border-[#315BFF] disabled:opacity-70"
          />

          {!reviewed ? (
            <button
              type="button"
              disabled={!value.trim()}
              onClick={onReview}
              className="mt-3 rounded-xl bg-[#315BFF] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Registrar respuesta provisional
            </button>
          ) : (
            <div className="mt-4 rounded-xl bg-[#F0F4FF] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#315BFF]">
                <CheckCircle2 className="h-4 w-4" />
                Respuesta registrada en esta sesión
              </p>
              <p className="mt-2 text-xs leading-6 text-slate-600">
                Todavía no ha sido evaluada por el profesor IA.
                Registrar la respuesta no significa superar la actividad.
              </p>
              {activity.debrief && (
                <p className="mt-3 text-sm leading-7 text-slate-700">
                  {activity.debrief}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {hintsShown > 0 && (
        <div className="mt-5 rounded-2xl bg-amber-50 p-4">
          {activity.hints.slice(0, hintsShown).map((hint, index) => (
            <p
              key={index}
              className="mb-2 text-sm leading-7 text-amber-900 last:mb-0"
            >
              {hint}
            </p>
          ))}
        </div>
      )}

      {hintsShown < activity.hints.length && !showFeedback && (
        <button
          type="button"
          onClick={() => setHintsShown((previous) => previous + 1)}
          className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#315BFF]"
        >
          <CircleHelp className="h-4 w-4" />
          Mostrar una pista
        </button>
      )}
    </section>
  );
}
