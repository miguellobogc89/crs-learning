// components/academy/learning-room/interactions/quick-quiz.tsx


"use client";

import { useState } from "react";
import {
  Check,
  CheckCircle2,
  CircleHelp,
  RotateCcw,
} from "lucide-react";
import type { InteractionProps } from "./types";

export function QuickQuiz({
  data,
  onComplete,
  completed = false,
}: InteractionProps) {
  const [selected, setSelected] = useState<string | null>(
    null
  );
  const [checked, setChecked] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const options = data.options ?? [];
  const option = options.find(
    (item) => item.id === selected
  );

  const maxAttempts = Math.max(1, data.maxAttempts ?? 3);
  const exhausted = attempts >= maxAttempts;

  // El generador separa el caso y la pregunta
  // mediante dos saltos de línea.
  const parts = data.instruction
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  const question = parts.length > 1
    ? parts[parts.length - 1]
    : data.instruction;

  const scenario = parts.length > 1
    ? parts.slice(0, -1).join("\n\n")
    : null;

  function verify() {
    if (!option || checked || completed) return;

    setChecked(true);
    setAttempts((previous) => previous + 1);

    onComplete({
      correct: option.isPreferred === true,
      score: option.isPreferred ? 100 : 0,
    });
  }

  function retry() {
    setSelected(null);
    setChecked(false);
  }

  return (
    <div className="space-y-5">
      {scenario && (
        <div className="rounded-xl bg-[#F7F5FC] px-5 py-4">
          <p className="whitespace-pre-line text-sm leading-7 text-[#44435C]">
            {scenario}
          </p>
        </div>
      )}

      <h3 className="text-base font-bold leading-7 text-[#17203C]">
        {question}
      </h3>

      <div
        role="radiogroup"
        aria-label={question}
        className="divide-y divide-[#EFEDF5]"
      >
        {options.map((item, index) => {
          const active = selected === item.id;
          const right =
            checked && active && item.isPreferred;
          const wrong =
            checked && active && !item.isPreferred;

          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={checked || completed}
              onClick={() => setSelected(item.id)}
              className={[
                "flex w-full items-start gap-4 px-2 py-4 text-left",
                "transition-colors",
                "focus-visible:outline-2 focus-visible:outline-[#8172BC]",
                !checked &&
                  !completed &&
                  "hover:bg-[#FAF9FD]",
                "disabled:cursor-default",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span
                className={[
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  right
                    ? "bg-emerald-100 text-emerald-700"
                    : wrong
                      ? "bg-amber-100 text-amber-700"
                      : active
                        ? "bg-[#7566B8] text-white"
                        : "bg-[#F2F0F8] text-[#8172BC]",
                ].join(" ")}
              >
                {right ? (
                  <Check className="h-4 w-4" />
                ) : (
                  String.fromCharCode(65 + index)
                )}
              </span>

              <span
                className={[
                  "min-w-0 flex-1 pt-1 text-sm leading-6",
                  active
                    ? "font-semibold text-[#4F438D]"
                    : "font-medium text-[#34405B]",
                ].join(" ")}
              >
                {item.label}
              </span>

              <span
                aria-hidden="true"
                className={[
                  "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px]",
                  active
                    ? "border-[#7566B8]"
                    : "border-[#CBC8D8]",
                ].join(" ")}
              >
                {active && (
                  <span className="h-2.5 w-2.5 rounded-full bg-[#7566B8]" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {!checked && !completed && (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={!selected}
            onClick={verify}
            className="rounded-xl bg-[#7566B8] px-6 py-3 text-sm font-semibold text-white hover:bg-[#6655AA] disabled:opacity-40"
          >
            Comprobar respuesta
          </button>

          <span className="text-xs text-slate-400">
            Selecciona una alternativa
          </span>
        </div>
      )}

      {checked && option && (
        <div
          className={[
            "rounded-2xl p-5",
            option.isPreferred
              ? "bg-[#EDF8F2]"
              : "bg-[#FFF7ED]",
          ].join(" ")}
        >
          <div className="flex items-center gap-2">
            {option.isPreferred ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <CircleHelp className="h-5 w-5 text-amber-600" />
            )}

            <p className="text-sm font-bold text-[#17203C]">
              {option.isPreferred
                ? "¡Bien resuelto!"
                : "Analicemos tu respuesta"}
            </p>
          </div>

          <p className="mt-3 text-sm leading-7 text-[#34405B]">
            {option.feedback ||
              option.consequence ||
              "Revisa los conceptos de la lección."}
          </p>

          {option.isPreferred && data.debrief && (
            <p className="mt-3 text-sm leading-7 text-[#536078]">
              {data.debrief}
            </p>
          )}

          {!option.isPreferred && !exhausted && (
            <button
              type="button"
              onClick={retry}
              className="mt-5 flex items-center gap-2 text-sm font-semibold text-[#7566B8]"
            >
              <RotateCcw className="h-4 w-4" />
              Volver a intentarlo ({maxAttempts - attempts} restantes)
            </button>
          )}

          {!option.isPreferred && exhausted && (
            <p className="mt-4 text-sm text-amber-800">
              Has agotado los intentos. Puedes repasar
              el contenido y volver a practicar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
