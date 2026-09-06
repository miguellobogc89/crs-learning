//app/(app)/dashboard/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bot,
  BookOpen,
  Brain,
  Clock3,
  FileText,
  GraduationCap,
  MessageSquareText,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { auth } from "@/auth";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { DashboardWorkspaceSidebar } from "@/components/dashboard/dashboard-workspace-sidebar";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

const quickAccessItems = [
  {
    title: "Knowledge",
    description: "Consulta y organiza el conocimiento",
    href: "/knowledge",
    icon: Brain,
  },
  {
    title: "Asistente",
    description: "Pregunta y trabaja con tu conocimiento",
    href: "/assistant",
    icon: MessageSquareText,
  },
  {
    title: "Cursos",
    description: "Aprende y continúa tus cursos y los de tu organización",
    href: "/courses",
    icon: GraduationCap,
  },
  {
    title: "Equipos",
    description: "Gestiona tus espacios y colaboradores",
    href: "/my-space/workspaces",
    icon: UsersRound,
  },
];

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
        <div className="mx-auto max-w-6xl px-8 py-10">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Inicio
            </h1>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Todo tu conocimiento, aprendizaje y trabajo en un mismo lugar.
            </p>
          </header>

          <section className="mt-10">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Accesos rápidos
              </h2>

              <p className="mt-1 text-xs text-muted-foreground">
                Entra directamente en las áreas que más utilizas.
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5">
                {quickAccessItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.title}
                      href={item.href}
                      className="group relative flex min-h-40 flex-col border-b border-border p-5 transition-colors hover:bg-surface md:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:[&:nth-child(odd)]:border-r xl:[&:nth-child(4)]:border-r"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors group-hover:bg-brand-soft-hover">
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="mt-auto pt-7">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-foreground">
                            {item.title}
                          </h3>

                          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                        </div>

                        <p className="mt-1 max-w-[180px] text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </Link>
                  );
                })}

                <div className="group relative flex min-h-40 flex-col p-5 transition-colors hover:bg-surface">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <Bot className="h-4 w-4" />
                    </div>

                    <span className="rounded-md bg-brand-soft px-2 py-1 text-[10px] font-medium text-brand">
                      Próximamente
                    </span>
                  </div>

                  <div className="mt-auto pt-7">
                    <h3 className="text-sm font-semibold text-foreground">
                      Agentes
                    </h3>

                    <p className="mt-1 max-w-[180px] text-xs leading-5 text-muted-foreground">
                      Automatiza tareas y procesos con agentes personalizados
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-12 grid grid-cols-1 gap-12 xl:grid-cols-[minmax(0,2fr)_minmax(280px,0.85fr)]">
            <section>
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Continuar trabajando
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  Vuelve rápidamente a lo último en lo que estabas trabajando.
                </p>
              </div>

              <div className="overflow-hidden rounded-xl border border-border bg-background">
                <div className="group flex min-h-24 items-center gap-4 border-b border-border px-5 py-4 transition-colors hover:bg-surface">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <FileText className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      Política de vacaciones 2026
                    </h3>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Knowledge · Modificado hace 18 min
                    </p>
                  </div>

                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>

                <div className="group flex min-h-24 items-center gap-4 border-b border-border px-5 py-4 transition-colors hover:bg-surface">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                    <GraduationCap className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      Curso de prevención
                    </h3>

                    <div className="mt-1 flex items-center gap-3">
                      <p className="shrink-0 text-xs text-muted-foreground">
                        Cursos · 64 % completado
                      </p>

                      <div className="hidden h-1 w-24 overflow-hidden rounded-full bg-surface sm:block">
                        <div className="h-full w-[64%] rounded-full bg-brand" />
                      </div>
                    </div>
                  </div>

                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>

                <div className="group flex min-h-24 items-center gap-4 px-5 py-4 transition-colors hover:bg-surface">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                    <MessageSquareText className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      Análisis de contratos
                    </h3>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Asistente · Conversación reciente
                    </p>
                  </div>

                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </section>

            <aside className="space-y-10">
              <section>
                <div className="mb-5">
                  <h2 className="text-sm font-semibold text-foreground">
                    Actividad reciente
                  </h2>
                </div>

                <div className="space-y-5">
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-medium text-muted-foreground">
                      LR
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm leading-5 text-foreground">
                        <span className="font-medium">Laura</span>{" "}
                        <span className="text-muted-foreground">añadió</span>{" "}
                        <span className="font-medium">
                          Manual de siniestros.pdf
                        </span>
                      </p>

                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        hace 22 min
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-medium text-muted-foreground">
                      CM
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm leading-5 text-foreground">
                        <span className="font-medium">Carlos</span>{" "}
                        <span className="text-muted-foreground">actualizó</span>{" "}
                        <span className="font-medium">
                          Procedimiento de reclamaciones
                        </span>
                      </p>

                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        hace 1 h
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-medium text-muted-foreground">
                      EQ
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm leading-5 text-foreground">
                        <span className="font-medium">Equipo</span>{" "}
                        <span className="text-muted-foreground">
                          te añadió a
                        </span>{" "}
                        <span className="font-medium">Comercial</span>
                      </p>

                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        ayer
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="border-t border-border pt-8">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Próximamente
                </p>

                <div className="mt-4 flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <Sparkles className="h-4 w-4" />
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Agentes IA
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Conecta tus herramientas y deja que CRS LAB trabaje por ti.
                    </p>

                    <p className="mt-3 text-xs font-medium text-brand">
                      En preparación
                    </p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </AppSectionShell>
  );
}