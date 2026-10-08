
"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { InteractionRenderer } from "./interactions/interaction-renderer";
import type { InteractionData } from "@/lib/academy/interaction-schema";

type Props = {
  data: InteractionData;
  completed: boolean;
  onComplete: () => void;
};

export function AcademyInteraction({
  data,
  completed,
  onComplete,
}: Props) {
  const [result, setResult] = useState<{
    correct: boolean;
    score: number;
  } | null>(null);

  function handleComplete(next: {
    correct: boolean;
    score: number;
  }) {
    setResult(next);

    // El quiz exige acertar.
    // Las demás mecánicas permiten aprender del error
    // después de mostrar su resultado.
    const requiresCorrect = data.kind === "quick-quiz";

    if (!requiresCorrect || next.correct) {
      onComplete();
    }
  }

  return (
    <section className="rounded-[28px] bg-white p-5 shadow-sm sm:p-7">
      <InteractionRenderer
        data={data}
        completed={completed}
        onComplete={handleComplete}
      />

      {completed && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">
            Actividad completada. Puedes continuar.
          </p>
        </div>
      )}

      {!completed &&
        result &&
        data.kind === "quick-quiz" &&
        !result.correct && (
          <p className="mt-4 text-sm text-amber-700">
            Revisa la explicación e inténtalo de nuevo.
          </p>
        )}
    </section>
  );
}
