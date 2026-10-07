// components/academy/academy-home/academy-home-aside.tsx

import { ProgressCard } from "@/components/academy/academy-home/progress-card";
import { TeamLearningCard } from "@/components/academy/academy-home/team-learning-card";
import { TopRecommendedCard } from "@/components/academy/academy-home/top-recommended-card";

import type { AcademyHomeData } from "@/lib/services/academy.service";

export function AcademyHomeAside({
  data,
}: {
  data: AcademyHomeData;
}) {
  return (
    <>
      <ProgressCard
        progress={data.progressSummary}
      />

      <TopRecommendedCard
        course={data.topRecommended}
      />

      <TeamLearningCard />
    </>
  );
}