// app/(app)/my-space/page.tsx
import { auth } from "@/auth";
import {
  AppSectionShell,
} from "@/components/app/section-sidebar";
import { MySpaceDashboard } from "@/components/my-space/my-space-dashboard";
import { listTeams } from "@/lib/services/knowledge-team.service";

export default async function MySpacePage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <MySpaceShell>
        <MySpaceDashboard teams={[]} />
      </MySpaceShell>
    );
  }

  const teams = await listTeams(session.user.id);

  return (
    <MySpaceShell>
      <MySpaceDashboard teams={teams} />
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
