import { redirect } from "next/navigation";
import { Clock3 } from "lucide-react";

import { auth } from "@/auth";
import {
  AppSectionShell,
} from "@/components/app/section-sidebar";
import {
  DashboardWorkspaceSidebar,
} from "@/components/dashboard/dashboard-workspace-sidebar";
import {
  getActiveWorkspaceContext,
} from "@/lib/services/workspace.service";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { activeWorkspace, workspaces } =
    await getActiveWorkspaceContext(session.user.id);

  return (
    <AppSectionShell
      sidebar={
        <DashboardWorkspaceSidebar
          activeWorkspaceId={activeWorkspace.id}
          userId={session.user.id}
          workspaces={workspaces}
        />
      }
    >
      <main className="h-full overflow-y-auto bg-background">
        <div className="mx-auto max-w-5xl px-8 py-10">
          <header className="max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Inicio
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Accede a tus espacios de trabajo y continua donde lo dejaste.
            </p>
          </header>

          <section className="mt-12 max-w-3xl">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Recientes
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                La actividad reciente de tus espacios aparecera aqui.
              </p>
            </div>

            <div className="rounded-lg border border-dashed border-border bg-panel px-8 py-10">
              <div className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-muted-foreground">
                  <Clock3 className="h-5 w-5" />
                </span>

                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Aqui aparecera tu actividad reciente
                  </h3>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                    Cuando vuelvas a articulos, carpetas o bibliotecas, los
                    accesos mas utiles se mostraran en esta zona.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </AppSectionShell>
  );
}
