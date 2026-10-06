// components/academy/academy-home.tsx

import { ContinueLearningCard } from "@/components/academy/academy-home/continue-learning-card";
import type { AcademyHomeData } from "@/lib/services/academy.service";
import { ProgressCard } from "@/components/academy/academy-home/progress-card";

export function AcademyHome({
  data,
}: {
  data: AcademyHomeData;
}) {
  return (
    <div
      className="
        grid h-full min-h-0 min-w-0
        grid-cols-1 grid-rows-6
        gap-4
        lg:grid-cols-[minmax(0,2.35fr)_minmax(250px,0.85fr)]
        lg:grid-rows-[1.75fr_1fr_1fr]
      "
    >
      {/* Fila 1 · izquierda */}
      <ContinueLearningCard
        courses={data.continueLearning}
      />

{/* Fila 1 · derecha */}
<ProgressCard
  progress={data.progressSummary}
/>

      {/* Fila 2 · izquierda */}
      <Placeholder />

      {/* Fila 2 · derecha */}
      <Placeholder />

      {/* Fila 3 · izquierda */}
      <Placeholder />

      {/* Fila 3 · derecha */}
      <Placeholder />
    </div>
  );
}

function Placeholder() {
  return (
    <section
      className="
        min-h-0 min-w-0
        rounded-lg
        border border-dashed border-slate-300
        bg-white
      "
    />
  );
}