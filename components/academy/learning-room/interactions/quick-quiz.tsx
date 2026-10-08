
"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { tones, type InteractionProps } from "./types";

export function QuickQuiz({
  data,
  onComplete,
  completed = false,
}: InteractionProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const options = data.options ?? [];
  const option = options.find((x) => x.id === selected);
  const maxAttempts = Math.max(1, data.maxAttempts ?? 3);
  const exhausted = attempts >= maxAttempts;

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
    <div>
      <p className="mb-5 text-base font-semibold">
        {data.instruction}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((item, index) => (
          <button
            key={item.id}
            type="button"
            disabled={checked || completed}
            onClick={() => setSelected(item.id)}
            className={[
              "min-h-28 rounded-[24px] p-5 text-left text-sm transition",
              tones[index % tones.length],
              selected === item.id
                ? "ring-2 ring-violet-600"
                : "hover:-translate-y-0.5",
              "disabled:cursor-default",
            ].join(" ")}
          >
            <span className="mb-3 block text-xs font-bold">
              {String.fromCharCode(65 + index)}
            </span>
            {item.label}
          </button>
        ))}
      </div>

      {!checked && !completed && (
        <button
          type="button"
          disabled={!selected}
          onClick={verify}
          className="mt-5 rounded-xl bg-[#7566B8] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          Comprobar respuesta
        </button>
      )}

      {checked && option && (
        <div className="mt-5 rounded-2xl bg-[#F2F0FA] p-5">
          <p className="font-bold">
            {option.isPreferred
              ? "¡Correcto!"
              : "Vamos a revisar tu respuesta"}
          </p>

          <p className="mt-3 text-sm leading-6">
            {option.feedback || option.consequence}
          </p>

          {!option.isPreferred && !exhausted && (
            <button
              type="button"
              onClick={retry}
              className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#7566B8]"
            >
              <RotateCcw className="h-4 w-4" />
              Reintentar ({maxAttempts - attempts} restantes)
            </button>
          )}

          {!option.isPreferred && exhausted && (
            <p className="mt-4 text-sm text-amber-700">
              Has agotado los intentos. Revisa el contenido
              y vuelve a esta pantalla para practicar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
