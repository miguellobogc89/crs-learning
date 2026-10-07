// components/academy/academy-home.tsx

import { ContinueLearningCard } from "@/components/academy/academy-home/continue-learning-card";
import { PendingTrainingCard } from "@/components/academy/academy-home/pending-training-card";
import { RecommendedForYouCard } from "@/components/academy/academy-home/recommended-for-you-card";

import type { AcademyHomeData } from "@/lib/services/academy.service";

export function AcademyHome({
  data,
}: {
  data: AcademyHomeData;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 pt-3">
      <div className="shrink-0">
        <ContinueLearningCard
          courses={data.continueLearning}
        />
      </div>

      <div className="shrink-0">
        <PendingTrainingCard
          courses={data.pendingTraining}
        />
      </div>

      <div className="min-h-0 flex-1">
        <RecommendedForYouCard
          courses={data.recommendedCourses}
        />
      </div>
    </div>
  );
}