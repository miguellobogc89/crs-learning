// components/academy/academy-home.tsx

import { ContinueLearningCard } from "@/components/academy/academy-home/continue-learning-card";
import { PendingTrainingCard } from "@/components/academy/academy-home/pending-training-card";
import { ProgressCard } from "@/components/academy/academy-home/progress-card";
import { TopRecommendedCard } from "@/components/academy/academy-home/top-recommended-card";
import type { AcademyHomeData } from "@/lib/services/academy.service";
import { RecommendedForYouCard } from "@/components/academy/academy-home/recommended-for-you-card";
import { TeamLearningCard } from "@/components/academy/academy-home/team-learning-card";

export function AcademyHome({
  data,
}: {
  data: AcademyHomeData;
}) {
  return (
    <div
      className="
        flex h-full min-h-0 min-w-0 flex-col
        gap-4
      "
    >
      {/* Fila 1 */}
      <div
        className="
          grid min-w-0 shrink-0
          grid-cols-1 gap-4
          lg:grid-cols-[minmax(0,2.35fr)_minmax(250px,0.85fr)]
        "
      >
        <ContinueLearningCard
          courses={data.continueLearning}
        />

        <ProgressCard
          progress={data.progressSummary}
        />
      </div>

      {/* Fila 2 */}
      <div
        className="
          grid min-w-0 shrink-0
          grid-cols-1 gap-4
          lg:grid-cols-[minmax(0,2.35fr)_minmax(250px,0.85fr)]
        "
      >
        <PendingTrainingCard
          courses={data.pendingTraining}
        />

        <TopRecommendedCard
          course={data.topRecommended}
        />
      </div>

      {/* Fila 3 · ocupa exactamente el espacio restante */}
      <div
        className="
          grid min-h-0 min-w-0 flex-1
          grid-cols-1 gap-4
          lg:grid-cols-[minmax(0,2.35fr)_minmax(250px,0.85fr)]
        "
      >
        <RecommendedForYouCard 
          courses={data.recommendedCourses}
        />
        <TeamLearningCard />
      </div>
    </div>
  );
}

function Placeholder() {
  return (
    <section
      className="
        h-full min-h-0 min-w-0
        rounded-lg
        border border-dashed border-slate-300
        bg-white
      "
    />
  );
}