// app/(app)/my-space/page.tsx
import { auth } from "@/auth";
import { MySpaceDashboard } from "@/components/my-space/my-space-dashboard";
import { listTeams } from "@/lib/services/knowledge-team.service";

export default async function MySpacePage() {
  const session = await auth();

  if (!session?.user?.id) {
    return <MySpaceDashboard teams={[]} />;
  }

  const teams = await listTeams(session.user.id);

  return <MySpaceDashboard teams={teams} />;
}