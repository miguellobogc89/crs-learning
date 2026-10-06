// components/academy/academy-home.tsx

import { ContinueLearningCard } from "@/components/academy/academy-home/continue-learning-card";
import type { AcademyHomeData } from "@/lib/services/academy.service";

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
        lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]
        lg:grid-rows-3
      "
    >
      {/* Fila 1 · izquierda */}
      <ContinueLearningCard
        courses={data.previewCourses}
      />

      {/* Fila 1 · derecha */}
      <Placeholder />

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