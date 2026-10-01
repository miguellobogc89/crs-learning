import {
  academyRecommendations,
} from "@/components/academy/academy-mock-data";
import {
  ContinueLearningSection,
  PendingTrainingSection,
  RecommendedCoursesSection,
} from "@/components/academy/academy-learning-sections";
import {
  AcademyProgressPanel,
  TeamLearningRequestsPanel,
  WorkBasedRecommendationPanel,
} from "@/components/academy/academy-insight-panels";
import type { AcademyHomeData } from "@/lib/services/academy.service";

export function AcademyHome({ data }: { data: AcademyHomeData }) {
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(18rem,1fr)] 2xl:gap-5">
      <div className="min-w-0 space-y-4 2xl:space-y-5">
        <ContinueLearningSection courses={data.continueLearning} />
        <PendingTrainingSection courses={data.pendingTraining} />
        <RecommendedCoursesSection courses={academyRecommendations.slice(0, 4)} />
      </div>

      <aside className="min-w-0 space-y-4 2xl:space-y-5">
        <AcademyProgressPanel summary={data.progressSummary} />
        <WorkBasedRecommendationPanel />
        <TeamLearningRequestsPanel requests={data.teamRequests} />
      </aside>
    </div>
  );
}
