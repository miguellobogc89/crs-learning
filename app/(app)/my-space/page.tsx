// app/(app)/my-space/page.tsx
import { auth } from "@/auth";
import Link from "next/link";
import {
  AppSectionShell,
} from "@/components/app/section-sidebar";
import { MySpaceDashboard } from "@/components/my-space/my-space-dashboard";
import { listTeams } from "@/lib/services/knowledge-team.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export default async function MySpacePage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <MySpaceShell>
        <MySpaceDashboard teams={[]} />
      </MySpaceShell>
    );
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );
  const teams = await listTeams({
    userId: session.user.id,
    workspaceId: activeWorkspace.id,
  });

  return (
    <MySpaceShell>
      <MySpaceDashboard
        teams={teams}
        workspaceName={activeWorkspace.name}
      />
    </MySpaceShell>
  );
}

function MySpaceShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppSectionShell
      sidebar={<MySpaceSidebar />}
    >
      {children}
    </AppSectionShell>
  );
}

function MySpaceSidebar() {
  return (
    <div className="space-y-6 p-4">
      <div>
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Mi espacio
        </p>

        <div className="space-y-1">
          <Link
            href="/my-space/workspaces"
            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-surface hover:text-foreground"
          >
            Workspaces
          </Link>

          {[
            "Actividad",
            "Equipos",
            "Cursos",
            "Aportaciones",
          ].map((item) => (
            <button
              key={item}
              type="button"
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-surface hover:text-foreground"
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
