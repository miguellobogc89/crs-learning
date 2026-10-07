// components/academy/academy-home/academy-home.tsx

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
    <div className="flex min-h-0 min-w-0 flex-col gap-4 pt-3">
      <ContinueLearningCard
        courses={data.continueLearning}
      />

      <PendingTrainingCard
        courses={data.pendingTraining}
      />

      <RecommendedForYouCard
        courses={data.recommendedCourses}
      />
    </div>
  );
}