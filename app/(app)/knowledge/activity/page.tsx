// app/(app)/knowledge/activity/page.tsx

import { auth } from "@/auth";
import { KnowledgeActivityView } from "@/components/knowledge/activity/knowledge-activity-view";
import { KnowledgeMapView } from "@/components/knowledge/activity/knowledge-map-view";
import { listKnowledgeStatus } from "@/lib/services/knowledge-library.service";
import { listKnowledgeEvents } from "@/lib/services/knowledge.service";

type KnowledgeActivityPageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

export default async function KnowledgeActivityPage({
  searchParams,
}: KnowledgeActivityPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const params = await searchParams;
  const activeView =
    params?.view === "status"
      ? "status"
      : "activity";

  const [events, knowledgeStatus] = await Promise.all([
    listKnowledgeEvents(session.user.id),
    listKnowledgeStatus(session.user.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl p-8">
      {activeView === "status" ? (
        <KnowledgeMapView
          knowledgeStatus={knowledgeStatus}
        />
      ) : (
        <KnowledgeActivityView
          events={events}
        />
      )}
    </div>
  );
}