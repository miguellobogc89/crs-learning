import {
  academyLearning,
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

export function AcademyHome() {
  const inProgress = academyLearning.filter(
    (course) => course.progress > 0 && course.progress < 100,
  );
  const assigned = academyLearning.filter(
    (course) => course.assignment && course.progress < 100,
  );

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(18rem,1fr)] 2xl:gap-5">
      <div className="min-w-0 space-y-4 2xl:space-y-5">
        <ContinueLearningSection courses={inProgress.slice(0, 3)} />
        <PendingTrainingSection courses={assigned.slice(0, 2)} />
        <RecommendedCoursesSection courses={academyRecommendations.slice(0, 4)} />
      </div>

      <aside className="min-w-0 space-y-4 2xl:space-y-5">
        <AcademyProgressPanel />
        <WorkBasedRecommendationPanel />
        <TeamLearningRequestsPanel />
      </aside>
    </div>
  );
}
